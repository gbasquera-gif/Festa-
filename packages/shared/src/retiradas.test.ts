import { describe, expect, it } from "vitest";
import {
  controleDaDistribuicaoDoAno,
  controleDaDistribuicaoDoMes,
  fluxoDeCaixaDoAno,
  fluxoDeCaixaDoMes,
  fluxoDeCaixaEntre,
  mesDaRetirada,
  pareceProLabore,
  saldoDisponivel,
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
  retirada("A", "DEVOLUCAO_DE_APORTE", 800.1, "2026-10-31"),
  retirada("B", "DEVOLUCAO_DE_APORTE", 300, "2026-09-01"),
  retirada("A", "DISTRIBUICAO_DE_LUCROS", 999.99, "2026-10-20", true), // estornada
  retirada("A", "DISTRIBUICAO_DE_LUCROS", 400, "2025-12-31"),
  retirada("B", "DEVOLUCAO_DE_APORTE", 200, "2026-11-01"),
];

describe("retiradas dos sócios", () => {
  it("o mês da retirada é o dia gravado, inclusive no 1º e no último dia", () => {
    expect(mesDaRetirada(dia("2026-10-01"))).toBe("2026-10");
    expect(mesDaRetirada(dia("2026-10-31"))).toBe("2026-10");
  });

  it("retiradas do mês, por categoria, sem as estornadas", () => {
    expect(retiradasDoMes(RETIRADAS, "2026-10")).toEqual({
      DISTRIBUICAO_DE_LUCROS: 2500,
      DEVOLUCAO_DE_APORTE: 800.1,
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
      DEVOLUCAO_DE_APORTE: 1300.1,
      total: 4200.1,
    });
  });

  it("por sócio, maior primeiro, sem as estornadas", () => {
    const porSocio = retiradasPorSocio(RETIRADAS);
    expect(porSocio.map((s) => [s.socioId, s.totais.total])).toEqual([
      ["A", 2200.1],
      ["B", 2000],
    ]);
    expect(porSocio[0].totais.DEVOLUCAO_DE_APORTE).toBe(800.1);
  });

  it("somas em centavos: dez retiradas de R$ 0,10 dão R$ 1,00 exato", () => {
    const dez = Array.from({ length: 10 }, () => retirada("A", "DISTRIBUICAO_DE_LUCROS", 0.1, "2026-10-10"));
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

describe("saldo disponível", () => {
  const recebida: ContratoApurado = {
    fechadoEm: dia("2026-09-01"),
    festaEm: dia("2026-10-25"),
    valor: 3000,
    cancelado: false,
    recebimentos: [{ valor: 1000, recebidoEm: dia("2026-09-01") }],
  };
  const despesa: GastoApurado = { valor: 700, natureza: "CUSTEIO", pagoEm: new Date("2026-09-10T00:00:00Z") };

  it("o exemplo: saldo de R$ 10.000, retirada de R$ 2.000 → R$ 8.000; faturamento, despesas e Resultado Operacional iguais", () => {
    const antes = resultadoOperacionalDoMes([recebida], [despesa], "2026-10");
    const caixaAntes = indicadoresDoMes([recebida], [despesa], "2026-10").caixa;
    const distribuicao = [retirada("A", "DISTRIBUICAO_DE_LUCROS", 2000, "2026-10-05")];

    const s = saldoDisponivel([], [], distribuicao, { dia: "2026-10-01", valor: 10_000 }, "2026-10-21")!;
    expect(s.saldo).toBe(8000);
    expect(s.retiradas.DISTRIBUICAO_DE_LUCROS).toBe(2000);
    expect(s.despesasOperacionais).toBe(0);

    // A retirada não chega nas fórmulas do resultado: elas nem a recebem.
    expect(resultadoOperacionalDoMes([recebida], [despesa], "2026-10")).toEqual(antes);
    expect(indicadoresDoMes([recebida], [despesa], "2026-10").caixa).toEqual(caixaAntes);
    expect([antes.receita, antes.despesa, antes.resultado]).toEqual([3000, 0, 3000]);
  });

  it("soma entradas e desconta reembolsos, despesas, acervo e retiradas depois do saldo informado", () => {
    const contrato: ContratoApurado = {
      fechadoEm: dia("2026-10-02"),
      festaEm: dia("2026-11-10"),
      valor: 4000,
      cancelado: false,
      recebimentos: [
        { valor: 1200, recebidoEm: dia("2026-10-02") },
        { valor: 999, recebidoEm: null }, // importado sem data: não entra
      ],
    };
    const gastos: GastoApurado[] = [
      { valor: 300, natureza: "CONSUMO", pagoEm: new Date("2026-10-03T00:00:00Z") },
      { valor: 500, natureza: "ACERVO", pagoEm: new Date("2026-10-04T00:00:00Z") },
      { valor: 80, natureza: "CUSTEIO", pagoEm: null }, // a pagar: não saiu
      { valor: 1000, natureza: "PRO_LABORE", pagoEm: new Date("2026-10-06T00:00:00Z") },
    ];
    const retiradas = [
      retirada("A", "DISTRIBUICAO_DE_LUCROS", 400, "2026-10-08"),
      retirada("B", "DISTRIBUICAO_DE_LUCROS", 777, "2026-10-07", true), // estornada
    ];
    const s = saldoDisponivel([contrato], gastos, retiradas, { dia: "2026-10-02", valor: 10_000 }, "2026-10-21")!;
    expect([s.entradas, s.despesasOperacionais, s.proLabore, s.acervo, s.retiradas.total]).toEqual([1200, 300, 1000, 500, 400]);
    expect(s.saldo).toBe(9000); // 10.000 + 1.200 − 300 − 1.000 − 500 − 400
  });

  it("o saldo informado é o inicial do dia: a retirada do próprio dia já desconta", () => {
    const noDia = [retirada("A", "DISTRIBUICAO_DE_LUCROS", 2000, "2026-10-21")];
    expect(saldoDisponivel([], [], noDia, { dia: "2026-10-21", valor: 10_000 }, "2026-10-21")!.saldo).toBe(8000);
    // A de antes do saldo inicial já está nele: não desconta de novo.
    const antes = [retirada("A", "DISTRIBUICAO_DE_LUCROS", 2000, "2026-10-20")];
    expect(saldoDisponivel([], [], antes, { dia: "2026-10-21", valor: 10_000 }, "2026-10-21")!.saldo).toBe(10_000);
  });

  it("garantias: o anterior ao saldo inicial não conta; o do dia conta uma vez só; retirada reduz; Resultado intacto", () => {
    const contrato: ContratoApurado = {
      fechadoEm: dia("2026-10-01"),
      festaEm: dia("2026-11-20"),
      valor: 3000,
      cancelado: false,
      recebimentos: [
        { valor: 500, recebidoEm: new Date("2026-10-09T15:00:00Z") }, // véspera: já está no saldo inicial
        { valor: 700, recebidoEm: new Date("2026-10-10T13:00:00Z") }, // no dia do saldo inicial: conta
        { valor: 900, recebidoEm: new Date("2026-10-11T02:30:00Z") }, // 10/10 23h30 em Chapecó: ainda é o dia 10
      ],
    };
    const gastos: GastoApurado[] = [
      { valor: 100, natureza: "CUSTEIO", pagoEm: new Date("2026-10-09T00:00:00Z") }, // véspera: não conta
      { valor: 200, natureza: "CUSTEIO", pagoEm: new Date("2026-10-10T00:00:00Z") }, // no dia: conta
      { valor: 300, natureza: "PRO_LABORE", pagoEm: new Date("2026-10-10T00:00:00Z") }, // no dia: conta
    ];
    const retiradas = [
      retirada("A", "DISTRIBUICAO_DE_LUCROS", 400, "2026-10-09"), // véspera: não conta
      retirada("A", "DISTRIBUICAO_DE_LUCROS", 1000, "2026-10-10"), // no dia: conta
    ];
    const ref = { dia: "2026-10-10", valor: 10_000 };
    const noDia = saldoDisponivel([contrato], gastos, retiradas, ref, "2026-10-10")!;
    expect([noDia.entradas, noDia.despesasOperacionais, noDia.proLabore, noDia.retiradas.total]).toEqual([1600, 200, 300, 1000]);
    expect(noDia.saldo).toBe(10_100); // 10.000 + 1.600 − 200 − 300 − 1.000
    // Dias depois, sem movimento novo: o do dia 10 não é somado de novo.
    expect(saldoDisponivel([contrato], gastos, retiradas, ref, "2026-10-20")!.saldo).toBe(10_100);
    // A retirada do dia reduz exatamente o seu valor.
    const semRetiradaDoDia = saldoDisponivel([contrato], gastos, retiradas.slice(0, 1), ref, "2026-10-20")!;
    expect(semRetiradaDoDia.saldo - 10_100).toBe(1000);
    // Distribuição não chega no Resultado Operacional.
    expect(resultadoOperacionalDoMes([contrato], gastos, "2026-10")).toEqual(resultadoOperacionalDoMes([contrato], gastos, "2026-10"));
    expect(controleDaDistribuicaoDoMes([contrato], gastos, [], "2026-10").resultadoOperacional).toBe(
      controleDaDistribuicaoDoMes([contrato], gastos, retiradas, "2026-10").resultadoOperacional,
    );
  });

  it("antes do saldo informado não há saldo calculado; saldo negativo é aceito", () => {
    expect(saldoDisponivel([], [], [], { dia: "2026-10-10", valor: 100 }, "2026-10-09")).toBeNull();
    const s = saldoDisponivel([], [], [retirada("A", "DISTRIBUICAO_DE_LUCROS", 150.1, "2026-10-10")], { dia: "2026-10-10", valor: 100 }, "2026-10-12")!;
    expect(s.saldo).toBe(-50.1);
  });

  it("o mês inteiro pelo intervalo de dias bate com o fluxo de caixa do mês", () => {
    const contratos: ContratoApurado[] = [
      {
        fechadoEm: dia("2026-09-20"),
        festaEm: dia("2026-10-18"),
        valor: 5000,
        cancelado: false,
        recebimentos: [
          { valor: 1500, recebidoEm: new Date("2026-10-01T02:30:00Z") }, // 30/09 23h30 em Chapecó
          { valor: 3500, recebidoEm: new Date("2026-11-01T02:59:00Z") }, // 31/10 23h59 em Chapecó
        ],
        reembolsos: [{ valor: 120.5, realizadoEm: new Date("2026-10-15T15:00:00Z") }],
      },
    ];
    const gastos: GastoApurado[] = [
      { valor: 400, natureza: "CONSUMO", pagoEm: new Date("2026-10-01T00:00:00Z") },
      { valor: 250, natureza: "CUSTEIO", pagoEm: new Date("2026-10-31T00:00:00Z") },
      { valor: 900, natureza: "ACERVO", pagoEm: new Date("2026-11-01T00:00:00Z") },
      { valor: 1200, natureza: "PRO_LABORE", pagoEm: new Date("2026-10-31T00:00:00Z") },
    ];
    for (const mes of ["2026-09", "2026-10", "2026-11"]) {
      const [ano, m] = mes.split("-").map(Number);
      const ultimoDoAnterior = new Date(Date.UTC(ano, m - 1, 0)).toISOString().slice(0, 10);
      const ultimo = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
      expect(fluxoDeCaixaEntre(contratos, gastos, RETIRADAS, ultimoDoAnterior, ultimo)).toEqual(
        fluxoDeCaixaDoMes(contratos, gastos, RETIRADAS, mes),
      );
    }
  });
});

describe("pró-labore: despesa em Despesas, fora do Resultado Operacional", () => {
  const contratos: ContratoApurado[] = [
    { fechadoEm: dia("2026-09-20"), festaEm: dia("2026-10-18"), valor: 5000, cancelado: false, recebimentos: [{ valor: 5000, recebidoEm: dia("2026-10-01") }] },
  ];
  const semProLabore: GastoApurado[] = [{ valor: 650, natureza: "CUSTEIO", pagoEm: new Date("2026-10-03T00:00:00Z") }];
  const comProLabore: GastoApurado[] = [...semProLabore, { valor: 1000, natureza: "PRO_LABORE", pagoEm: new Date("2026-10-05T00:00:00Z") }];

  it("a fórmula do Resultado Operacional não muda: pró-labore não entra em consumo + custeio", () => {
    expect(resultadoOperacionalDoMes(contratos, comProLabore, "2026-10")).toEqual(resultadoOperacionalDoMes(contratos, semProLabore, "2026-10"));
    expect(resultadoOperacionalDoMes(contratos, comProLabore, "2026-10").resultado).toBe(4350);
    expect(acumuladoNoAno(contratos, comProLabore, 2026, "2026-10")).toEqual(acumuladoNoAno(contratos, semProLabore, 2026, "2026-10"));
  });

  it("é saída de caixa em linha própria e reduz o saldo disponível", () => {
    const f = fluxoDeCaixaDoMes(contratos, comProLabore, [], "2026-10");
    expect([f.despesasOperacionais, f.proLabore, f.saidas, f.movimentoLiquido]).toEqual([650, 1000, 1650, 3350]);
    const ref = { dia: "2026-10-01", valor: 0 };
    expect(saldoDisponivel(contratos, semProLabore, [], ref, "2026-10-31")!.saldo - saldoDisponivel(contratos, comProLabore, [], ref, "2026-10-31")!.saldo).toBe(1000);
  });

  it("controle da distribuição: resultado após pró-labore e o que foi distribuído acima dele", () => {
    const dentro = controleDaDistribuicaoDoMes(contratos, comProLabore, [retirada("A", "DISTRIBUICAO_DE_LUCROS", 2500, "2026-10-20")], "2026-10");
    expect(dentro).toEqual({ resultadoOperacional: 4350, proLabore: 1000, resultadoAposProLabore: 3350, distribuido: 2500, distribuidoAcima: 0 });
    const acima = controleDaDistribuicaoDoMes(
      contratos,
      comProLabore,
      [retirada("A", "DISTRIBUICAO_DE_LUCROS", 4000, "2026-10-20"), retirada("B", "DEVOLUCAO_DE_APORTE", 900, "2026-10-21")],
      "2026-10",
    );
    // Devolução de aporte é capital devolvido, não lucro: fica fora da comparação.
    expect([acima.distribuido, acima.distribuidoAcima]).toEqual([4000, 650]);
    const ano = controleDaDistribuicaoDoAno(contratos, comProLabore, [retirada("A", "DISTRIBUICAO_DE_LUCROS", 2500, "2026-10-20")], 2026, "2026-10");
    expect([ano.resultadoOperacional, ano.proLabore, ano.resultadoAposProLabore]).toEqual([4350, 1000, 3350]);
  });
});

describe("texto que parece pró-labore", () => {
  it("reconhece as grafias comuns, e só elas", () => {
    for (const t of ["Pró-labore outubro", "pro labore", "PROLABORE", "Pró Labore sócia", "pró‐labore"]) {
      expect(pareceProLabore(t.replace("‐", "-"))).toBe(true);
    }
    expect(pareceProLabore(null, "Salários e pró-labore")).toBe(true);
    for (const t of ["Laboratório de fotos", "Profissional de limpeza", "Distribuição de lucros", ""]) {
      expect(pareceProLabore(t)).toBe(false);
    }
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
