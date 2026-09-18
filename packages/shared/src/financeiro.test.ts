import { describe, expect, it } from "vitest";
import {
  acervoAcumulado,
  despesaDoMes,
  gastoAcumulado,
  indicadoresDoMes,
  linhaDeRitmo,
  mesEmChapeco,
  recebidoSemData,
  receitaPorCaixa,
  receitaPorCompetencia,
  saldoDoContrato,
  totalAReceber,
  totalRecebido,
  resumoDaCarteira,
  situacaoDePagamento,
  resultadoOperacionalDoMes,
  serieDoAno,
  acumuladoNoAno,
  variacao,
  mesAnterior,
  type ContratoApurado,
  type GastoApurado,
} from "./financeiro";

/**
 * Os defeitos que estes testes existem para não deixar voltar, todos
 * observados no painel antigo e documentados em
 * docs/SPRINT-0-PAINEL-FINANCEIRO.md:
 *
 *   1. faturamento contado pela data do contrato, o que joga a festa de
 *      outubro dentro de setembro;
 *   2. consumo e custeio arquivados como capital, somindo do resultado e
 *      inflando o ROI;
 *   3. o recebido lido de um campo digitado ao lado, que podia discordar do
 *      que os pagamentos diziam;
 *   4. o dinheiro recebido sem data tratado como se tivesse entrado num mês.
 *
 * Os valores aqui são inventados. Os números reais da Festaê não entram no
 * repositório, que é público.
 */

const meioDia = (iso: string) => new Date(`${iso}T15:00:00.000Z`); // meio-dia em Chapecó

/** Fechado em setembro, festa em outubro, sinal pago em setembro. */
const festaDeOutubro: ContratoApurado = {
  fechadoEm: meioDia("2026-09-10"),
  festaEm: meioDia("2026-10-17"),
  valor: 1000,
  recebimentos: [{ valor: 300, recebidoEm: meioDia("2026-09-10") }],
};

/** Fechado e realizado em setembro, quitado. */
const festaDeSetembro: ContratoApurado = {
  fechadoEm: meioDia("2026-09-02"),
  festaEm: meioDia("2026-09-27"),
  valor: 500,
  recebimentos: [
    { valor: 200, recebidoEm: meioDia("2026-09-02") },
    { valor: 300, recebidoEm: meioDia("2026-09-27") },
  ],
};

/** Veio do painel antigo: sabe-se que entrou, não se sabe quando. */
const festaImportada: ContratoApurado = {
  fechadoEm: meioDia("2026-08-26"),
  festaEm: meioDia("2026-08-29"),
  valor: 400,
  recebimentos: [{ valor: 400, recebidoEm: null }],
};

const contratos = [festaDeOutubro, festaDeSetembro, festaImportada];

const gastos: GastoApurado[] = [
  { valor: 800, natureza: "ACERVO", pagoEm: meioDia("2026-09-09") },
  { valor: 120, natureza: "CONSUMO", pagoEm: meioDia("2026-09-04") },
  { valor: 60, natureza: "CUSTEIO", pagoEm: meioDia("2026-09-13") },
  { valor: 50, natureza: "CONSUMO", pagoEm: meioDia("2026-10-02") },
  { valor: 90, natureza: "CUSTEIO", pagoEm: null }, // ainda não pago
];

describe("mesEmChapeco", () => {
  it("usa o fuso de Chapecó, não o UTC", () => {
    // 1º de outubro às 02:00 UTC ainda é 30 de setembro em Chapecó.
    expect(mesEmChapeco(new Date("2026-10-01T02:00:00.000Z"))).toBe("2026-09");
    expect(mesEmChapeco(new Date("2026-10-01T15:00:00.000Z"))).toBe("2026-10");
  });
});

describe("receita por competência", () => {
  it("conta a festa no mês em que ela acontece, não no mês do contrato", () => {
    // O contrato de outubro foi assinado em setembro. O painel antigo o
    // somava em setembro — era assim que setembro parecia melhor do que foi.
    expect(receitaPorCompetencia(contratos, "2026-09")).toBe(500);
    expect(receitaPorCompetencia(contratos, "2026-10")).toBe(1000);
  });

  it("ignora contrato cancelado", () => {
    const cancelado = { ...festaDeSetembro, cancelado: true };
    expect(receitaPorCompetencia([cancelado], "2026-09")).toBe(0);
  });
});

