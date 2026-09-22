import { describe, expect, it } from "vitest";
import { splitPayment } from "./pricing";
import {
  calcularOrcamento,
  calcularSinal,
  exigeNovaVersao,
  mensagemDaProposta,
  podeSerAprovada,
  primeiroNome,
  situacaoDoOrcamento,
  totalDaLinha,
  valorOficialDoOrcamento,
  type LinhaDoOrcamento,
} from "./orcamento";

const linha = (valorUnitario: number, quantidade = 1): LinhaDoOrcamento => ({
  tipo: "PRODUTO",
  descricao: "Peça",
  quantidade,
  valorUnitario,
});

describe("calcularOrcamento", () => {
  it("soma em centavos: 3 × 16,65 é 49,95 e não 49,949999", () => {
    expect(calcularOrcamento([linha(16.65, 3)]).subtotal).toBe(49.95);
    expect(totalDaLinha(linha(16.65, 3))).toBe(49.95);
  });

  it("desconto abate, entrega e montagem somam", () => {
    const t = calcularOrcamento([linha(1000)], 100, 80, 120);
    expect(t.subtotal).toBe(1000);
    expect(t.desconto).toBe(100);
    expect(t.total).toBe(1100);
  });

  it("desconto maior que o subtotal é limitado ao subtotal", () => {
    const t = calcularOrcamento([linha(500)], 900);
    expect(t.desconto).toBe(500);
    expect(t.total).toBe(0);
  });

  it("nunca devolve total negativo", () => {
    expect(calcularOrcamento([linha(100)], 1000).total).toBe(0);
  });

  it("proposta vazia soma zero em vez de quebrar", () => {
    expect(calcularOrcamento([]).total).toBe(0);
  });

  it("o total é a soma das linhas exibidas", () => {
    const linhas = [linha(199.9, 2), linha(35.5, 3), linha(1200)];
    const soma = linhas.reduce((s, l) => s + totalDaLinha(l), 0);
    expect(calcularOrcamento(linhas).subtotal).toBe(Number(soma.toFixed(2)));
  });
});

describe("situacaoDoOrcamento", () => {
  const agora = new Date("2026-09-20T12:00:00.000Z");

  it("enviada dentro da validade continua enviada", () => {
    expect(situacaoDoOrcamento("ENVIADO", "2026-09-30T12:00:00.000Z", agora)).toBe("ENVIADO");
  });

  it("enviada fora da validade é lida como expirada, sem depender de rotina", () => {
    expect(situacaoDoOrcamento("ENVIADO", "2026-09-10T12:00:00.000Z", agora)).toBe("EXPIRADO");
  });

  it("aprovada não expira — o negócio já fechou", () => {
    expect(situacaoDoOrcamento("APROVADO", "2026-01-01T12:00:00.000Z", agora)).toBe("APROVADO");
  });

  it("rascunho fora da validade continua rascunho", () => {
    expect(situacaoDoOrcamento("RASCUNHO", "2026-01-01T12:00:00.000Z", agora)).toBe("RASCUNHO");
  });
});

describe("podeSerAprovada", () => {
  const agora = new Date("2026-09-20T12:00:00.000Z");

  it("só enviada e no prazo", () => {
    expect(podeSerAprovada("ENVIADO", "2026-09-30T12:00:00.000Z", agora)).toBe(true);
    expect(podeSerAprovada("ENVIADO", "2026-09-01T12:00:00.000Z", agora)).toBe(false);
    expect(podeSerAprovada("RASCUNHO", "2026-09-30T12:00:00.000Z", agora)).toBe(false);
    expect(podeSerAprovada("APROVADO", "2026-09-30T12:00:00.000Z", agora)).toBe(false);
  });
});

describe("exigeNovaVersao", () => {
  it("rascunho se edita no lugar; o que já saiu, não", () => {
    expect(exigeNovaVersao("RASCUNHO")).toBe(false);
    expect(exigeNovaVersao("ENVIADO")).toBe(true);
    expect(exigeNovaVersao("APROVADO")).toBe(true);
  });
});

