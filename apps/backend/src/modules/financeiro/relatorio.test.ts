import { describe, expect, it, vi } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import type { ContratoApurado, GastoApurado } from "@festae/shared";

/**
 * O Prisma de mentira: responde às duas leituras do Financeiro sobre o
 * mesmo conjunto de reservas, aplicando os filtros que a consulta pede
 * (status vigente, pagamento PAID). É o que deixa comparar o relatório com
 * o `panorama` pelo serviço de verdade, sem banco.
 */
type Pagamento = { status: string; amount: number; paidAt: Date | null };
type Reserva = { id: string; festa: string; total: number; status?: string; cancelada?: boolean; pagamentos?: Pagamento[] };
const banco = vi.hoisted(() => ({ reservas: [] as unknown[], gastos: [] as unknown[] }));

vi.mock("@festae/database", () => ({
  prisma: {
    reservation: {
      findMany: async (args: { where?: { status?: { in: string[] } }; select: { order: { select: { payments: { where?: { status: string } } } } } }) => {
        const filtroDoPagamento = args.select.order.select.payments.where?.status;
        return (banco.reservas as Reserva[])
          .filter((r) => !args.where?.status || args.where.status.in.includes(r.status ?? "CONFIRMED"))
          .map((r, i) => ({
            id: r.id,
            contractSeq: i + 1,
            status: r.status ?? "CONFIRMED",
            eventDate: new Date(`${r.festa}T12:00:00.000Z`),
            requestedAt: new Date("2026-01-05T12:00:00.000Z"),
            confirmedAt: new Date("2026-01-05T12:00:00.000Z"),
            cancelledAt: r.cancelada ? new Date("2026-02-01T12:00:00.000Z") : null,
            rescheduledFrom: null,
            origemDoRegistro: "PAINEL",
            referenciaExterna: null,
            order: {
              total: r.total,
              fulfillment: "PICKUP",
              assembly: false,
              kit: null,
              event: { city: "Chapecó", saleChannel: "WHATSAPP", guestCount: null, type: "ANIVERSARIO", theme: null, user: { name: "Cliente", email: null, phone: null } },
              payments: (r.pagamentos ?? [])
                .filter((p) => !filtroDoPagamento || p.status === filtroDoPagamento)
                .map((p, j) => ({ id: `p${i}-${j}`, type: "DEPOSIT", method: "PIX", status: p.status, amount: p.amount, paidAt: p.paidAt })),
            },
          }));
      },
    },
    gasto: { findMany: async () => banco.gastos },
    metaMensal: { findUnique: async () => null },
  },
}));

import { FinanceiroService } from "./financeiro.service";
import { FinanceiroController, periodoDoPanorama } from "./financeiro.controller";
import { montarRelatorioExecutivo, momentoEmChapeco, nomeDoMes } from "./relatorio";
import { gerarRelatorioPdf, nomeDoArquivo, percentual, reais, variacaoEmTexto } from "./relatorio-pdf";
import { RolesGuard } from "../../common/guards/roles.guard";

const AGORA = new Date("2026-09-23T15:00:00.000Z");

const contrato = (festa: string, valor: number, recebido: number[] = [], cancelado = false): ContratoApurado => ({
  fechadoEm: new Date("2026-01-05T12:00:00.000Z"),
  festaEm: new Date(`${festa}T12:00:00.000Z`),
  valor,
  cancelado,
  recebimentos: recebido.map((v) => ({ valor: v, recebidoEm: new Date("2026-02-01T12:00:00.000Z") })),
});
const gasto = (natureza: GastoApurado["natureza"], valor: number, pagoEm: string): GastoApurado => ({
  natureza,
  valor,
  pagoEm: new Date(`${pagoEm}T15:00:00.000Z`),
});

const CONTRATOS = [
  contrato("2025-11-15", 700, [700]), // primeira competência
  contrato("2026-03-10", 1000, [300]),
  contrato("2026-08-20", 800, [800]),
  contrato("2026-09-05", 1500, [500]),
  contrato("2026-09-27", 900),
  contrato("2026-09-12", 5000, [5000], true), // cancelada: fora de tudo
  contrato("2026-10-15", 2000, [2400]), // futura, recebeu a mais
];
const GASTOS = [
  gasto("CONSUMO", 200, "2026-09-10"),
  gasto("CUSTEIO", 150.5, "2026-09-02"),
  gasto("ACERVO", 1200, "2026-09-03"),
  gasto("CONSUMO", 100, "2026-08-10"),
];

const relatorio = (mes = "2026-09", contratos = CONTRATOS, gastos = GASTOS) =>
  montarRelatorioExecutivo({ contratos, gastos, carteira: [], ano: Number(mes.slice(0, 4)), mes, agora: AGORA });

