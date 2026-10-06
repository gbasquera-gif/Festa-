import { lerComposicaoCongelada } from "@festae/shared";
import type { Conflito, PedidoComprometido } from "../availability/item-commitment";
import { somarCompromisso } from "../availability/item-commitment";

/**
 * O material que uma proposta compromete — ou comprometeria.
 *
 * A regra de disponibilidade é a mesma da reserva (`conflitosDeItens`): para
 * cada peça, o que já está comprometido no dia mais o pedido não pode passar
 * do estoque. O que muda é quem conta como comprometido. Além das reservas,
 * contam as propostas APROVADAS que ainda não viraram reserva: a cliente
 * aceitou e está a caminho do sinal, e a peça dela não pode ser oferecida
 * de novo a outra cliente para a mesma data. É uma reserva provisória — dura
 * até a proposta virar reserva (aí conta como reserva) ou ser marcada como
 * perdida (aí libera).
 */

/** Uma opção como está no banco, no que importa para o material. */
export type OpcaoComMaterial = {
  kitId: string | null;
  composicaoDoKit: unknown;
  itens: { productId: string | null; quantidade: number }[];
};

/**
 * O que a opção seguraria se virasse reserva — a mesma composição que a
 * conversão usa: o kit congelado no envio, quando existe; senão o kit atual
 * do catálogo (proposta antiga, ou rascunho ainda não enviado). Mais os itens
 * avulsos de catálogo. Linha manual não tem peça e não compromete nada.
 */
export function demandaDaOpcao(
  opcao: OpcaoComMaterial,
  kitDoCatalogo: (kitId: string) => { productId: string; quantity: number }[] | undefined,
): PedidoComprometido {
  const congelada = lerComposicaoCongelada(opcao.composicaoDoKit);
  const itensDoKit = congelada
    ? congelada.itens.map((i) => ({ productId: i.productId, quantity: i.quantidade }))
    : opcao.kitId
      ? (kitDoCatalogo(opcao.kitId) ?? [])
      : [];
  const itensAvulsos = opcao.itens
    .filter((i): i is { productId: string; quantidade: number } => Boolean(i.productId))
    .map((i) => ({ productId: i.productId, quantity: i.quantidade }));
  return { itensDoKit, itensAvulsos };
}

/** Soma o que várias propostas aprovadas seguram, por peça. */
export function compromissoDasAprovadas(demandas: readonly PedidoComprometido[]): Map<string, number> {
  return somarCompromisso([...demandas]);
}

/**
 * A frase que a cliente lê quando a opção não cabe mais na data.
 *
 * Nomeia as peças, sem números: estoque não diz nada para ela e expõe o
 * tamanho do acervo. Não sugere "escolha outra data" — numa proposta, a data
 * é combinada com a Festaê, não trocada pela cliente.
 */
export function mensagemDeFaltaNaAprovacao(conflitos: readonly Conflito[]): string {
  const nomes = [...new Set(conflitos.map((c) => c.nome))];
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  const verbo = nomes.length === 1 ? "já está reservado" : "já estão reservados";
  return `${lista} ${verbo} para esta data por outra festa, e esta opção não pode ser aprovada assim. Fale com a Festaê pelo WhatsApp: ajustamos sua proposta com você.`;
}
