import { describe, expect, it } from "vitest";
import {
  analisarExtratos,
  classificarMovimentacao,
  lerCentavos,
  lerData,
  type ArquivoDoExtrato,
} from "./extrato-mercado-pago";

// Arquivos fictícios: nomes, ids e valores inventados, no formato dos relatórios.
const arquivo = (nome: string, texto: string, hash = `h:${texto}`): ArquivoDoExtrato => ({
  nome,
  hash,
  bytes: new TextEncoder().encode(texto),
});

const EXTRATO_OUTUBRO = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
100,00;1.550,00;-1.641,31;8,69

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-10-2026;Transferência Pix recebida Cliente Exemplo;90000000001;500,00;600,00
02-10-2026;Dinheiro reservado Reserva Festaê;90000000002;-550,00;50,00
05-10-2026;Pagamento com QR Pix Fornecedor Exemplo;90000000003;-40,00;10,00
10-10-2026;Rendimentos;90000000004;0,31;10,31
15-10-2026;Dinheiro retirado Reserva Festaê;90000000005;1.000,00;1.010,31
16-10-2026;Tarifa de manutenção;90000000006;-1,31;1.009,00
20-10-2026;Pix enviado Fornecedor Exemplo;90000000007;-1.000,00;9,00
31-10-2026;Movimento genérico XPTO;90000000008;49,69;58,69
31-10-2026;Reserva automática de vendas;90000000009;-50,00;8,69
`;

// Começa em 31/10: repete as duas últimas linhas de outubro.
const EXTRATO_VIRADA = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
9,00;61,69;-50,00;20,69

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
31-10-2026;Movimento genérico XPTO;90000000008;49,69;58,69
31-10-2026;Reserva automática de vendas;90000000009;-50,00;8,69
01-11-2026;Transferência Pix recebida Cliente Exemplo;90000000010;12,00;20,69
`;

const LIBERACOES = `DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,MP_FEE_AMOUNT,BALANCE_AMOUNT
2026-10-01T00:00:00.000-04:00,,,initial_available_balance,,0.00,0.00,,,100.00
2026-10-10T10:00:00.000-04:00,80000000001,cobranca-exemplo-1,release,payment,98.01,0.00,100.00,-1.99,198.01
2026-10-31T23:30:00.000-04:00,80000000002,cobranca-exemplo-2,release,payment,196.02,0.00,200.00,-3.98,394.03
2026-11-01T09:00:00.000-03:00,80000000003,,release,withdrawal,0.00,394.03,394.03,0.00,0.00
,,,total,,294.03,394.03,,,0.00
`;

describe("1. importação válida", () => {
  const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO)]);

  it("aceita o extrato cujas contas fecham", () => {
    expect(r.arquivos[0]).toMatchObject({
      situacao: "ACEITO",
      formato: "EXTRATO_DA_CONTA",
      linhas: 9,
      saldoInicial: 10000,
      saldoFinal: 869,
      saldoConferido: true,
      periodo: { de: "2026-10-01", ate: "2026-10-31" },
    });
    expect(r.arquivos[0].erros).toEqual([]);
  });

  it("totais em centavos, sem ponto flutuante", () => {
    expect(r.resumo).toMatchObject({ quantidade: 9, entradas: 155000, saidas: -164131, liquido: -9131 });
  });

  it("classifica cada linha e deixa o desconhecido pendente", () => {
    expect(r.movimentacoes.map((m) => m.categoria)).toEqual([
      "RECEBIMENTO",
      "TRANSFERENCIA_PARA_COFRINHO",
      "SAIDA",
      "RENDIMENTO_DO_COFRINHO",
      "RETIRADA_DO_COFRINHO",
      "TARIFA_MERCADO_PAGO",
      "SAIDA",
      "DESCONHECIDA",
      "RESERVA_AUTOMATICA_POR_VENDAS",
    ]);
    expect(r.resumo.pendentes).toBe(1);
  });
});

describe("2. arquivo duplicado", () => {
  it("o mesmo conteúdo com outro nome não é lido de novo", () => {
    const r = analisarExtratos([
      arquivo("outubro.csv", EXTRATO_OUTUBRO),
      arquivo("outubro (1).csv", EXTRATO_OUTUBRO),
    ]);
    expect(r.arquivos[1].situacao).toBe("REPETIDO");
    expect(r.arquivos[1].avisos[0]).toContain("outubro.csv");
    expect(r.resumo.quantidade).toBe(9);
  });
});

