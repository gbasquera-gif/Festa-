import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MercadoPagoGateway } from "./mercadopago-gateway.service";

/**
 * O SDK oficial de verdade, com a rede trocada por um `fetch` controlado:
 * o que se testa é o tempo limite e o número de tentativas que chegam ao
 * Mercado Pago.
 */
describe("consulta ao Mercado Pago (P4)", () => {
  const fetchOriginal = globalThis.fetch;
  let chamadas: { url: string }[];

  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = "TEST-token-falso-de-teste";
    chamadas = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    delete process.env.MP_ACCESS_TOKEN;
    vi.useRealTimers();
  });

  /** Um Mercado Pago que nunca responde: só termina quando a chamada é abortada. */
  function provedorMudo() {
    globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url) });
      return new Promise<Response>((_, rejeitar) => {
        init?.signal?.addEventListener("abort", () => rejeitar(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }) as typeof fetch;
  }

  /** Um Mercado Pago com erro 500 em toda chamada. */
  function provedorComErro() {
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      chamadas.push({ url: String(url) });
      return new Response(JSON.stringify({ status: 500, message: "erro" }), { status: 500 });
    }) as typeof fetch;
  }

  it("consulta rápida desiste em 5 s, numa tentativa só", async () => {
    provedorMudo();
    const consulta = new MercadoPagoGateway().consultarPagamento("123", { rapida: true });
    const resultado = consulta.then(
      () => "respondeu",
      (e: { name?: string }) => e?.name ?? "erro",
    );

    await vi.advanceTimersByTimeAsync(4_999);
    expect(chamadas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await resultado).toBe("AbortError");

    // Nada de nova tentativa depois do tempo esgotado.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(chamadas).toHaveLength(1);
  });

  it("consulta rápida não repete erro 500", async () => {
    provedorComErro();
    await expect(new MercadoPagoGateway().consultarPagamento("123", { rapida: true })).rejects.toMatchObject({
      status: 500,
    });
    expect(chamadas).toHaveLength(1);
  });

  it("a busca por referência rápida também é uma tentativa só", async () => {
    provedorComErro();
    await expect(new MercadoPagoGateway().buscarPorReferencia("cobranca-1", { rapida: true })).rejects.toMatchObject({
      status: 500,
    });
    expect(chamadas).toHaveLength(1);
  });

  it("fora do webhook a consulta segue o padrão do SDK (repete o 500)", async () => {
    provedorComErro();
    const consulta = new MercadoPagoGateway().consultarPagamento("123").catch((e: { status?: number }) => e?.status);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await consulta).toBe(500);
    expect(chamadas.length).toBeGreaterThan(1);
  });

  it("404 é resposta (pagamento inexistente), não falha", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status: 404 }), { status: 404 })) as typeof fetch;
    await expect(new MercadoPagoGateway().consultarPagamento("999", { rapida: true })).resolves.toBeNull();
  });

  it("devolve só os campos da conferência", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 555,
            external_reference: "cobranca-1",
            status: "approved",
            transaction_amount: 105,
            transaction_amount_refunded: 0,
            currency_id: "BRL",
            live_mode: true,
            payer: { email: "nao-deve-sair@exemplo.invalid" },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;
    expect(await new MercadoPagoGateway().consultarPagamento("555", { rapida: true })).toEqual({
      id: "555",
      referencia: "cobranca-1",
      status: "approved",
      valor: 105,
      valorEstornado: 0,
      moeda: "BRL",
      producao: true,
    });
  });
});
