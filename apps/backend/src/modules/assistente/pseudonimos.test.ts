import { describe, expect, it } from "vitest";
import { Pseudonimos } from "./pseudonimos";

describe("códigos de fornecedor (achado #14)", () => {
  it("o mesmo nome tem sempre o mesmo código; nomes diferentes, códigos diferentes", () => {
    const p = new Pseudonimos();
    expect(p.codigo("Meta Ads")).toBe("[F1]");
    expect(p.codigo("META ADS ")).toBe("[F1]");
    expect(p.codigo("meta-ads")).toBe("[F1]");
    expect(p.codigo("Meta Imóveis")).toBe("[F2]");
    expect(p.codigo("   ")).toBe("");
  });

  it("revela só os códigos conhecidos entre colchetes (ou «»); texto comum com F1 fica como está", () => {
    const p = new Pseudonimos();
    p.codigo("Maria Souza Lima");
    expect(p.revelar("Com [F1], R$ 10,00.")).toBe("Com Maria Souza Lima, R$ 10,00.");
    expect(p.revelar("Com «F1».")).toBe("Com Maria Souza Lima.");
    // Revisão: "Kit F1" é nome de produto, não código.
    expect(p.revelar("O Kit F1 e o Painel F1 estão livres.")).toBe("O Kit F1 e o Painel F1 estão livres.");
    expect(p.revelar("Com [F9] e [AF1].")).toBe("Com [F9] e [AF1].");
    expect(new Pseudonimos().revelar("[F1]")).toBe("[F1]");
  });

  it("o nome mostrado é o do cadastro, mesmo que a pessoa tenha digitado antes de outro jeito", () => {
    const p = new Pseudonimos();
    expect(p.codigo("meta ads", { doCadastro: false })).toBe("[F1]");
    expect(p.revelar("[F1]")).toBe("meta ads");
    p.codigo("Meta Ads");
    p.codigo("META ADS");
    expect(p.revelar("[F1]")).toBe("Meta Ads");
  });

  it("clientes e sócios têm códigos próprios; pessoas diferentes com o mesmo primeiro nome, códigos diferentes", () => {
    const p = new Pseudonimos();
    expect(p.codigo("Ana", { tipo: "C", chave: "ana souza|00000000000" })).toBe("[C1]");
    expect(p.codigo("Ana", { tipo: "C", chave: "ana lima|" })).toBe("[C2]");
    expect(p.codigo("Ana", { tipo: "C", chave: "ana souza|00000000000" })).toBe("[C1]");
    expect(p.codigo("Ana", { tipo: "S", chave: "socio-1" })).toBe("[S1]");
    expect(p.codigo("Ana")).toBe("[F1]");
    expect(p.revelar("[C1], [C2], [S1] e [F1]")).toBe("Ana, Ana, Ana e Ana");
  });

  it("chave explícita usada como está: contatos diferentes não se juntam", () => {
    const p = new Pseudonimos();
    expect(p.codigo("Ana", { tipo: "C", chave: "Ana|silva.souza@exemplo.test" })).toBe("[C1]");
    expect(p.codigo("Ana", { tipo: "C", chave: "Ana|silva-souza@exemplo.test" })).toBe("[C2]");
    expect(p.codigo("Ana", { tipo: "C", chave: "ANA|silva.souza@exemplo.test" })).toBe("[C1]");
  });

  it("revelar por tipo: o campo de fornecedor só troca código de fornecedor", () => {
    const p = new Pseudonimos();
    p.codigo("Meta Ads");
    p.codigo("Renata", { tipo: "C", chave: "renata|contrato 1" });
    expect(p.revelar("[F1] [C1]", ["F"])).toBe("Meta Ads [C1]");
    expect(p.revelarEmValores(["[C1]", "[F1]"], ["F"])).toEqual(["[C1]", "Meta Ads"]);
  });

  it("parâmetros que a IA devolve com códigos voltam a ter os nomes, em qualquer profundidade", () => {
    const p = new Pseudonimos();
    p.codigo("Meta Ads");
    p.codigo("Loja de Balões");
    expect(p.revelarEmValores({ periodo: "outubro", fornecedor: "[F2]", fornecedoresConfirmados: ["[F1]", "«F2»"], limite: 5, listar: true, nada: null })).toEqual({
      periodo: "outubro",
      fornecedor: "Loja de Balões",
      fornecedoresConfirmados: ["Meta Ads", "Loja de Balões"],
      limite: 5,
      listar: true,
      nada: null,
    });
  });
});