describe("3 e 4. períodos sobrepostos e movimentações repetidas", () => {
  const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO), arquivo("virada.csv", EXTRATO_VIRADA)]);

  it("avisa a sobreposição", () => {
    expect(r.arquivos[1].situacao).toBe("ACEITO");
    expect(r.arquivos[1].avisos.join(" ")).toMatch(/Período sobreposto ao de "outubro.csv"/);
  });

  it("a mesma operação (mesmo id) não é somada duas vezes", () => {
    const repetidas = r.movimentacoes.filter((m) => m.repeticao?.tipo === "MESMA_OPERACAO");
    expect(repetidas.map((m) => [m.arquivo, m.idDaOperacao])).toEqual([
      [1, "90000000008"],
      [1, "90000000009"],
    ]);
    expect(repetidas[0].repeticao).toMatchObject({ arquivo: 0 });
    expect(r.resumo.quantidade).toBe(10);
    expect(r.resumo.repeticoesIgnoradas).toBe(2);
    expect(r.resumo.entradas).toBe(155000 + 1200);
  });

  it("sem identificador, data e valor iguais são só uma possível repetição (e somam)", () => {
    const semId = (saldo: string) => `RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
03-10-2026;Transferência Pix recebida Cliente Exemplo;;30,00;${saldo}
`;
    const s = analisarExtratos([arquivo("a.csv", semId("130,00")), arquivo("b.csv", semId("130,00") + "\n")]);
    expect(s.movimentacoes[1].repeticao).toMatchObject({ tipo: "POSSIVEL", arquivo: 0 });
    expect(s.movimentacoes[1].chaveConfiavel).toBe(false);
    expect(s.resumo).toMatchObject({ quantidade: 2, possiveisRepeticoes: 1, repeticoesIgnoradas: 0 });
  });
});

describe("5. transferências entre a conta e o cofrinho", () => {
  const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO)]);

  it("ida e volta ficam no grupo interno, nunca como saída ou recebimento", () => {
    const internas = r.movimentacoes.filter((m) =>
      ["TRANSFERENCIA_PARA_COFRINHO", "RETIRADA_DO_COFRINHO", "RESERVA_AUTOMATICA_POR_VENDAS"].includes(m.categoria),
    );
    expect(internas.map((m) => m.valor)).toEqual([-55000, 100000, -5000]);
    expect(r.resumo.cofrinho).toMatchObject({ enviado: 60000, retirado: 100000, liquido: -40000 });
  });

  it("'reserva' de festa não é confundida com o cofrinho", () => {
    expect(classificarMovimentacao("Pix recebido sinal da reserva 123", 5000).categoria).toBe("RECEBIMENTO");
    expect(classificarMovimentacao("Reserva", -5000).categoria).toBe("DESCONHECIDA");
  });

  it("descrição de cofrinho com o sentido trocado fica pendente", () => {
    expect(classificarMovimentacao("Dinheiro reservado Reserva Festaê", 5000)).toEqual({
      categoria: "DESCONHECIDA",
      regra: "a descrição não combina com o sentido do valor",
    });
    expect(classificarMovimentacao("Transferência Reserva Festaê", 5000).categoria).toBe("RETIRADA_DO_COFRINHO");
    expect(classificarMovimentacao("Dinheiro retirado", -5000).categoria).toBe("DESCONHECIDA");
  });
});

describe("6. rendimentos do cofrinho", () => {
  it("rendimento é separado e não vira recebimento", () => {
    const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO)]);
    expect(r.resumo.cofrinho.rendimentos).toBe(31);
    expect(r.resumo.porCategoria.find((c) => c.categoria === "RECEBIMENTO")?.entradas).toBe(50000);
  });
});

