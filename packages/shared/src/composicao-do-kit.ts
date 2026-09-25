import { z } from "zod";

/**
 * A composição de um kit na proposta: quais peças vêm dentro dele.
 *
 * É informação, não item. Não tem preço, não soma no total, não vira linha
 * do orçamento nem compromete estoque — o kit continua sendo vendido como
 * kit, pela linha KIT e pelo `kitId`. Serve para a cliente saber o que está
 * comprando e para quem monta a proposta conferir.
 *
 * Depois do envio ela fica congelada na proposta: a cliente que recebeu
 * "A + B + C" não pode abrir o mesmo link amanhã e ver "A + B + D" porque
 * alguém editou o kit no catálogo.
 */

export type ItemDaComposicao = { productId: string; nome: string; quantidade: number };
export type ComposicaoDoKit = { kitId: string; kitNome: string; itens: ItemDaComposicao[] };

const composicaoSchema = z.object({
  kitId: z.string(),
  kitNome: z.string(),
  itens: z.array(z.object({ productId: z.string(), nome: z.string(), quantidade: z.number().int().positive() })),
});

/**
 * A composição de hoje de um kit do catálogo.
 *
 * Produto desativado fica de fora, como na loja: desativar é tirar a peça do
 * catálogo, e ela sai de dentro dos kits também. Ordem alfabética — o kit
 * não guarda ordem própria, e uma ordem estável evita a lista "mudar" entre
 * duas aberturas sem que nada tenha mudado.
 */
export function montarComposicaoDoKit(kit: {
  id: string;
  name: string;
  products: { quantity: number; product: { id: string; name: string; active: boolean } }[];
}): ComposicaoDoKit {
  return {
    kitId: kit.id,
    kitNome: kit.name,
    itens: kit.products
      .filter((p) => p.product.active && p.quantity > 0)
      .map((p) => ({ productId: p.product.id, nome: p.product.name, quantidade: p.quantity }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Lê a composição gravada na proposta. Qualquer coisa fora do formato vira nula. */
export function lerComposicaoCongelada(valor: unknown): ComposicaoDoKit | null {
  const lido = composicaoSchema.safeParse(valor);
  return lido.success ? lido.data : null;
}

/** "1 Painel redondo · 2 Cilindros · 3 Bandejas" */
export function textoDaComposicao(itens: readonly ItemDaComposicao[]): string {
  return itens.map((i) => `${i.quantidade} ${i.nome}`).join(" · ");
}

/** Até quantas peças a composição cabe numa linha só; acima disso, lista. */
export const PECAS_EM_UMA_LINHA = 6;

/** De onde vem a composição que o painel está mostrando. */
export type OrigemDaComposicao = "ENVIADA" | "CATALOGO";

/**
 * Qual composição mostrar de uma proposta.
 *
 * Congelada, se existe — é o que a cliente recebeu. Sem ela, a do catálogo,
 * que é o que a proposta levaria se fosse enviada agora. `semRegistro`
 * marca a proposta que já saiu antes de a composição passar a ser gravada:
 * o painel ainda mostra o catálogo (com aviso), mas a página da cliente não
 * — o que ela recebeu naquela época não se sabe.
 */
export function composicaoParaExibir(entrada: {
  status: string;
  congelada: unknown;
  catalogo: ComposicaoDoKit | null;
}): (ComposicaoDoKit & { origem: OrigemDaComposicao; semRegistro: boolean }) | null {
  const congelada = lerComposicaoCongelada(entrada.congelada);
  if (congelada) return { ...congelada, origem: "ENVIADA", semRegistro: false };
  if (!entrada.catalogo) return null;
  return { ...entrada.catalogo, origem: "CATALOGO", semRegistro: entrada.status !== "RASCUNHO" };
}