describe("faturamento por competência", () => {
  const r = relatorio();
  it("do mês, sem a cancelada", () => {
    expect(r.faturamento.mes).toBe(2400);
    expect(r.faturamento.festasNoMes).toBe(2);
  });
  it("acumulado no ano: janeiro até o mês", () => {
    expect(r.faturamento.ano).toBe(1000 + 800 + 2400);
  });
  it("acumulado total: desde a primeira competência existente até o mês", () => {
    expect(r.faturamento.total).toBe(700 + 1000 + 800 + 2400);
    expect(r.faturamento.desde).toBe("2025-11");
  });
  it("festa de mês posterior não entra no acumulado", () => {
    expect(relatorio("2026-10").faturamento.total).toBe(700 + 1000 + 800 + 2400 + 2000);
  });
});

describe("resultado operacional", () => {
  const r = relatorio();
  it("despesas são só consumo + custeio; acervo separado", () => {
    expect(r.resultado.despesas).toBe(350.5);
    expect(r.acervoNoMes).toBe(1200);
  });
  it("resultado = faturamento − despesas; margem sobre o faturamento", () => {
    expect(r.resultado.resultado).toBe(2049.5);
    expect(r.resultado.margem).toBeCloseTo(2049.5 / 2400);
  });
  it("faturamento zero: margem nula, exibida como —", () => {
    const vazio = relatorio("2026-05");
    expect(vazio.resultado.faturamento).toBe(0);
    expect(vazio.resultado.margem).toBeNull();
    expect(percentual(vazio.resultado.margem)).toBe("—");
  });
});

describe("recebimentos da carteira ativa", () => {
  const r = relatorio();
  it("recebido e a receber sem a cancelada; saldo nunca negativo", () => {
    expect(r.recebimentos.contratado).toBe(700 + 1000 + 800 + 1500 + 900 + 2000);
    expect(r.recebimentos.recebido).toBe(700 + 300 + 800 + 500 + 2400);
    expect(r.recebimentos.aReceber).toBe(700 + 1000 + 900); // o contrato de outubro não fica negativo
  });
  it("índice não passa de 100% e separa o recebido a mais", () => {
    expect(r.recebimentos.indice).toBeCloseTo((6900 - 2600) / 6900);
    expect(r.recebimentos.recebidoAlemDoContratado).toBe(400);
  });
});

describe("comparação com o mês anterior", () => {
  it("variação quando há base", () => {
    const r = relatorio();
    expect(r.comparacao.mesAnterior).toBe("2026-08");
    expect(r.comparacao.faturamento.percentual).toBeCloseTo((2400 - 800) / 800);
    expect(variacaoEmTexto(r.comparacao.faturamento.percentual)).toBe("+200,0%");
  });
  it("mês anterior zerado: sem percentual", () => {
    const r = relatorio("2026-03");
    expect(r.comparacao.faturamento.percentual).toBeNull();
    expect(variacaoEmTexto(r.comparacao.faturamento.percentual)).toBe("—");
  });
});

describe("mês sem movimento", () => {
  it("zeros e nulos, sem quebrar", async () => {
    const r = montarRelatorioExecutivo({ contratos: [], gastos: [], carteira: [], ano: 2026, mes: "2026-01", agora: AGORA });
    expect(r.faturamento).toMatchObject({ mes: 0, ano: 0, total: 0, desde: null });
    expect(r.recebimentos.indice).toBeNull();
    const { pdf, paginas, semGlifo } = await gerarRelatorioPdf(r);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(paginas).toBe(1);
    expect(semGlifo).toEqual([]);
  });
});

describe("formatação em português", () => {
  it("dinheiro, percentual, datas e mês", () => {
    expect(reais(1234567.8)).toBe("R$ 1.234.567,80");
    expect(reais(-416.49)).toBe("−R$ 416,49");
    expect(percentual(0.8267)).toBe("82,7%");
    expect(variacaoEmTexto(-0.031)).toBe("−3,1%");
    expect(nomeDoMes("2026-03")).toBe("Março de 2026");
    // 02h UTC do dia 26 ainda é 23h do dia 25 em Chapecó.
    expect(momentoEmChapeco(new Date("2026-09-26T02:05:00.000Z"))).toBe("25/09/2026 às 23:05");
    expect(nomeDoArquivo("2026-09")).toBe("Festae-Relatorio-Financeiro-2026-09.pdf");
  });
});

