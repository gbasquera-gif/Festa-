import { describe, expect, it } from "vitest";
import { semContatoNemDocumento } from "./minimizacao";

describe("contato e documento digitados", () => {
  it.each([
    ["ana.souza@exemplo.invalid", "[e-mail omitido]"],
    ["(49) 99876-0001", "[telefone omitido]"],
    ["49 99876-0001", "[telefone omitido]"],
    ["+55 49 99876-0001", "[telefone omitido]"],
    ["(49) 3322-1100", "[telefone omitido]"],
    ["123.456.789-09", "[documento omitido]"],
    ["12345678909", "[documento omitido]"],
    ["12.345.678/0001-90", "[documento omitido]"],
    ["12345678000190", "[documento omitido]"],
  ])("%s sai como aviso", (dado, aviso) => {
    expect(semContatoNemDocumento(`a cliente ${dado} tem festa?`)).toBe(`a cliente ${aviso} tem festa?`);
  });

  it("11 dígitos seguidos (celular sem pontuação ou CPF): sai omitido de um jeito ou de outro", () => {
    expect(semContatoNemDocumento("ligar para 49998760001 hoje")).toMatch(/^ligar para \[(telefone|documento) omitido\] hoje$/);
  });

  it.each([
    "Quanto entrou entre 01/10/2026 e 15/10/2026?",
    "O contrato nº 0041 de R$ 1.234,56 já foi pago?",
    "Faturamento de 2025 e 2026",
    "Quantas festas no dia 14 de novembro de 2026, às 15h30?",
    "Gastos acima de R$ 12.500,00 no 3º trimestre",
    "Top 10 fornecedores em 2026-10",
  ])("data, valor e número comum ficam como estão: %s", (texto) => {
    expect(semContatoNemDocumento(texto)).toBe(texto);
  });
});
