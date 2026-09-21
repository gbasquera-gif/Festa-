import { describe, expect, it } from "vitest";
import {
  calcularOrcamento,
  exigeNovaVersao,
  podeSerAprovada,
  situacaoDoOrcamento,
  totalDaLinha,
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
