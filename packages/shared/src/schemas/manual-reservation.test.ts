import { describe, expect, it } from "vitest";
import {
  descontoEmbutido,
  editarReservaSchema,
  totalDaVendaManual,
} from "./manual-reservation";

/**
 * O par `totalDaVendaManual` / `descontoEmbutido` é o que faz a edição
 * reabrir com o preço que foi vendido. Se as duas discordarem, cada abertura
 * do formulário reajusta a festa de uma cliente que já fechou negócio — por
 * isso o teste é sobre a ida e a volta, não sobre cada uma isolada.
 */
describe("desconto na ida e na volta", () => {
  const casos = [
    { valorProdutos: 800, entrega: 50, montagem: 50, desconto: 0 },
    { valorProdutos: 800, entrega: 50, montagem: 50, desconto: 100 },
    { valorProdutos: 1234.56, entrega: 0, montagem: 50, desconto: 34.56 },
    { valorProdutos: 0, entrega: 0, montagem: 0, desconto: 0 },
    // Desconto maior que o pedido: o total trava em zero, e a volta devolve
    // o desconto que de fato foi aplicado, não o que foi digitado.
    { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 250 },
  ];

  for (const caso of casos) {
    it(`${caso.valorProdutos} + ${caso.entrega} + ${caso.montagem} - ${caso.desconto}`, () => {
      const total = totalDaVendaManual(caso);
      const volta = descontoEmbutido({ ...caso, total });

      // O total reconstruído com o desconto da volta é o mesmo total.
      expect(totalDaVendaManual({ ...caso, desconto: volta })).toBe(total);
      expect(volta).toBe(Math.min(caso.desconto, caso.valorProdutos + caso.entrega + caso.montagem));
    });
  }

  it("nunca devolve desconto negativo", () => {
    expect(descontoEmbutido({ valorProdutos: 100, total: 500 })).toBe(0);
  });

  it("não deixa centavo escapar no arredondamento", () => {
    const total = totalDaVendaManual({ valorProdutos: 199.99, entrega: 0.01, desconto: 0 });
    expect(total).toBe(200);
    expect(descontoEmbutido({ valorProdutos: 199.99, entrega: 0.01, total })).toBe(0);
  });
});

describe("editarReservaSchema", () => {
  const base = {
    cliente: { nome: "Maria", telefone: "49999990000" },
    evento: { data: "2026-10-10", tipo: "ANIVERSARIO" },
    produtos: { itens: [] },
    logistica: { fulfillment: "PICKUP" },
    financeiro: { valorProdutos: 800 },
  };

  it("aceita reserva sem origem: a que nasceu na loja já tem canal gravado", () => {
    const r = editarReservaSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.origem).toBeUndefined();
  });

  it("aceita WEB como origem — o canal da loja, que a reserva manual não oferece", () => {
    expect(editarReservaSchema.safeParse({ ...base, origem: "WEB" }).success).toBe(true);
  });

  /**
   * O bloco financeiro da edição não fala em pagamento. Um `sinal` enviado
   * junto é ignorado em vez de gravado: é a garantia, no próprio formato dos
   * dados, de que nenhum caminho da edição reescreve dinheiro recebido.
   */
  it("descarta sinal e situação do pagamento", () => {
    const r = editarReservaSchema.parse({
      ...base,
      financeiro: { valorProdutos: 800, sinal: 400, statusPagamento: "PAID" },
    });
    expect(r.financeiro).not.toHaveProperty("sinal");
    expect(r.financeiro).not.toHaveProperty("statusPagamento");
    expect(r.financeiro).toEqual({ valorProdutos: 800, entrega: 0, montagem: 0, desconto: 0 });
  });

  it("continua exigindo telefone: é por ele que a festa se confirma no dia", () => {
    const r = editarReservaSchema.safeParse({
      ...base,
      cliente: { nome: "Maria", telefone: "" },
    });
    expect(r.success).toBe(false);
  });
});
