import { describe, expect, it } from "vitest";
import { divergencias, extrairValores, fatosDosResultados } from "./conferencia";

const valores = (texto: string) => extrairValores(texto).map(({ tipo, absoluto, direcao }) => ({ tipo, absoluto, direcao }));
const confere = (texto: string, fontes: unknown[]) => divergencias(texto, fatosDosResultados(fontes)).length === 0;

describe("leitura dos valores de um texto", () => {
  it("dinheiro em qualquer forma vira centavos", () => {
    expect(valores("R$ 1.234,56")).toEqual([{ tipo: "MOEDA", absoluto: 123456, direcao: null }]);
    expect(valores("R$1234,5")).toEqual([{ tipo: "MOEDA", absoluto: 123450, direcao: null }]);
    expect(valores("R$ 1.234")).toEqual([{ tipo: "MOEDA", absoluto: 123400, direcao: null }]);
    expect(valores("839,69 reais")).toEqual([{ tipo: "MOEDA", absoluto: 83969, direcao: null }]);
    expect(valores("10 reais")).toEqual([{ tipo: "MOEDA", absoluto: 1000, direcao: null }]);
    expect(valores("R$ 1,2 mil")).toEqual([{ tipo: "MOEDA", absoluto: 120000, direcao: null }]);
    expect(valores("2 milhões de reais")).toEqual([{ tipo: "MOEDA", absoluto: 200000000, direcao: null }]);
    // Número com duas casas, sem R$: lido como dinheiro.
    expect(valores("o gasto foi 249,90 no mês")).toEqual([{ tipo: "MOEDA", absoluto: 24990, direcao: null }]);
    // Mais casas do que a moeda tem: nunca confere.
    expect(valores("R$ 1.234,567")[0].absoluto).toBe(-1);
  });

  it("percentual em centésimos de ponto, com o sinal escrito", () => {
    expect(valores("+212,4%")).toEqual([{ tipo: "PERCENTUAL", absoluto: 21240, direcao: "MAIS" }]);
    expect(valores("−50,0%")).toEqual([{ tipo: "PERCENTUAL", absoluto: 5000, direcao: "MENOS" }]);
    expect(valores("-3,2%")).toEqual([{ tipo: "PERCENTUAL", absoluto: 320, direcao: "MENOS" }]);
    expect(valores("12 por cento")).toEqual([{ tipo: "PERCENTUAL", absoluto: 1200, direcao: null }]);
  });

  it("quantidade de lançamentos; o resto (datas, anos, meses, dias) não é valor financeiro", () => {
    expect(valores("37 lançamentos e 1 lançamento")).toEqual([
      { tipo: "LANCAMENTOS", absoluto: 37, direcao: null },
      { tipo: "LANCAMENTOS", absoluto: 1, direcao: null },
    ]);
    expect(valores("De 01/10/2026 a 21/10/2026, em 2026, nos últimos 3 meses (2,68 meses), 90 dias, 3 festas.")).toEqual([]);
  });

  it("a direção vem da palavra mais próxima na mesma frase, sem atravessar outro valor", () => {
    expect(valores("R$ 50,00 a menos")).toEqual([{ tipo: "MOEDA", absoluto: 5000, direcao: "MENOS" }]);
    expect(valores("queda de 12,3%")).toEqual([{ tipo: "PERCENTUAL", absoluto: 1230, direcao: "MENOS" }]);
    expect(valores("aumento de R$ 10,00")).toEqual([{ tipo: "MOEDA", absoluto: 1000, direcao: "MAIS" }]);
    expect(valores("Total de R$ 300,00. Houve alta de 5,0%.")).toEqual([
      { tipo: "MOEDA", absoluto: 30000, direcao: null },
      { tipo: "PERCENTUAL", absoluto: 500, direcao: "MAIS" },
    ]);
    // O ponto de milhar não fecha a frase.
    expect(valores("queda para R$ 1.234,00")[0].direcao).toBe("MENOS");
  });
});

describe("fatos dos resultados", () => {
  it("valores dos textos e as quantidades de lançamentos dos campos numéricos", () => {
    const fatos = fatosDosResultados([{ resultado: { total: "R$ 249,90", lancamentos: 2, outroNumero: 7 }, comparacao: { variacaoPercentual: "+12,3%", diferenca: "R$ 27,30 a mais em outubro" } }]);
    expect(fatos.map(({ tipo, absoluto, direcao }) => ({ tipo, absoluto, direcao }))).toEqual([
      { tipo: "MOEDA", absoluto: 24990, direcao: null },
      { tipo: "LANCAMENTOS", absoluto: 2, direcao: null },
      { tipo: "PERCENTUAL", absoluto: 1230, direcao: "MAIS" },
      { tipo: "MOEDA", absoluto: 2730, direcao: "MAIS" },
    ]);
  });
});

describe("conferência — achado #13 e vizinhos", () => {
  const resultado = { resultado: { total: "R$ 1.234,50", lancamentos: 37, listaCortada: "Amostra com os 10 mais recentes, de 37 lançamentos no total." }, comparacao: { variacaoPercentual: "+12,3%", diferenca: "R$ 50,00 a mais em outubro" } };

  it("valores iguais, em qualquer formatação, conferem", () => {
    expect(confere("Foram R$ 1.234,50 em 37 lançamentos, alta de 12,3% (R$ 50,00 a mais).", [resultado])).toBe(true);
    expect(confere("Foram 1.234,50 reais.", [resultado])).toBe(true);
    expect(confere("Não há valores a mostrar.", [resultado])).toBe(true);
  });

  it("direção trocada não confere: percentual e diferença", () => {
    expect(confere("Queda de 12,3%.", [resultado])).toBe(false);
    expect(confere("Foram −12,3%.", [resultado])).toBe(false);
    expect(confere("R$ 50,00 a menos que setembro.", [resultado])).toBe(false);
    // Sem direção escrita, o valor sozinho confere.
    expect(confere("Variação de 12,3%.", [resultado])).toBe(true);
  });

  it("número sem R$ e número que nenhuma ferramenta deu não conferem", () => {
    expect(confere("Total de 999,99 reais.", [resultado])).toBe(false);
    expect(confere("O gasto foi 839,69.", [resultado])).toBe(false);
    expect(confere("Cerca de R$ 1,2 mil.", [resultado])).toBe(false);
    expect(confere("Foram R$ 1.234.", [resultado])).toBe(false);
    expect(confere("Alta de 12%.", [resultado])).toBe(false);
  });

  it("quantidade de lançamentos: o tamanho da amostra não é a quantidade", () => {
    expect(confere("Foram 37 lançamentos.", [resultado])).toBe(true);
    expect(confere("Foram 10 lançamentos.", [resultado])).toBe(false);
  });

  it("fatos de várias ferramentas e frases do servidor valem juntos (achado #1)", () => {
    const financeiro = { competencia: { faturamentoDasFestas: "R$ 12.345,00" } };
    const frase = "Dos R$ 12.345,00 de faturamento, R$ 2.000,00 são de festas agendadas.";
    expect(confere("Faturamento R$ 12.345,00 (R$ 2.000,00 agendados); despesas R$ 1.234,50.", [financeiro, frase, resultado])).toBe(true);
    expect(confere("Faturamento R$ 12.345,00; despesas R$ 1.234,50.", [resultado])).toBe(false);
  });

  it("resultado de erro não dá fato nenhum: qualquer valor diverge (achado #9)", () => {
    expect(confere("Foram R$ 839,69.", [{ erro: "Parâmetros inválidos para a consulta." }])).toBe(false);
  });
});