describe("receita por caixa", () => {
  it("conta cada recebimento no mês em que o dinheiro entrou", () => {
    // Setembro: os 300 de sinal da festa de outubro, mais os 200 + 300 da
    // festa de setembro. Repare que isso difere da competência de propósito.
    expect(receitaPorCaixa(contratos, "2026-09")).toBe(800);
    expect(receitaPorCaixa(contratos, "2026-10")).toBe(0);
  });

  it("não atribui a mês nenhum o dinheiro que entrou sem data", () => {
    expect(receitaPorCaixa(contratos, "2026-08")).toBe(0);
    expect(recebidoSemData(contratos)).toBe(400);
  });
});

describe("despesa do mês", () => {
  it("soma consumo e custeio, e deixa o acervo de fora", () => {
    // Os 800 de acervo em setembro não entram: é capital que continua
    // existindo. Entram os 120 de consumo e os 60 de custeio.
    expect(despesaDoMes(gastos, "2026-09")).toBe(180);
  });

  it("ignora o que ainda não foi pago", () => {
    // O custeio de 90 sem data de pagamento não pertence a mês nenhum.
    expect(gastoAcumulado(gastos)).toBe(1120);
    expect(despesaDoMes(gastos, "2026-08")).toBe(0);
  });

  it("acervo acumulado não se confunde com gasto acumulado", () => {
    expect(acervoAcumulado(gastos)).toBe(800);
    expect(gastoAcumulado(gastos)).toBe(1120);
  });
});

describe("recebido e saldo", () => {
  it("deriva o recebido dos pagamentos, nunca de um campo ao lado", () => {
    expect(totalRecebido(contratos)).toBe(1200);
    expect(totalAReceber(contratos)).toBe(700);
  });

  it("contrato quitado tem saldo zero mesmo vindo sem data de recebimento", () => {
    // Este é o caso que o painel antigo errava: status "Pago" com o campo
    // de sinal zerado. Aqui o pagamento existe como linha, então o saldo
    // fecha sozinho.
    expect(saldoDoContrato(festaImportada)).toBe(0);
  });

  it("nunca devolve saldo negativo", () => {
    const pagouAMais: ContratoApurado = {
      ...festaDeSetembro,
      recebimentos: [{ valor: 600, recebidoEm: meioDia("2026-09-02") }],
    };
    expect(saldoDoContrato(pagouAMais)).toBe(0);
  });
});

describe("indicadoresDoMes", () => {
  const setembro = indicadoresDoMes(contratos, gastos, "2026-09");

  it("apura cada resultado inteiro num regime só", () => {
    expect(setembro.competencia).toMatchObject({
      regime: "COMPETENCIA",
      receita: 500,
      despesa: 180,
      resultado: 320,
    });
    expect(setembro.caixa).toMatchObject({
      regime: "CAIXA",
      receita: 800,
      despesa: 180,
      resultado: 620,
    });
  });

  it("separa contratos fechados de festas realizadas", () => {
    // Dois contratos foram assinados em setembro; só uma festa aconteceu.
    // O painel antigo chamava os dois de "nº de contratos" e dividia o
    // faturamento por esse número para achar o ticket.
    expect(setembro.contratosFechados).toBe(2);
    expect(setembro.festasNoMes).toBe(1);
    expect(setembro.ticketMedio).toBe(500);
  });

  it("mostra o acervo separado da despesa", () => {
    expect(setembro.acervoNoMes).toBe(800);
    expect(setembro.acervoAcumulado).toBe(800);
  });

  it("declara quanto entrou sem data em vez de esconder", () => {
    expect(setembro.recebidoSemData).toBe(400);
  });

  it("devolve margem nula em mês sem receita, não Infinity", () => {
    const vazio = indicadoresDoMes([], gastos, "2026-11");
    expect(vazio.competencia.margem).toBeNull();
    expect(vazio.ticketMedio).toBeNull();
  });
});

