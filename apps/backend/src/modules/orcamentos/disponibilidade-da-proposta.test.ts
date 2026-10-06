import { describe, expect, it } from "vitest";
import { conflitosDoPedido } from "../availability/item-commitment";
import { compromissoDasAprovadas, demandaDaOpcao, mensagemDeFaltaNaAprovacao } from "./disponibilidade-da-proposta";

const congelada = (kitId: string, itens: [string, string, number][]) => ({
  kitId,
  kitNome: "Kit",
  itens: itens.map(([productId, nome, quantidade]) => ({ productId, nome, quantidade })),
});
const semCatalogo = () => undefined;

describe("material de uma opção de proposta", () => {
  it("kit congelado no envio vale, e não o cadastro atual do kit", () => {
    const d = demandaDaOpcao(
      { kitId: "kit", composicaoDoKit: congelada("kit", [["painel", "Painel", 1], ["mesa", "Mesa", 2]]), itens: [] },
      () => [{ productId: "outra-peca", quantity: 9 }],
    );
    expect(d.itensDoKit).toEqual([{ productId: "painel", quantity: 1 }, { productId: "mesa", quantity: 2 }]);
  });

  it("sem composição congelada (rascunho ou proposta antiga), o kit do catálogo", () => {
    const d = demandaDaOpcao({ kitId: "kit", composicaoDoKit: null, itens: [] }, () => [{ productId: "painel", quantity: 1 }]);
    expect(d.itensDoKit).toEqual([{ productId: "painel", quantity: 1 }]);
  });

  it("itens avulsos de catálogo entram; linha manual (sem peça) não", () => {
    const d = demandaDaOpcao(
      { kitId: null, composicaoDoKit: null, itens: [{ productId: "balao", quantidade: 30 }, { productId: null, quantidade: 1 }] },
      semCatalogo,
    );
    expect(d).toEqual({ itensDoKit: [], itensAvulsos: [{ productId: "balao", quantity: 30 }] });
  });

  it("o que várias aprovadas seguram soma por peça, kit e avulso no mesmo balde", () => {
    const a = demandaDaOpcao({ kitId: "k", composicaoDoKit: congelada("k", [["painel", "Painel", 1]]), itens: [] }, semCatalogo);
    const b = demandaDaOpcao({ kitId: null, composicaoDoKit: null, itens: [{ productId: "painel", quantidade: 1 }] }, semCatalogo);
    expect(compromissoDasAprovadas([a, b]).get("painel")).toBe(2);
  });
});

describe("a segunda cliente com a mesma peça", () => {
  const estoque = new Map([["painel", { nome: "Painel Floral", estoque: 1 }]]);
  const pedido = demandaDaOpcao(
    { kitId: "k", composicaoDoKit: congelada("k", [["painel", "Painel Floral", 1]]), itens: [] },
    semCatalogo,
  );

  it("sem ninguém segurando, cabe", () => {
    expect(conflitosDoPedido(pedido, new Map(), estoque)).toEqual([]);
  });

  it("com a primeira aprovada segurando o único painel, não cabe", () => {
    const segurado = compromissoDasAprovadas([pedido]);
    const conflitos = conflitosDoPedido(pedido, segurado, estoque);
    expect(conflitos).toHaveLength(1);
    expect(mensagemDeFaltaNaAprovacao(conflitos)).toBe(
      "Painel Floral já está reservado para esta data por outra festa, e esta opção não pode ser aprovada assim. Fale com a Festaê pelo WhatsApp: ajustamos sua proposta com você.",
    );
  });

  it("a mensagem nomeia todas as peças, sem números de estoque", () => {
    const msg = mensagemDeFaltaNaAprovacao([
      { productId: "a", nome: "Painel", estoque: 1, jaComprometido: 1, pedido: 1 },
      { productId: "b", nome: "Mesa", estoque: 2, jaComprometido: 2, pedido: 1 },
      { productId: "c", nome: "Arco", estoque: 1, jaComprometido: 1, pedido: 1 },
    ]);
    expect(msg.startsWith("Painel, Mesa e Arco já estão reservados")).toBe(true);
    expect(msg).not.toMatch(/\d/);
  });
});
