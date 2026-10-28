import { describe, expect, it } from "vitest";
import { dataBrasileira, emailDeContas, emailDoCodigo } from "./mensagem";
import { FalhaNoEnvio, TransporteResend, transporteDoAmbiente } from "./transporte";

describe("texto do e-mail de contas", () => {
  const base = { para: "financeiro@exemplo.invalid", hoje: "2026-11-03", painel: "https://painel.exemplo.invalid" };

  it("uma conta: assunto com o prazo, sem a descrição; corpo com descrição, prazo e data", () => {
    const e = emailDeContas({ ...base, mostrarValor: false, contas: [{ descricao: "Aluguel do galpão", vencimento: "2026-11-10", valor: 1500 }] });
    expect(e.assunto).toBe("Festaê · conta a pagar vence em 7 dias");
    expect(e.texto).toContain("• Aluguel do galpão — vence em 7 dias (10/11/2026)");
    expect(e.texto).not.toContain("R$");
    expect(e.texto).toContain("https://painel.exemplo.invalid/financeiro?aba=contas");
  });

  it("valor só com a opção ligada", () => {
    const e = emailDeContas({ ...base, mostrarValor: true, contas: [{ descricao: "Energia", vencimento: "2026-11-03", valor: 312.4 }] });
    expect(e.texto).toContain("• Energia — vence hoje (03/11/2026) — R$ 312,40");
  });

  it("várias contas: ordenadas pelo vencimento, assunto com a contagem", () => {
    const e = emailDeContas({
      ...base,
      mostrarValor: false,
      contas: [
        { descricao: "Internet", vencimento: "2026-11-06", valor: 120 },
        { descricao: "Água", vencimento: "2026-11-02", valor: 90 },
      ],
    });
    expect(e.assunto).toBe("Festaê · 2 contas a pagar pedem atenção");
    expect(e.texto.indexOf("Água")).toBeLessThan(e.texto.indexOf("Internet"));
    expect(e.texto).toContain("venceu ontem");
  });

  it("descrição com quebra de linha não vira outra linha do e-mail", () => {
    const e = emailDeContas({ ...base, mostrarValor: false, contas: [{ descricao: "Conta\nBcc: alguem@x\r\nfalsa", vencimento: "2026-11-10", valor: 1 }] });
    const linha = e.texto.split("\n").find((l) => l.startsWith("• "));
    expect(linha).toBe("• Conta Bcc: alguem@x falsa — vence em 7 dias (10/11/2026)");
  });

  it("sem endereço do painel, diz o caminho em vez do link", () => {
    const e = emailDeContas({ ...base, painel: null, mostrarValor: false, contas: [{ descricao: "X", vencimento: "2026-11-10", valor: 1 }] });
    expect(e.texto).toContain("Financeiro › Contas a pagar");
    expect(e.texto).not.toContain("http");
  });

  it("código: só o código e a validade", () => {
    const e = emailDoCodigo("a@exemplo.invalid", "042917", 30);
    expect(e.texto).toContain("042917");
    expect(e.texto).toContain("30 minutos");
    expect(e.assunto).not.toContain("042917");
    expect(dataBrasileira("2028-02-29")).toBe("29/02/2028");
  });
});

describe("transporte Resend", () => {
  const email = { para: "a@exemplo.invalid", assunto: "Assunto", texto: "Texto" };
  const resposta = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

  it("manda a chave de idempotência e a autorização nos cabeçalhos; só texto no corpo", async () => {
    let pedido: { url: string; init: RequestInit } | null = null;
    const t = new TransporteResend("re_chave_secreta", "Festaê <avisos@exemplo.invalid>", (async (url: string, init: RequestInit) => {
      pedido = { url, init };
      return resposta(200, { id: "msg_123" });
    }) as typeof fetch);
    expect(await t.enviar(email, "envio_abc")).toEqual({ idNoProvedor: "msg_123" });
    const headers = pedido!.init.headers as Record<string, string>;
    expect(pedido!.url).toBe("https://api.resend.com/emails");
    expect(headers["Idempotency-Key"]).toBe("envio_abc");
    expect(headers.Authorization).toBe("Bearer re_chave_secreta");
    expect(JSON.parse(String(pedido!.init.body))).toEqual({
      from: "Festaê <avisos@exemplo.invalid>",
      to: ["a@exemplo.invalid"],
      subject: "Assunto",
      text: "Texto",
    });
  });

  it("classifica as falhas: 5xx, 429 e concorrência repetem; 4xx não", async () => {
    const com = (status: number, name: string) =>
      new TransporteResend("re_x", "r@x", (async () => resposta(status, { name, message: "detalhe com dado" })) as typeof fetch);
    const falha = async (t: TransporteResend): Promise<FalhaNoEnvio> =>
      t.enviar(email, "k").then(
        () => {
          throw new Error("deveria ter falhado");
        },
        (e: FalhaNoEnvio) => e,
      );
    const f503 = await falha(com(503, "internal_server_error"));
    expect(f503).toMatchObject({ motivo: "HTTP 503 internal_server_error", repetivel: true });
    expect((await falha(com(429, "rate_limit_exceeded"))).repetivel).toBe(true);
    expect((await falha(com(409, "concurrent_idempotent_requests"))).repetivel).toBe(true);
    expect((await falha(com(409, "invalid_idempotent_request"))).repetivel).toBe(false);
    const f422 = await falha(com(422, "validation_error"));
    expect(f422).toMatchObject({ motivo: "HTTP 422 validation_error", repetivel: false });
    // A mensagem do provedor não entra no motivo guardado.
    expect(f422.motivo).not.toContain("detalhe");
  });

  it("rede e tempo esgotado repetem; a chave de acesso nunca aparece no erro", async () => {
    const tempo = new TransporteResend("re_segredo", "r@x", (async () => {
      throw Object.assign(new Error("re_segredo timeout"), { name: "TimeoutError" });
    }) as typeof fetch);
    const e = (await tempo.enviar(email, "k").catch((x: FalhaNoEnvio) => x)) as FalhaNoEnvio;
    expect(e).toMatchObject({ motivo: "tempo esgotado", repetivel: true });
    expect(JSON.stringify(e)).not.toContain("re_segredo");
    expect(String(e.message)).not.toContain("re_segredo");
  });
});

describe("transporte escolhido pelo ambiente", () => {
  it("sem configuração: e-mail desligado, com motivo", () => {
    expect(transporteDoAmbiente({})).toEqual({ transporte: null, motivo: "Envio de e-mail não configurado." });
  });
  it("Resend sem chave ou sem remetente: desligado", () => {
    expect(transporteDoAmbiente({ AVISOS_EMAIL_PROVEDOR: "resend", RESEND_API_KEY: "x" }).transporte).toBeNull();
    expect(transporteDoAmbiente({ AVISOS_EMAIL_PROVEDOR: "resend", AVISOS_EMAIL_REMETENTE: "r@x" }).transporte).toBeNull();
    expect(transporteDoAmbiente({ AVISOS_EMAIL_PROVEDOR: "resend", RESEND_API_KEY: "x", AVISOS_EMAIL_REMETENTE: "r@x" }).transporte?.nome).toBe("resend");
  });
  it("o transporte de teste é recusado em produção", () => {
    const r = transporteDoAmbiente({ AVISOS_EMAIL_PROVEDOR: "arquivo", AVISOS_EMAIL_DIRETORIO: "/tmp/x", NODE_ENV: "production" });
    expect(r.transporte).toBeNull();
    expect(r.motivo).toContain("produção");
  });
});