describe("linhaDeRitmo", () => {
  it("compara o realizado com o ritmo linear esperado", () => {
    // Dia 13 de 30, meta 3000: o ritmo esperado é 1300. Com 1000 feitos,
    // são 300 de atraso e faltam 2000 em 17 dias.
    const linha = linhaDeRitmo(1000, 3000, 13, 30);
    expect(linha.atrasoNoRitmo).toBe(-300);
    expect(linha.falta).toBe(2000);
    expect(linha.porDia).toBeCloseTo(117.65, 2);
  });

  it("não pede ritmo nenhum quando o mês acabou", () => {
    expect(linhaDeRitmo(1000, 3000, 30, 30).porDia).toBeNull();
  });

  it("meta batida não vira falta negativa", () => {
    const linha = linhaDeRitmo(4000, 3000, 20, 30);
    expect(linha.falta).toBe(0);
    expect(linha.atrasoNoRitmo).toBe(2000);
    expect(linha.percentualAtingido).toBeCloseTo(1.333, 3);
  });
});

describe("situacaoDePagamento", () => {
  /** Uma festa às 12h UTC do dia pedido — a âncora que o sistema grava. */
  const festa = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

  const contrato = (
    dia: string,
    valor: number,
    recebido: number[],
    cancelado = false,
  ): ContratoApurado => ({
    fechadoEm: new Date("2026-08-01T12:00:00.000Z"),
    festaEm: festa(dia),
    valor,
    cancelado,
    recebimentos: recebido.map((v) => ({ valor: v, recebidoEm: new Date("2026-08-05T12:00:00.000Z") })),
  });

  it("quitado quando não sobra saldo, mesmo com a festa no passado", () => {
    const pago = contrato("2026-09-10", 1000, [400, 600]);
    expect(situacaoDePagamento(pago, new Date("2026-09-30T12:00:00Z"))).toBe("QUITADO");
  });

  it("aguardando quando nada entrou e a festa ainda vem", () => {
    const novo = contrato("2026-10-20", 1000, []);
    expect(situacaoDePagamento(novo, new Date("2026-09-18T12:00:00Z"))).toBe("AGUARDANDO");
  });

  it("parcial quando o sinal entrou e o saldo ainda não venceu", () => {
    const comSinal = contrato("2026-10-20", 1000, [400]);
    expect(situacaoDePagamento(comSinal, new Date("2026-09-18T12:00:00Z"))).toBe("PARCIAL");
  });

  /*
   * As três bordas da regra. A festa é um dia, não um instante: o saldo é pago
   * na retirada ou na entrega, que acontecem dentro do dia. Por isso o dia da
   * festa ainda está no prazo, e vencido começa no dia seguinte.
   */
  it("na véspera ainda não venceu", () => {
    const c = contrato("2026-09-18", 1000, [400]);
    expect(situacaoDePagamento(c, new Date("2026-09-17T12:00:00Z"))).toBe("PARCIAL");
  });

  it("no dia da festa ainda não venceu, nem às 9 da manhã", () => {
    const c = contrato("2026-09-18", 1000, [400]);
    // 09:00 em Chapecó é 12:00 UTC — a entrega da tarde ainda vai acontecer.
    expect(situacaoDePagamento(c, new Date("2026-09-18T12:00:00Z"))).toBe("PARCIAL");
    // E às 23h de Chapecó (02:00 UTC do dia seguinte) o dia ainda é 18.
    expect(situacaoDePagamento(c, new Date("2026-09-19T02:00:00Z"))).toBe("PARCIAL");
  });

  it("no dia seguinte à festa, saldo aberto é vencido", () => {
    const c = contrato("2026-09-18", 1000, [400]);
    expect(situacaoDePagamento(c, new Date("2026-09-19T12:00:00Z"))).toBe("VENCIDO");
  });

  it("vence mesmo sem nunca ter recebido nada", () => {
    const c = contrato("2026-09-10", 1000, []);
    expect(situacaoDePagamento(c, new Date("2026-09-18T12:00:00Z"))).toBe("VENCIDO");
  });

  it("cancelado não vence nem fica em aberto", () => {
    const c = contrato("2026-08-01", 1000, [], true);
    expect(situacaoDePagamento(c, new Date("2026-09-18T12:00:00Z"))).toBe("CANCELADO");
  });

  it("recebido a mais não vira saldo negativo", () => {
    const c = contrato("2026-09-10", 1000, [1200]);
    expect(saldoDoContrato(c)).toBe(0);
    expect(situacaoDePagamento(c, new Date("2026-09-30T12:00:00Z"))).toBe("QUITADO");
  });
});