describe("descrições confirmadas no aplicativo: sentido trocado fica pendente", () => {
  const pendente = { categoria: "DESCONHECIDA", regra: "a descrição não combina com o sentido do valor" };

  it("'Reserva por vendas' só vale como saída para o cofrinho", () => {
    expect(classificarMovimentacao("Reserva por vendas", -5000).categoria).toBe("RESERVA_AUTOMATICA_POR_VENDAS");
    expect(classificarMovimentacao("Reserva por vendas", 5000)).toEqual(pendente);
  });

  it("'Rendimentos' negativo não é rendimento", () => {
    expect(classificarMovimentacao("Rendimentos", 31).categoria).toBe("RENDIMENTO_DO_COFRINHO");
    expect(classificarMovimentacao("Rendimentos", -31)).toEqual(pendente);
  });

  it("no arquivo: as duas linhas ficam pendentes e fora dos totais do cofrinho", () => {
    const extrato = `RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
03-10-2026;Reserva por vendas;90000000201;50,00;150,00
04-10-2026;Rendimentos;90000000202;-0,10;149,90
`;
    const r = analisarExtratos([arquivo("sentido-trocado.csv", extrato)]);
    expect(r.arquivos[0].situacao).toBe("ACEITO");
    expect(r.movimentacoes.map((m) => m.categoria)).toEqual(["DESCONHECIDA", "DESCONHECIDA"]);
    // Compara como número (o resumo pode devolver -0, que vale zero).
    const cofrinho = Object.fromEntries(Object.entries(r.resumo.cofrinho).map(([k, v]) => [k, v + 0]));
    expect(cofrinho).toEqual({ enviado: 0, retirado: 0, liquido: 0, rendimentos: 0 });
    expect(r.resumo.pendentes).toBe(2);
  });
});

describe("7. tarifas e diferença entre bruto e líquido", () => {
  const r = analisarExtratos([arquivo("liberacoes.csv", LIBERACOES)]);

  it("o valor que conta é o líquido; bruto e tarifa ficam à parte", () => {
    expect(r.arquivos[0]).toMatchObject({ situacao: "ACEITO", formato: "LIBERACOES", saldoInicial: 10000, saldoConferido: true });
    const [p1] = r.movimentacoes;
    expect(p1).toMatchObject({ valor: 9801, valorBruto: 10000, tarifa: 199, referenciaExterna: "cobranca-exemplo-1" });
    expect(r.resumo.tarifasEmbutidas).toBe(199 + 398);
    expect(r.resumo.diferencaBrutoLiquido).toBe(199 + 398);
    expect(r.movimentacoes.map((m) => m.categoria)).toEqual(["RECEBIMENTO", "RECEBIMENTO", "SAIDA"]);
  });

  it("crédito e débito com o sentido trocado não fecham com o saldo: recusado", () => {
    const trocado = LIBERACOES.replace(",98.01,0.00,", ",0.00,98.01,");
    const t = analisarExtratos([arquivo("trocado.csv", trocado)]);
    expect(t.arquivos[0].situacao).toBe("RECUSADO");
    expect(t.arquivos[0].erros.join(" ")).toMatch(/saldo parcial não fecha/);
    expect(t.movimentacoes).toEqual([]);
  });

  it("sem coluna de saldo, aceita com aviso de que o sentido não foi conferido", () => {
    const semSaldo = LIBERACOES.split("\n")
      .map((l) => l.split(",").slice(0, 9).join(","))
      .join("\n");
    const s = analisarExtratos([arquivo("sem-saldo.csv", semSaldo)]);
    expect(s.arquivos[0]).toMatchObject({ situacao: "ACEITO", saldoConferido: false });
    expect(s.arquivos[0].avisos.join(" ")).toMatch(/BALANCE_AMOUNT/);
  });
});

describe("8. datas na virada do mês", () => {
  it("com fuso, o dia é o de Brasília: 31/10 23:30 (-04:00) cai em novembro", () => {
    expect(lerData("2026-10-31T23:30:00.000-04:00")).toEqual({
      dia: "2026-11-01",
      dataBrasilia: "2026-11-01 00:30",
      fusoInformado: true,
    });
    const r = analisarExtratos([arquivo("liberacoes.csv", LIBERACOES)]);
    expect(r.movimentacoes[1].dataOriginal).toBe("2026-10-31T23:30:00.000-04:00");
    expect(r.resumo.porMes).toEqual([
      { mes: "2026-10", entradas: 9801, saidas: 0, liquido: 9801 },
      { mes: "2026-11", entradas: 19602, saidas: -39403, liquido: -19801 },
    ]);
  });

  it("sem fuso, vale o dia escrito, com aviso", () => {
    expect(lerData("31/10/2026 23:59")).toEqual({ dia: "2026-10-31", dataBrasilia: null, fusoInformado: false });
    const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO)]);
    expect(r.arquivos[0].avisos.join(" ")).toMatch(/sem fuso/);
    expect(r.resumo.porMes.map((m) => m.mes)).toEqual(["2026-10"]);
  });
});

