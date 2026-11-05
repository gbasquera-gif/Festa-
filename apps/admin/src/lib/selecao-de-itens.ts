import { PRODUCT_CATEGORY_LABEL } from "@festae/shared";

/**
 * A lógica do seletor de vários itens, sem tela: filtrar o catálogo, marcar,
 * desmarcar e ajustar quantidades.
 *
 * Fica fora do componente para ser testada sem navegador, e para a proposta e
 * a reserva usarem exatamente a mesma regra de busca e de quantidade.
 *
 * A seleção é um mapa à parte do filtro: buscar ou trocar de categoria muda o
 * que aparece, nunca o que já foi marcado.
 */

export type ProdutoDoSeletor = {
  id: string;
  name: string;
  unitPrice: string | number;
  imageUrl?: string | null;
  category?: string;
  /** Unidades no acervo. Zero é "não temos" — mostrado, como já era nas telas. */
  stockQuantity?: number;
};

/** Produto → quantidade escolhida. Sempre inteiro, no mínimo 1. */
export type Selecao = Record<string, number>;

/** Minúsculas e sem acento: "balão" encontra "Balao" e "BALÃO". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Nome de exibição da categoria; categoria desconhecida aparece como veio. */
export function rotuloDaCategoria(categoria: string): string {
  return (PRODUCT_CATEGORY_LABEL as Record<string, string>)[categoria] ?? categoria;
}

/** As categorias que existem no catálogo carregado, em ordem alfabética do rótulo. */
export function categoriasDoCatalogo(produtos: readonly ProdutoDoSeletor[]): { valor: string; rotulo: string }[] {
  const presentes = new Set(produtos.map((p) => p.category).filter((c): c is string => !!c));
  return Array.from(presentes)
    .map((valor) => ({ valor, rotulo: rotuloDaCategoria(valor) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export function filtrarCatalogo(
  produtos: readonly ProdutoDoSeletor[],
  filtro: { busca: string; categoria: string; somenteSelecionados: boolean; selecao: Selecao },
): ProdutoDoSeletor[] {
  const termos = normalizar(filtro.busca).split(/\s+/).filter(Boolean);
  return produtos.filter((p) => {
    if (filtro.categoria && p.category !== filtro.categoria) return false;
    if (filtro.somenteSelecionados && !(p.id in filtro.selecao)) return false;
    const nome = normalizar(p.name);
    return termos.every((t) => nome.includes(t));
  });
}

/** Quantidade válida: inteiro de 1 a 999. Texto vazio ou inválido vira 1. */
export function quantidadeValida(valor: unknown): number {
  const n = Math.floor(Number(valor));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 999);
}

/** Marca com quantidade 1, ou desmarca se já estava marcado. */
export function alternar(selecao: Selecao, produtoId: string): Selecao {
  if (produtoId in selecao) {
    const { [produtoId]: _removido, ...resto } = selecao;
    return resto;
  }
  return { ...selecao, [produtoId]: 1 };
}

export function definirQuantidade(selecao: Selecao, produtoId: string, valor: unknown): Selecao {
  if (!(produtoId in selecao)) return selecao;
  return { ...selecao, [produtoId]: quantidadeValida(valor) };
}

export function resumoDaSelecao(selecao: Selecao): { itens: number; unidades: number } {
  const quantidades = Object.values(selecao);
  return { itens: quantidades.length, unidades: quantidades.reduce((s, q) => s + q, 0) };
}

/**
 * A seleção na ordem do catálogo, para os itens entrarem na composição na
 * mesma ordem em que aparecem na lista — e não na ordem dos cliques.
 */
export function selecionadosEmOrdem(
  produtos: readonly ProdutoDoSeletor[],
  selecao: Selecao,
): { produto: ProdutoDoSeletor; quantidade: number }[] {
  return produtos.filter((p) => p.id in selecao).map((p) => ({ produto: p, quantidade: selecao[p.id] }));
}

/**
 * Reserva: um produto aparece uma vez só, com uma quantidade (é a regra do
 * formulário de sempre). Item novo entra com a quantidade escolhida; item que
 * já estava na lista com quantidade zero (apagada ao digitar) volta com a
 * escolhida. Item já incluído com quantidade não é tocado — o seletor nem
 * deixa marcá-lo.
 */
export function incluirNaReserva(extras: Record<string, number>, selecao: Selecao): Record<string, number> {
  const resultado = { ...extras };
  for (const [produtoId, quantidade] of Object.entries(selecao)) {
    if ((resultado[produtoId] ?? 0) > 0) continue;
    resultado[produtoId] = quantidadeValida(quantidade);
  }
  return resultado;
}