describe("resumoDaCarteira", () => {
  const agora = new Date("2026-09-18T12:00:00Z");
  const contrato = (
    dia: string,
    valor: number,
    recebido: number,
    cancelado = false,
  ): ContratoApurado => ({
    fechadoEm: new Date("2026-08-01T12:00:00.000Z"),
    festaEm: new Date(`${dia}T12:00:00.000Z`),
    valor,
    cancelado,
    recebimentos: recebido > 0 ? [{ valor: recebido, recebidoEm: new Date("2026-08-05T12:00:00Z") }] : [],
  });

  const carteira = [
    contrato("2026-09-10", 1000, 400), // vencido: 600 em aberto
    contrato("2026-09-05", 800, 800), // quitado
    contrato("2026-10-20", 1200, 500), // parcial: 700 em aberto
    contrato("2026-11-02", 600, 0), // aguardando: 600 em aberto
    contrato("2026-09-01", 9999, 0, true), // cancelado: não conta em nada
  ];

  const resumo = resumoDaCarteira(carteira, agora);

  it("ignora contrato cancelado em todos os totais", () => {
    expect(resumo.contratos).toBe(4);
    expect(resumo.contratado).toBe(3600);
  });

  it("soma o recebido dos vigentes", () => {
    expect(resumo.recebido).toBe(1700);
  });

  it("separa o saldo em aberto do que já venceu", () => {
    expect(resumo.saldoEmAberto).toBe(1900);
    expect(resumo.vencido).toBe(600);
    expect(resumo.contratosVencidos).toBe(1);
  });

  it("o vencido é um recorte do saldo em aberto, não uma soma à parte", () => {
    expect(resumo.vencido).toBeLessThanOrEqual(resumo.saldoEmAberto);
  });

  it("contratado menos recebido fecha com o saldo em aberto", () => {
    expect(resumo.contratado - resumo.recebido).toBeCloseTo(resumo.saldoEmAberto, 2);
  });

  it("ticket médio é do que vale, não do que foi cancelado", () => {
    expect(resumo.ticketMedio).toBe(900);
  });

  it("carteira vazia não divide por zero", () => {
    expect(resumoDaCarteira([], agora).ticketMedio).toBeNull();
  });
});

