import { describe, expect, it } from "vitest";
import { decidirCorrecao, type SituacaoParaCorrecao } from "./correcao-de-pagamento";

/** Pedido de R$ 1.000,00 com um Pix manual de R$ 200,00 e nada mais. */
const base = (mudar: Partial<SituacaoParaCorrecao> = {}, pagamento: Partial<SituacaoParaCorrecao["pagamento"]> = {}): SituacaoParaCorrecao => ({
  pagamento: {
    status: "PAID",
    externalReference: null,
    aposCancelamento: false,
    valor: 200,
    recebidoEm: new Date("2026-10-12T12:00:00Z"),
    ...pagamento,
  },
  reservaCancelada: false,
  outrosRecebidosEmCentavos: 0,
  creditoEmCentavos: 0,
  totalEmCentavos: 100_000,
  agora: new Date("2026-10-21T15:00:00Z"),
  ...mudar,
});
const just = "Pix lançado com valor errado, conferido no extrato.";

describe("correção de pagamento", () => {
  it("corrige o valor, guardando o antes e o depois", () => {
    const d = decidirCorrecao(base(), { acao: "CORRIGIR", novoValor: 250, justificativa: just });
    expect(d).toMatchObject({ ok: true, acao: "CORRECAO", dados: { amount: 250 }, antes: { valor: 200 }, depois: { valor: 250 } });
  });

  it("corrige a data para o dia em que o dinheiro caiu (meio-dia UTC)", () => {
    const d = decidirCorrecao(base(), { acao: "CORRIGIR", novaData: "2026-10-10", justificativa: just });
    expect(d.ok && d.dados.paidAt?.toISOString()).toBe("2026-10-10T12:00:00.000Z");
  });

  it("anula: vira ANULADO, não é apagado", () => {
    expect(decidirCorrecao(base(), { acao: "ANULAR", justificativa: just })).toMatchObject({
      ok: true,
      acao: "ANULACAO",
      dados: { status: "ANULADO" },
    });
  });

  it("não deixa o pedido passar do total (contando outros recebidos e crédito)", () => {
    const d = decidirCorrecao(base({ outrosRecebidosEmCentavos: 60_000, creditoEmCentavos: 10_000 }), {
      acao: "CORRIGIR",
      novoValor: 300.01,
      justificativa: just,
    });
    expect(d).toMatchObject({ ok: false });
    expect(decidirCorrecao(base({ outrosRecebidosEmCentavos: 60_000, creditoEmCentavos: 10_000 }), {
      acao: "CORRIGIR",
      novoValor: 300,
      justificativa: just,
    })).toMatchObject({ ok: true });
  });

  it("recusa: Mercado Pago, não recebido, reserva cancelada, pagamento após cancelamento, data futura, valor igual", () => {
    expect(decidirCorrecao(base({}, { externalReference: "mp-123" }), { acao: "ANULAR", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base({}, { status: "PENDING" }), { acao: "ANULAR", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base({}, { status: "ANULADO" }), { acao: "ANULAR", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base({ reservaCancelada: true }), { acao: "ANULAR", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base({}, { aposCancelamento: true }), { acao: "ANULAR", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base(), { acao: "CORRIGIR", novaData: "2026-10-30", justificativa: just })).toMatchObject({ ok: false });
    expect(decidirCorrecao(base(), { acao: "CORRIGIR", novoValor: 200, justificativa: just })).toMatchObject({ ok: false });
  });
});
