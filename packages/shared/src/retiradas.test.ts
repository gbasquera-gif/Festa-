import { describe, expect, it } from "vitest";
import {
  fluxoDeCaixaDoAno,
  fluxoDeCaixaDoMes,
  mesDaRetirada,
  retiradasDoAno,
  retiradasDoMes,
  retiradasNoHistorico,
  retiradasPorSocio,
  type RetiradaApurada,
} from "./retiradas";
import {
  acumuladoNoAno,
  indicadoresDoMes,
  resultadoOperacionalDoMes,
  serieDoAno,
  type ContratoApurado,
  type GastoApurado,
} from "./financeiro";
import { conferirPixDaAprovacao } from "./orcamento";

/** Valores inventados: os números da Festaê não entram no repositório, que é público. */
const dia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

const retirada = (
  socioId: string,
  categoria: RetiradaApurada["categoria"],
  valor: number,
  quando: string,
  estornada = false,
): RetiradaApurada => ({ socioId, categoria, valor, retiradaEm: dia(quando), estornada });

const RETIRADAS: RetiradaApurada[] = [
  retirada("A", "DISTRIBUICAO_DE_LUCROS", 1000, "2026-10-05"),
  retirada("B", "DISTRIBUICAO_DE_LUCROS", 1500, "2026-10-15"),
  retirada("A", "PRO_LABORE", 800.1, "2026-10-31"),
  retirada("B", "DEVOLUCAO_DE_APORTE", 300, "2026-09-01"),
  retirada("A", "DISTRIBUICAO_DE_LUCROS", 999.99, "2026-10-20", true), // estornada
  retirada("A", "DISTRIBUICAO_DE_LUCROS", 400, "2025-12-31"),
  retirada("B", "PRO_LABORE", 200, "2026-11-01"),
];

describe("retiradas dos sócios", () => {
  it("o mês da retirada é o dia gravado, inclusive no 1º e no último dia", () => {
    expect(mesDaRetirada(dia("2026-10-01"))).toBe("2026-10");
    expect(mesDaRetirada(dia("2026-10-31"))).toBe("2026-10");
  });

  it("retiradas do mês, por categoria, sem as estornadas", () => {
    expect(retiradasDoMes(RETIRADAS, "2026-10")).toEqual({
      DISTRIBUICAO_DE_LUCROS: 2500,
      PRO_LABORE: 800.1,
      DEVOLUCAO_DE_APORTE: 0,
      total: 3300.1,
    });
    expect(retiradasDoMes(RETIRADAS, "2026-09").total).toBe(300);
    expect(retiradasDoMes(RETIRADAS, "2026-08").total).toBe(0);
  });

  it("acumulado do ano até o mês, e o ano inteiro", () => {
    expect(retiradasDoAno(RETIRADAS, 2026, "2026-10").total).toBe(3600.1);
    expect(retiradasDoAno(RETIRADAS, 2026).total).toBe(3800.1);
    expect(retiradasDoAno(RETIRADAS, 2025).total).toBe(400);
  });

  it("histórico inteiro, desde o primeiro registro", () => {
    expect(retiradasNoHistorico(RETIRADAS)).toEqual({
      DISTRIBUICAO_DE_LUCROS: 2900,
      PRO_LABORE: 1000.1,
      DEVOLUCAO_DE_APORTE: 300,
      total: 4200.1,
    });
  });

  it("por sócio, maior primeiro, sem as estornadas", () => {
    const porSocio = retiradasPorSocio(RETIRADAS);
    expect(porSocio.map((s) => [s.socioId, s.totais.total])).toEqual([
      ["A", 2200.1],
      ["B", 2000],
    ]);
    expect(porSocio[0].totais.PRO_LABORE).toBe(800.1);
  });

  it("somas em centavos: dez retiradas de R$ 0,10 dão R$ 1,00 exato", () => {
    const dez = Array.from({ length: 10 }, () => retirada("A", "PRO_LABORE", 0.1, "2026-10-10"));
    expect(retiradasDoMes(dez, "2026-10").total).toBe(1);
  });
});