describe("Sprint 4 — visão executiva", () => {
  const contrato = (festa: string, valor: number, cancelado = false): ContratoApurado => ({
    fechadoEm: new Date("2026-01-05T12:00:00Z"),
    festaEm: new Date(`${festa}T12:00:00Z`),
    valor,
    cancelado,
    recebimentos: [],
  });
  const gasto = (
    pagoEm: string | null,
    valor: number,
    natureza: "CONSUMO" | "CUSTEIO" | "ACERVO",
  ): GastoApurado => ({ valor, natureza, pagoEm: pagoEm ? new Date(`${pagoEm}T12:00:00Z`) : null });

  const contratos = [
    contrato("2026-02-10", 1000),
    contrato("2026-03-15", 2000),
    contrato("2026-03-20", 500),
    contrato("2026-04-02", 9999, true), // cancelado: não entra em nada
  ];
  const gastos = [
    gasto("2026-02-05", 300, "CONSUMO"),
    gasto("2026-03-01", 200, "CUSTEIO"),
    gasto("2026-03-10", 800, "ACERVO"), // investimento, fora do resultado
    gasto(null, 500, "CONSUMO"),        // sem data de pagamento: fora do mês
  ];

  describe("resultadoOperacionalDoMes", () => {
    it("é faturamento menos consumo e custeio", () => {
      const m = resultadoOperacionalDoMes(contratos, gastos, "2026-03");
      expect(m.receita).toBe(2500);
      expect(m.despesa).toBe(200);
      expect(m.resultado).toBe(2300);
    });

    it("acervo não entra como despesa operacional", () => {
      // Março teve R$ 800 de acervo; a despesa continua sendo só os R$ 200.
      expect(resultadoOperacionalDoMes(contratos, gastos, "2026-03").despesa).toBe(200);
    });

    it("mês só com acervo não vira prejuízo", () => {
      const so = [gasto("2026-07-10", 1500, "ACERVO")];
      const m = resultadoOperacionalDoMes([], so, "2026-07");
      expect(m.despesa).toBe(0);
      expect(m.resultado).toBe(0);
    });

    it("mês sem faturamento devolve margem nula, não Infinity", () => {
      const m = resultadoOperacionalDoMes([], gastos, "2026-02");
      expect(m.receita).toBe(0);
      expect(m.margem).toBeNull();
    });

    it("mês sem despesas tem margem de 100%", () => {
      const m = resultadoOperacionalDoMes([contrato("2026-09-01", 400)], [], "2026-09");
      expect(m.resultado).toBe(400);
      expect(m.margem).toBe(1);
    });

    it("reserva cancelada não entra no faturamento", () => {
      expect(resultadoOperacionalDoMes(contratos, gastos, "2026-04").receita).toBe(0);
    });
  });

  describe("serieDoAno", () => {
    const serie = serieDoAno(contratos, gastos, 2026);

    it("devolve os doze meses, para o eixo do gráfico ser o ano inteiro", () => {
      expect(serie).toHaveLength(12);
      expect(serie[0].mes).toBe("2026-01");
      expect(serie[11].mes).toBe("2026-12");
    });

    it("distingue mês sem movimento de mês com movimento", () => {
      expect(serie[0].temDados).toBe(false);  // janeiro: nada
      expect(serie[1].temDados).toBe(true);   // fevereiro: festa e consumo
      expect(serie[11].temDados).toBe(false); // dezembro: futuro
    });

    it("mês só com acervo conta como mês que aconteceu", () => {
      const s = serieDoAno([], [gasto("2026-07-10", 1500, "ACERVO")], 2026);
      expect(s[6].temDados).toBe(true);
      expect(s[6].resultado).toBe(0);
    });

    it("acumula faturamento e resultado ao longo do ano", () => {
      expect(serie[1].acumuladoFaturamento).toBe(1000);
      expect(serie[2].acumuladoFaturamento).toBe(3500);
      expect(serie[11].acumuladoFaturamento).toBe(3500);
      expect(serie[2].acumuladoResultado).toBe(3000); // 3500 - 300 - 200
    });

    it("o acumulado não anda em mês vazio", () => {
      expect(serie[3].acumuladoFaturamento).toBe(serie[2].acumuladoFaturamento);
    });
  });

  describe("acumuladoNoAno", () => {
    it("soma de janeiro até o mês escolhido, inclusive", () => {
      const ytd = acumuladoNoAno(contratos, gastos, 2026, "2026-03");
      expect(ytd.faturamento).toBe(3500);
      expect(ytd.despesas).toBe(500);
      expect(ytd.resultado).toBe(3000);
      expect(ytd.acervo).toBe(800);
      expect(ytd.mesesComDados).toBe(2);
    });

    it("em janeiro traz só janeiro", () => {
      expect(acumuladoNoAno(contratos, gastos, 2026, "2026-01").faturamento).toBe(0);
      expect(acumuladoNoAno([contrato("2026-01-09", 700)], [], 2026, "2026-01").faturamento).toBe(700);
    });

    it("ano sem movimento devolve zero e margem nula", () => {
      const ytd = acumuladoNoAno(contratos, gastos, 2027, "2027-12");
      expect(ytd.faturamento).toBe(0);
      expect(ytd.margem).toBeNull();
    });
  });

  describe("variacao", () => {
    it("compara com o mês anterior", () => {
      const v = variacao(1500, 1000);
      expect(v.absoluta).toBe(500);
      expect(v.percentual).toBeCloseTo(0.5, 6);
      expect(v.temBase).toBe(true);
    });

    it("queda vem negativa", () => {
      expect(variacao(800, 1000).percentual).toBeCloseTo(-0.2, 6);
    });

    it("mês anterior zero não vira percentual infinito", () => {
      const v = variacao(900, 0);
      expect(v.percentual).toBeNull();
      expect(v.temBase).toBe(false);
      expect(v.absoluta).toBe(900);
    });

    it("dois meses zerados não quebram", () => {
      expect(variacao(0, 0).percentual).toBeNull();
      expect(variacao(0, 0).absoluta).toBe(0);
    });

    it("base negativa usa o módulo, para o sinal descrever a direção", () => {
      // De -200 para +100: melhorou 300, sobre uma base de 200.
      expect(variacao(100, -200).percentual).toBeCloseTo(1.5, 6);
    });
  });

  describe("mesAnterior", () => {
    it("janeiro volta para dezembro do ano anterior", () => {
      expect(mesAnterior("2026-01")).toBe("2025-12");
      expect(mesAnterior("2026-03")).toBe("2026-02");
      expect(mesAnterior("2026-10")).toBe("2026-09");
    });
  });
});
