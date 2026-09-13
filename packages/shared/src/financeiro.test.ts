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