describe("o PDF", () => {
  it("é um PDF A4 de uma página, não vazio, com todos os indicadores e sem caractere faltando", async () => {
    const r = relatorio();
    const { pdf, textos, semGlifo, paginas } = await gerarRelatorioPdf(r);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
    expect(pdf.length).toBeGreaterThan(20_000);
    expect(paginas).toBe(1);
    expect(pdf.toString("latin1")).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(semGlifo).toEqual([]);

    const tudo = textos.join("\n");
    for (const esperado of [
      "Período: Setembro de 2026",
      "FATURAMENTO BRUTO DO MÊS",
      "FATURAMENTO ACUMULADO NO ANO",
      "FATURAMENTO ACUMULADO TOTAL",
      "RESULTADO OPERACIONAL",
      "MARGEM OPERACIONAL",
      "DESPESAS OPERACIONAIS DO MÊS",
      "TOTAL RECEBIDO",
      "TOTAL A RECEBER",
      "ÍNDICE DE RECEBIMENTO",
      "INVESTIMENTO EM ACERVO NO MÊS",
      "CARTEIRA FUTURA · PRÓXIMOS 30 DIAS",
      reais(r.faturamento.mes),
      reais(r.faturamento.ano),
      reais(r.faturamento.total),
      reais(r.resultado.resultado),
      percentual(r.resultado.margem),
      reais(r.resultado.despesas),
      reais(r.recebimentos.recebido),
      reais(r.recebimentos.aReceber),
      reais(r.acervoNoMes),
    ]) {
      expect(tudo).toContain(esperado);
    }
    // "Lucro líquido" só aparece para dizer que o resultado NÃO é isso.
    expect(textos.filter((t) => /lucro líquido/i.test(t))).toEqual([
      "Resultado operacional não é lucro líquido: não considera impostos, pró-labore nem depreciação. Investimento em acervo não entra nesta conta.",
    ]);
  });
});

describe("reconciliação com a Visão Geral (pelo serviço, mesmo conjunto)", () => {
  const PAGO = (valor: number): Pagamento => ({ status: "PAID", amount: valor, paidAt: new Date("2026-09-01T15:00:00.000Z") });
  banco.reservas = [
    { id: "a", festa: "2026-08-20", total: 800, pagamentos: [PAGO(800)] },
    { id: "b", festa: "2026-09-05", total: 1500, pagamentos: [PAGO(500), { status: "PENDING", amount: 700, paidAt: null }, { status: "FAILED", amount: 300, paidAt: null }] },
    { id: "c", festa: "2026-09-27", total: 900 },
    { id: "d", festa: "2026-09-12", total: 5000, status: "CANCELLED", cancelada: true, pagamentos: [PAGO(5000)] },
    { id: "e", festa: "2026-10-05", total: 2000, pagamentos: [PAGO(400), { status: "PENDING", amount: 1600, paidAt: null }] },
  ] satisfies Reserva[];
  banco.gastos = [
    { valor: 200, natureza: "CONSUMO", pagoEm: new Date("2026-09-10T15:00:00.000Z") },
    { valor: 1200, natureza: "ACERVO", pagoEm: new Date("2026-09-03T15:00:00.000Z") },
  ];
  const servico = new FinanceiroService();

  it("mesmo faturamento, acumulado, resultado, margem, a receber e comparação do panorama", async () => {
    vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
    try {
      const [p, r] = await Promise.all([servico.panorama(2026, "2026-09"), servico.relatorioExecutivo(2026, "2026-09")]);
      expect(r.faturamento.mes).toBe(p.operacional.faturamento);
      expect(r.faturamento.ano).toBe(p.ytd.faturamento);
      expect(r.resultado).toEqual(p.operacional);
      expect(r.recebimentos.aReceber).toBe(p.aReceber);
      expect(r.comparacao.faturamento).toEqual(p.comparacao.faturamento);
      expect(r.comparacao.resultado).toEqual(p.comparacao.resultado);
      expect(r.faturamento.mes).toBe(2400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recebido conta só PAID; PENDING e FAILED ficam fora", async () => {
    const r = await servico.relatorioExecutivo(2026, "2026-09");
    expect(r.recebimentos.recebido).toBe(800 + 500 + 400);
    expect(r.recebimentos.aReceber).toBe(1000 + 900 + 1600);
  });

  it("carteira futura da mesma conta da Visão Geral Comercial (só PAID)", async () => {
    vi.useFakeTimers({ now: AGORA, toFake: ["Date"] });
    try {
      const r = await servico.relatorioExecutivo(2026, "2026-09");
      expect(r.carteiraFutura).toMatchObject({ de: "2026-09-23", dias: 30, festas: 2, contratado: 2900, recebido: 400, aReceber: 2500 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("o PDF gerado pelo serviço traz os números do panorama", async () => {
    const p = await servico.panorama(2026, "2026-09");
    const r = await servico.relatorioExecutivo(2026, "2026-09");
    const { textos } = await gerarRelatorioPdf(r);
    expect(textos).toContain(reais(p.operacional.faturamento));
    expect(textos).toContain(reais(p.ytd.faturamento));
    expect(textos).toContain(reais(p.aReceber));
  });
});

describe("permissões", () => {
  const guarda = new RolesGuard(new Reflector());
  const contexto = (role: string) =>
    ({
      getHandler: () => FinanceiroController.prototype.relatorioPdf,
      getClass: () => FinanceiroController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;

  it("ADMIN pode gerar; OPS e CUSTOMER não", () => {
    expect(guarda.canActivate(contexto("ADMIN"))).toBe(true);
    expect(guarda.canActivate(contexto("OPS"))).toBe(false);
    expect(guarda.canActivate(contexto("CUSTOMER"))).toBe(false);
  });

  it("o período do relatório é lido como o do panorama", () => {
    expect(periodoDoPanorama("2026-09", "2026")).toEqual({ ano: 2026, mes: "2026-09" });
  });
});