describe("9. arquivos inválidos ou incompletos", () => {
  const recusa = (nome: string, conteudo: string | Uint8Array) =>
    analisarExtratos([
      typeof conteudo === "string" ? arquivo(nome, conteudo) : { nome, hash: nome, bytes: conteudo },
    ]).arquivos[0];

  it("vazio, PDF e Excel", () => {
    expect(recusa("vazio.csv", "").erros[0]).toMatch(/vazio/);
    expect(recusa("extrato.pdf", new TextEncoder().encode("%PDF-1.4 ...")).erros[0]).toMatch(/PDF/);
    expect(recusa("extrato.xlsx", new Uint8Array([0x50, 0x4b, 3, 4])).erros[0]).toMatch(/Excel/);
  });

  it("formato desconhecido mostra só os nomes das colunas", () => {
    expect(recusa("x.csv", "data;valor\n01/10/2026;10,00\n").erros[0]).toBe(
      "Formato não reconhecido. Colunas encontradas: data, valor.",
    );
    expect(recusa("y.csv", "Fulano;123.456.789-00\n").erros[0]).toMatch(/não parece um cabeçalho/);
  });

  it("relatório de vendas não é tratado como extrato", () => {
    const vendas = "SOURCE_ID,TRANSACTION_TYPE,TRANSACTION_AMOUNT,SETTLEMENT_NET_AMOUNT\n1,SETTLEMENT,10.00,9.50\n";
    expect(recusa("vendas.csv", vendas).erros[0]).toMatch(/relatório de vendas/);
  });

  it("linha faltando: resumo e saldo parcial não fecham", () => {
    const incompleto = EXTRATO_OUTUBRO.replace(/^05-10-2026.*\n/m, "");
    const a = recusa("incompleto.csv", incompleto);
    expect(a.situacao).toBe("RECUSADO");
    expect(a.erros.join(" ")).toMatch(/não fecha|incompleto/);
  });

  it("valor com três casas e data impossível", () => {
    const ruim = EXTRATO_OUTUBRO.replace("0,31;10,31", "0,315;10,31").replace("16-10-2026", "32-10-2026");
    const a = recusa("ruim.csv", ruim);
    expect(a.erros).toEqual(expect.arrayContaining([expect.stringMatching(/valor inválido/), expect.stringMatching(/data inválida/)]));
  });

  it("formatos diferentes no mesmo lote: o segundo é recusado", () => {
    const r = analisarExtratos([arquivo("outubro.csv", EXTRATO_OUTUBRO), arquivo("liberacoes.csv", LIBERACOES)]);
    expect(r.arquivos[1].situacao).toBe("RECUSADO");
    expect(r.resumo.quantidade).toBe(9);
  });

  it("arquivo em Windows-1252 é lido, com aviso", () => {
    const bytes = Uint8Array.from(Buffer.from(EXTRATO_OUTUBRO, "latin1"));
    const a = analisarExtratos([{ nome: "latin1.csv", hash: "l", bytes }]);
    expect(a.arquivos[0].situacao).toBe("ACEITO");
    expect(a.arquivos[0].avisos[0]).toMatch(/Windows-1252/);
    expect(a.movimentacoes[1].descricao).toBe("Dinheiro reservado Reserva Festaê");
  });
});

describe("leitura de valores", () => {
  it("vírgula e ponto, com e sem milhar", () => {
    expect(lerCentavos("1.234,56", "VIRGULA")).toBe(123456);
    expect(lerCentavos("-0,5", "VIRGULA")).toBe(-50);
    expect(lerCentavos("R$ 10", "VIRGULA")).toBe(1000);
    expect(lerCentavos("1234.5", "PONTO")).toBe(123450);
    expect(lerCentavos("", "PONTO")).toBeNull();
    expect(lerCentavos("1,234.56", "VIRGULA")).toBeUndefined();
    expect(lerCentavos("1.234", "PONTO")).toBeUndefined();
  });
});
