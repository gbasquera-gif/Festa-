import { describe, expect, it } from "vitest";
import { citaNaDescricao, resolverNome, semelhanca, type NomeCadastrado } from "./correspondencia";

const nomes = (...pares: [string, number][]): NomeCadastrado[] => pares.map(([nome, lancamentos]) => ({ nome, lancamentos }));

describe("resolução de fornecedor", () => {
  it("igual depois de normalizar: maiúsculas, acentos e espaços não separam", () => {
    const r = resolverNome("meta ads", null, nomes(["Meta Ads", 3], ["META  ADS ", 1], ["Loja de Balões", 5]));
    expect(r).toEqual({ tipo: "ENCONTRADO", criterio: "IGUAL", chaves: ["meta ads"], grafias: ["Meta Ads", "META  ADS"] });
    expect(resolverNome("loja de baloes", null, nomes(["Loja de Balões", 5]))).toMatchObject({ tipo: "ENCONTRADO", criterio: "IGUAL" });
  });

  it("contém, com uma grafia só: encontra e diz o critério", () => {
    expect(resolverNome("meta", null, nomes(["Meta Ads", 3], ["Papelaria", 2]))).toMatchObject({ tipo: "ENCONTRADO", criterio: "CONTEM", chaves: ["meta ads"] });
  });

  it("META e META ADS não são unidos: pede para escolher", () => {
    const r = resolverNome("meta", null, nomes(["META", 2], ["META ADS", 4]));
    expect(r).toEqual({
      tipo: "AMBIGUO",
      opcoes: [
        { nome: "META", lancamentos: 2, criterio: "IGUAL" },
        { nome: "META ADS", lancamentos: 4, criterio: "CONTEM" },
      ],
    });
  });

  it("nomes semelhantes de coisas diferentes: pede para escolher", () => {
    const r = resolverNome("meta", null, nomes(["Meta Ads", 3], ["Meta Imóveis", 1]));
    expect(r).toMatchObject({ tipo: "AMBIGUO" });
    expect((r as { opcoes: { nome: string }[] }).opcoes.map((o) => o.nome)).toEqual(["Meta Ads", "Meta Imóveis"]);
  });

  it("FACEBOOK ADS nunca vira Meta sozinho", () => {
    expect(resolverNome("meta ads", null, nomes(["Facebook Ads", 6]))).toEqual({ tipo: "NAO_ENCONTRADO" });
    expect(resolverNome("meta", null, nomes(["Facebook Ads", 6], ["Meta Ads", 1]))).toMatchObject({ tipo: "ENCONTRADO", chaves: ["meta ads"] });
  });

  it("erro de digitação: só sugere, nunca soma sozinho", () => {
    expect(semelhanca("meta adds", "meta ads")).toBeGreaterThan(0.8);
    expect(resolverNome("meta adds", null, nomes(["Meta Ads", 3]))).toEqual({
      tipo: "AMBIGUO",
      opcoes: [{ nome: "Meta Ads", lancamentos: 3, criterio: "PARECIDO" }],
    });
  });

  it("confirmados: só os que existem no ERP", () => {
    const cad = nomes(["META", 2], ["META ADS", 4]);
    expect(resolverNome("meta", ["META", "META ADS"], cad)).toMatchObject({ tipo: "ENCONTRADO", criterio: "CONFIRMADO", chaves: ["meta", "meta ads"] });
    expect(resolverNome("meta", ["Inventado Ltda"], cad)).toEqual({ tipo: "NAO_ENCONTRADO" });
  });

  it("sem correspondência", () => {
    expect(resolverNome("google", null, nomes(["Meta Ads", 3]))).toEqual({ tipo: "NAO_ENCONTRADO" });
    expect(resolverNome("  ", null, nomes(["Meta Ads", 3]))).toEqual({ tipo: "NAO_ENCONTRADO" });
  });

  it("descrição: palavras inteiras (meta não acha metade)", () => {
    expect(citaNaDescricao("Anúncio Meta Ads outubro", "meta ads")).toBe(true);
    expect(citaNaDescricao("Balão metade do preço", "meta")).toBe(false);
  });
});