describe("fluxo de caixa com retiradas", () => {
  const contratos: ContratoApurado[] = [
    {
      fechadoEm: dia("2026-09-20"),
      festaEm: dia("2026-10-18"),
      valor: 5000,
      cancelado: false,
      recebimentos: [
        { valor: 1500, recebidoEm: dia("2026-09-20") },
        { valor: 3500, recebidoEm: dia("2026-10-18") },
      ],
    },
  ];
  const gastos: GastoApurado[] = [
    { valor: 400, natureza: "CONSUMO", pagoEm: new Date("2026-10-03T00:00:00Z") },
    { valor: 250, natureza: "CUSTEIO", pagoEm: new Date("2026-10-01T00:00:00Z") },
    { valor: 900, natureza: "ACERVO", pagoEm: new Date("2026-10-12T00:00:00Z") },
  ];

  it("entradas menos reembolsos, despesas, acervo e retiradas classificadas", () => {
    const f = fluxoDeCaixaDoMes(contratos, gastos, RETIRADAS, "2026-10");
    expect(f.entradas).toBe(3500);
    expect(f.despesasOperacionais).toBe(650);
    expect(f.acervo).toBe(900);
    expect(f.retiradas.total).toBe(3300.1);
    expect(f.saidas).toBe(4850.1);
    expect(f.movimentoLiquido).toBe(-1350.1);
  });

  it("acumulado do ano soma os meses, com as retiradas de cada um", () => {
    const f = fluxoDeCaixaDoAno(contratos, gastos, RETIRADAS, 2026, "2026-10");
    expect(f.entradas).toBe(5000);
    expect(f.retiradas.total).toBe(3600.1);
    expect(f.movimentoLiquido).toBe(-150.1); // 5000 − 650 − 900 − 3600,10, em centavos
  });

  it("retiradas NÃO mexem em faturamento, despesas nem Resultado Operacional", () => {
    // As fórmulas existentes nem recebem retiradas: o resultado é o mesmo
    // com ou sem elas, por construção. O teste prende os números.
    const r = resultadoOperacionalDoMes(contratos, gastos, "2026-10");
    expect([r.receita, r.despesa, r.resultado]).toEqual([5000, 650, 4350]);
    const ind = indicadoresDoMes(contratos, gastos, "2026-10");
    expect(ind.competencia.resultado).toBe(4350);
    expect(ind.caixa.receita).toBe(3500);
    expect(serieDoAno(contratos, gastos, 2026)[9].resultado).toBe(4350);
    expect(acumuladoNoAno(contratos, gastos, 2026, "2026-10").resultado).toBe(4350);
  });
});

describe("Pix da aprovação manual", () => {
  // Proposta de R$ 1.000,00; sinal padrão de 30% = R$ 300,00.
  it("abaixo dos 30%: aceito, saldo calculado e marcado como abaixo do padrão", () => {
    expect(conferirPixDaAprovacao(200, 1000)).toEqual({ ok: true, saldo: 800, abaixoDoPadrao: true });
  });
  it("acima dos 30%: aceito, sem aviso", () => {
    expect(conferirPixDaAprovacao(450, 1000)).toEqual({ ok: true, saldo: 550, abaixoDoPadrao: false });
  });
  it("exatamente o sinal padrão: aceito", () => {
    expect(conferirPixDaAprovacao(300, 1000)).toEqual({ ok: true, saldo: 700, abaixoDoPadrao: false });
  });
  it("valor integral: aceito, saldo zero", () => {
    expect(conferirPixDaAprovacao(1000, 1000)).toEqual({ ok: true, saldo: 0, abaixoDoPadrao: false });
  });
  it("percentual próprio da proposta vale para o aviso", () => {
    expect(conferirPixDaAprovacao(200, 1000, 0, 50)).toMatchObject({ ok: true, abaixoDoPadrao: true });
    expect(conferirPixDaAprovacao(200, 1000, 0, 10)).toMatchObject({ ok: true, abaixoDoPadrao: false });
  });
  it("acima do que falta pagar, zero ou negativo: recusado", () => {
    expect(conferirPixDaAprovacao(1000.01, 1000)).toMatchObject({ ok: false });
    expect(conferirPixDaAprovacao(0, 1000)).toMatchObject({ ok: false });
    expect(conferirPixDaAprovacao(-5, 1000)).toMatchObject({ ok: false });
    expect(conferirPixDaAprovacao(801, 1000, 200)).toMatchObject({ ok: false });
    expect(conferirPixDaAprovacao(10, 1000, 1000)).toEqual({ ok: false, erro: "Esta proposta já está totalmente paga." });
  });
});