describe("calcularSinal", () => {
  it("usa 30% quando a proposta não define percentual", () => {
    expect(calcularSinal(1000)).toEqual({ percentual: 30, valor: 300, saldo: 700 });
    expect(calcularSinal(1000, null)).toEqual({ percentual: 30, valor: 300, saldo: 700 });
  });

  it("respeita o percentual da proposta quando existe", () => {
    expect(calcularSinal(1000, 50)).toEqual({ percentual: 50, valor: 500, saldo: 500 });
    expect(calcularSinal(1000, 0)).toEqual({ percentual: 0, valor: 0, saldo: 1000 });
  });

  it("arredonda em centavos, e sinal mais saldo devolvem o total", () => {
    const { valor, saldo } = calcularSinal(1250.33, 30);
    expect(valor).toBe(375.1);
    expect(Number((valor + saldo).toFixed(2))).toBe(1250.33);
  });

  it("o sinal da proposta é o mesmo de splitPayment, para o mesmo total", () => {
    for (const total of [400, 520.5, 1250, 3333.33]) {
      expect(calcularSinal(total).valor).toBe(splitPayment(total).deposit);
    }
  });

  it("percentual fora da faixa é contido em vez de virar valor absurdo", () => {
    expect(calcularSinal(1000, 150).valor).toBe(1000);
    expect(calcularSinal(1000, -10).valor).toBe(0);
  });
});

describe("mensagemDaProposta", () => {
  const link = "https://painel.festaechapeco.com.br/proposta/abc123";

  it("chama a cliente pelo primeiro nome e não deixa marcador por preencher", () => {
    const m = mensagemDaProposta("Ana Paula Ribeiro de Souza", link);
    expect(m.startsWith("Oi, Ana! 💛 Preparamos uma proposta para a sua festa.")).toBe(true);
    expect(m).toContain(link);
    expect(m).not.toContain("[LINK]");
    expect(m).not.toContain("Ribeiro");
  });

  it("preserva as quebras de linha da mensagem", () => {
    const linhas = mensagemDaProposta("Ana", link).split("\n");
    expect(linhas).toEqual([
      "Oi, Ana! 💛 Preparamos uma proposta para a sua festa.",
      "",
      "Veja sua proposta:",
      link,
      "",
      "Se gostar, você pode aprovar por lá e visualizar os dados para o sinal e reserva da data.",
    ]);
  });

  it("deixa o link sozinho na linha, cru — é assim que o WhatsApp o reconhece", () => {
    const linhas = mensagemDaProposta("Ana", link).split("\n");
    expect(linhas[3]).toBe(link);
    const m = mensagemDaProposta("Ana", link);
    expect(m).not.toMatch(/\[.*\]\(.*\)/);
    expect(m).not.toContain("<a ");
  });

  it("aguenta nome com espaços sobrando e nome vazio", () => {
    expect(mensagemDaProposta("  Maria   Luiza  ", link).startsWith("Oi, Maria!")).toBe(true);
    expect(mensagemDaProposta("   ", link).startsWith("Oi! 💛")).toBe(true);
  });

  it("primeiroNome devolve vazio quando não há nome", () => {
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(" Joana Silva ")).toBe("Joana");
  });
});

describe("valorOficialDoOrcamento", () => {
  it("sem valor final, o oficial é a composição", () => {
    const v = valorOficialDoOrcamento(1190);
    expect(v).toEqual({ total: 1190, totalCalculado: 1190, manual: false, diferenca: 0 });
    expect(valorOficialDoOrcamento(1190, null).manual).toBe(false);
  });

  it("valor final menor vale, e a composição continua registrada", () => {
    const v = valorOficialDoOrcamento(1190, 1100);
    expect(v.total).toBe(1100);
    expect(v.totalCalculado).toBe(1190);
    expect(v.manual).toBe(true);
    expect(v.diferenca).toBe(-90);
  });

  it("valor final maior também vale — não é desconto, é negociação", () => {
    const v = valorOficialDoOrcamento(1190, 1300);
    expect(v.total).toBe(1300);
    expect(v.diferenca).toBe(110);
  });

  it("o sinal e o saldo saem do valor final, não da composição", () => {
    const { total } = valorOficialDoOrcamento(1190, 1100);
    const { valor, saldo } = calcularSinal(total, 30);
    expect(valor).toBe(330);
    expect(saldo).toBe(770);
  });

  it("valor negativo é contido em zero, e zero continua sendo permitido", () => {
    expect(valorOficialDoOrcamento(1190, -50).total).toBe(0);
    expect(valorOficialDoOrcamento(1190, 0)).toMatchObject({ total: 0, manual: true, diferenca: -1190 });
    expect(calcularSinal(0, 30)).toEqual({ percentual: 30, valor: 0, saldo: 0 });
  });

  it("arredonda em centavos como o resto do dinheiro", () => {
    expect(valorOficialDoOrcamento(1190, 1100.005).total).toBe(1100.01);
    expect(valorOficialDoOrcamento(1190.004).totalCalculado).toBe(1190);
  });
});
