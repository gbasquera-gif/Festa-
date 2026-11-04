import {
  ETAPA_DA_RESERVA_NO_AVISO,
  NATUREZA_DO_MOTIVO,
  lerComposicaoCongelada,
  numeroDoContrato,
  type FaltaDeItem,
  type MotivoDaFalta,
  type ResponsavelPelaFalta,
} from "@festae/shared";
import type { CompromissoDeReserva } from "../availability/availability.service";
import type { Conflito, PedidoComprometido } from "../availability/item-commitment";
import { conflitosDoPedido, somarCompromisso } from "../availability/item-commitment";

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

/** O que uma proposta aprovada, ainda sem reserva, segura na data. */
export interface CompromissoDeProposta {
  id: string;
  numero: number;
  /** O nome da opção que ela segura. */
  opcao: string;
  itens: Map<string, number>;
}

/** O que o aviso precisa saber de cada produto pedido. */
export type ProdutoParaConferir = { nome: string; identificador: string | null; estoque: number };

/**
 * Os itens de uma opção que não cabem na data, explicados.
 *
 * A decisão é de `conflitosDoPedido` — a mesma função da reserva, da
 * conversão e do link da cliente —, com o mesmo balde: reservas do dia mais
 * propostas aprovadas aguardando sinal. Aqui só se acrescenta o porquê e
 * quem: quanto falta, se o acervo nem comporta o pedido, se é reserva ou
 * proposta, e qual. Todos os itens em falta voltam, não só o primeiro.
 */
export function detalharFaltas(entrada: {
  demanda: PedidoComprometido;
  reservas: readonly CompromissoDeReserva[];
  propostas: readonly CompromissoDeProposta[];
  produtos: ReadonlyMap<string, ProdutoParaConferir>;
  /** O kit da opção, quando ela tem um. */
  kit: string | null;
}): { conflitos: Conflito[]; faltas: FaltaDeItem[] } {
  const comprometido = new Map<string, number>();
  const somar = (itens: Map<string, number>) => {
    for (const [productId, quantidade] of itens) comprometido.set(productId, (comprometido.get(productId) ?? 0) + quantidade);
  };
  for (const r of entrada.reservas) somar(r.itens);
  for (const p of entrada.propostas) somar(p.itens);

  const estoque = new Map([...entrada.produtos].map(([id, p]) => [id, { nome: p.nome, estoque: p.estoque }]));
  const conflitos = conflitosDoPedido(entrada.demanda, comprometido, estoque);

  const quanto = (lista: { productId: string; quantity: number }[], productId: string) =>
    lista.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);

  const faltas = conflitos.map((c): FaltaDeItem => {
    const responsaveis: ResponsavelPelaFalta[] = [
      ...entrada.reservas
        .filter((r) => (r.itens.get(c.productId) ?? 0) > 0)
        .map((r) => ({
          tipo: "RESERVA" as const,
          id: r.id,
          numero: numeroDoContrato(r.numero),
          detalhe: ETAPA_DA_RESERVA_NO_AVISO[r.status] ?? r.status.toLowerCase(),
          quantidade: r.itens.get(c.productId) ?? 0,
          semSinalVencida: r.semSinalVencida,
        })),
      ...entrada.propostas
        .filter((p) => (p.itens.get(c.productId) ?? 0) > 0)
        .map((p) => ({
          tipo: "PROPOSTA" as const,
          id: p.id,
          numero: `Proposta nº ${p.numero}`,
          detalhe: `opção ${p.opcao}`,
          quantidade: p.itens.get(c.productId) ?? 0,
          semSinalVencida: false,
        })),
    ];
    const disponivel = Math.max(0, c.estoque - c.jaComprometido);
    const motivo = motivoDaFalta(c, responsaveis);
    const noKit = quanto(entrada.demanda.itensDoKit, c.productId);
    return {
      productId: c.productId,
      nome: c.nome,
      identificador: entrada.produtos.get(c.productId)?.identificador ?? null,
      necessario: c.pedido,
      disponivel,
      faltante: c.pedido - disponivel,
      estoque: c.estoque,
      comprometido: c.jaComprometido,
      motivo,
      natureza: NATUREZA_DO_MOTIVO[motivo],
      responsaveis,
      noKit,
      avulso: quanto(entrada.demanda.itensAvulsos, c.productId),
      kit: noKit > 0 ? entrada.kit : null,
    };
  });

  return { conflitos, faltas };
}

/**
 * Por que faltou.
 *
 * Primeiro o que independe da data — acervo zerado, ou menor que o próprio
 * pedido. Depois, quem está segurando. A reserva sem sinal com o prazo
 * vencido só é apontada como causa quando, sem ela, o item caberia: aí a
 * falta é técnica (a liberação ainda não rodou), não de estoque.
 */
function motivoDaFalta(c: Conflito, responsaveis: readonly ResponsavelPelaFalta[]): MotivoDaFalta {
  if (c.estoque <= 0) return "SEM_UNIDADES_NO_ACERVO";
  if (c.pedido > c.estoque) return "PEDIDO_MAIOR_QUE_O_ACERVO";

  const soma = (f: (r: ResponsavelPelaFalta) => boolean) => responsaveis.filter(f).reduce((s, r) => s + r.quantidade, 0);
  const reservasValidas = soma((r) => r.tipo === "RESERVA" && !r.semSinalVencida);
  const reservasVencidas = soma((r) => r.tipo === "RESERVA" && r.semSinalVencida);
  const propostas = soma((r) => r.tipo === "PROPOSTA");

  // Os responsáveis somam o comprometido inteiro. Se não somarem, a conta
  // veio de algo que o aviso não sabe nomear — e ele diz isso.
  if (reservasValidas + reservasVencidas + propostas !== c.jaComprometido) return "NAO_IDENTIFICADO";
  if (reservasVencidas > 0 && reservasValidas + propostas + c.pedido <= c.estoque) return "RESERVA_SEM_SINAL_VENCIDA";
  const reservas = reservasValidas + reservasVencidas;
  if (reservas > 0 && propostas > 0) return "RESERVA_E_PROPOSTA";
  if (reservas > 0) return "RESERVADO_EM_OUTRA_FESTA";
  if (propostas > 0) return "SEGURADO_POR_PROPOSTA_APROVADA";
  return "NAO_IDENTIFICADO";
}
