import { describe, expect, it } from "vitest";
import {
  alternar,
  categoriasDoCatalogo,
  definirQuantidade,
  filtrarCatalogo,
  incluirNaReserva,
  quantidadeValida,
  resumoDaSelecao,
  selecionadosEmOrdem,
  type ProdutoDoSeletor,
} from "./selecao-de-itens";

const catalogo: ProdutoDoSeletor[] = [
  { id: "a", name: "Arco de Balões Rosé", unitPrice: "120", category: "DECORACAO", stockQuantity: 2 },
  { id: "b", name: "Mesa Cilindro Branca", unitPrice: "60", category: "MOBILIARIO", stockQuantity: 3 },
  { id: "c", name: "Painel Redondo", unitPrice: "80", category: "DECORACAO", stockQuantity: 0 },
  { id: "d", name: "Cordão de Luz", unitPrice: "25", category: "ILUMINACAO", stockQuantity: 5 },
  { id: "e", name: "Bandeja Espelhada", unitPrice: "15", category: "DECORACAO", stockQuantity: 8 },
  { id: "f", name: "Boleira Dourada", unitPrice: "20", category: "DECORACAO", stockQuantity: 4 },
];
const semFiltro = { busca: "", categoria: "", somenteSelecionados: false, selecao: {} };

describe("seletor de vários itens", () => {
  it("busca sem diferenciar acento nem maiúscula, com várias palavras", () => {
    expect(filtrarCatalogo(catalogo, { ...semFiltro, busca: "BALOES rose" }).map((p) => p.id)).toEqual(["a"]);
    expect(filtrarCatalogo(catalogo, { ...semFiltro, busca: "MESA branca" }).map((p) => p.id)).toEqual(["b"]);
    expect(filtrarCatalogo(catalogo, { ...semFiltro, busca: "  " })).toHaveLength(6);
  });

  it("filtra por categoria e combina com a busca", () => {
    expect(filtrarCatalogo(catalogo, { ...semFiltro, categoria: "DECORACAO" }).map((p) => p.id)).toEqual(["a", "c", "e", "f"]);
    expect(filtrarCatalogo(catalogo, { ...semFiltro, categoria: "DECORACAO", busca: "dourada" }).map((p) => p.id)).toEqual(["f"]);
  });

  it("buscar e trocar de categoria não desmarca nada", () => {
    let selecao = {};
    for (const id of ["a", "b", "d"]) selecao = alternar(selecao, id);
    // A lista filtrada muda; a seleção é outro estado e continua inteira.
    expect(filtrarCatalogo(catalogo, { ...semFiltro, busca: "painel", selecao })).toHaveLength(1);
    expect(filtrarCatalogo(catalogo, { ...semFiltro, categoria: "ILUMINACAO", selecao })).toHaveLength(1);
    expect(Object.keys(selecao)).toEqual(["a", "b", "d"]);
    expect(filtrarCatalogo(catalogo, { ...semFiltro, somenteSelecionados: true, selecao }).map((p) => p.id)).toEqual(["a", "b", "d"]);
  });

  it("marca, desmarca e ajusta quantidade só com inteiros de 1 a 999", () => {
    let s = alternar({}, "a");
    expect(s).toEqual({ a: 1 });
    s = definirQuantidade(s, "a", "4");
    expect(s).toEqual({ a: 4 });
    expect(definirQuantidade(s, "a", 0)).toEqual({ a: 1 });
    expect(definirQuantidade(s, "a", "2.7")).toEqual({ a: 2 });
    expect(definirQuantidade(s, "a", 5000)).toEqual({ a: 999 });
    expect(definirQuantidade(s, "z", 3)).toBe(s); // não marcado: nada muda
    expect(alternar(s, "a")).toEqual({});
    expect(quantidadeValida("abc")).toBe(1);
  });

  it("cinco ou mais peças entram de uma vez, na ordem do catálogo, com as quantidades", () => {
    let s = {};
    for (const id of ["f", "d", "a", "e", "b"]) s = alternar(s, id);
    s = definirQuantidade(s, "e", 10);
    expect(resumoDaSelecao(s)).toEqual({ itens: 5, unidades: 14 });
    expect(selecionadosEmOrdem(catalogo, s).map((i) => [i.produto.id, i.quantidade])).toEqual([
      ["a", 1], ["b", 1], ["d", 1], ["e", 10], ["f", 1],
    ]);
  });

  it("categorias do catálogo, com o rótulo das telas", () => {
    expect(categoriasDoCatalogo(catalogo)).toEqual([
      { valor: "DECORACAO", rotulo: "Decoração" },
      { valor: "ILUMINACAO", rotulo: "Iluminação" },
      { valor: "MOBILIARIO", rotulo: "Mesas e apoios" },
    ]);
  });

  it("reserva: peça aparece uma vez; incluída não é tocada, nova entra com a quantidade escolhida", () => {
    const extras = { a: 2, c: 0 };
    expect(incluirNaReserva(extras, { a: 5, c: 3, d: 4 })).toEqual({ a: 2, c: 3, d: 4 });
    expect(extras).toEqual({ a: 2, c: 0 }); // não muda o objeto de origem
  });
});
