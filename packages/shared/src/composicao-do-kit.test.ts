import { describe, expect, it } from "vitest";
import {
  composicaoParaExibir,
  lerComposicaoCongelada,
  montarComposicaoDoKit,
  textoDaComposicao,
} from "./composicao-do-kit";

const produto = (id: string, name: string, active = true) => ({ id, name, active });

describe("composição de um kit do catálogo", () => {
  const kit = {
    id: "k1",
    name: "Kit Essencial",
    products: [
      { quantity: 3, product: produto("band", "Bandejas") },
      { quantity: 1, product: produto("painel", "Painel redondo") },
      { quantity: 2, product: produto("cil", "Cilindros") },
      { quantity: 1, product: produto("velho", "Boleira antiga", false) },
    ],
  };

  it("usa nomes e quantidades reais, em ordem alfabética", () => {
    expect(montarComposicaoDoKit(kit)).toEqual({
      kitId: "k1",
      kitNome: "Kit Essencial",
      itens: [
        { productId: "band", nome: "Bandejas", quantidade: 3 },
        { productId: "cil", nome: "Cilindros", quantidade: 2 },
        { productId: "painel", nome: "Painel redondo", quantidade: 1 },
      ],
    });
  });

  it("produto inativo fica de fora, como na loja", () => {
    expect(montarComposicaoDoKit(kit).itens.map((i) => i.productId)).not.toContain("velho");
  });

  it("kit vazio tem composição vazia", () => {
    expect(montarComposicaoDoKit({ id: "k2", name: "Vazio", products: [] }).itens).toEqual([]);
  });

  it("texto em uma linha", () => {
    expect(textoDaComposicao(montarComposicaoDoKit(kit).itens)).toBe("3 Bandejas · 2 Cilindros · 1 Painel redondo");
  });
});

describe("composição congelada", () => {
  const congelada = { kitId: "k1", kitNome: "Kit Essencial", itens: [{ productId: "a", nome: "A", quantidade: 1 }] };
  const catalogo = { kitId: "k1", kitNome: "Kit Essencial (novo nome)", itens: [{ productId: "d", nome: "D", quantidade: 2 }] };

  it("lê o formato gravado e recusa o resto", () => {
    expect(lerComposicaoCongelada(congelada)).toEqual(congelada);
    expect(lerComposicaoCongelada(null)).toBeNull();
    expect(lerComposicaoCongelada({ kitId: "k1" })).toBeNull();
    expect(lerComposicaoCongelada("texto")).toBeNull();
  });

  it("enviada: vale a congelada, mesmo com o catálogo mudado", () => {
    expect(composicaoParaExibir({ status: "ENVIADO", congelada, catalogo })).toEqual({
      ...congelada,
      origem: "ENVIADA",
      semRegistro: false,
    });
  });

  it("rascunho: vale o catálogo", () => {
    expect(composicaoParaExibir({ status: "RASCUNHO", congelada: null, catalogo })).toMatchObject({
      origem: "CATALOGO",
      semRegistro: false,
      itens: catalogo.itens,
    });
  });

  it("enviada antes do registro: catálogo com aviso", () => {
    expect(composicaoParaExibir({ status: "ENVIADO", congelada: null, catalogo })).toMatchObject({
      origem: "CATALOGO",
      semRegistro: true,
    });
  });

  it("sem kit, nada", () => {
    expect(composicaoParaExibir({ status: "RASCUNHO", congelada: null, catalogo: null })).toBeNull();
  });
});
