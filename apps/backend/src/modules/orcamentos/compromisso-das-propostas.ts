import { prisma, type Prisma } from "@festae/database";
import { diaDaFesta, lerComposicaoCongelada } from "@festae/shared";
import type { PedidoComprometido } from "../availability/item-commitment";
import { compromissoDasAprovadas, demandaDaOpcao, type OpcaoComMaterial } from "./disponibilidade-da-proposta";
import { opcaoDeReferencia, opcaoParaConverter } from "./opcoes";

type Tx = Prisma.TransactionClient;

/**
 * O que as propostas aprovadas e ainda sem reserva seguram — a reserva
 * provisória — numa conta só, para todos os canais.
 *
 * Antes, só a aprovação de proposta (e a tela da proposta) somava isto; a
 * loja e a venda manual olhavam só as reservas, e vendiam a peça que uma
 * cliente já tinha aceitado numa proposta. Agora loja, venda manual,
 * conversão, edição, remarcação, aprovação e a Malu leem daqui.
 *
 * O recorte é o de sempre: proposta APROVADA, sem reserva, com a festa no
 * dia. Cada uma segura só a opção que a cliente escolheu, com a composição
 * que viraria reserva (o kit congelado no envio; sem ele, o kit de hoje do
 * catálogo). Deixa de segurar quando vira reserva (aí conta como reserva),
 * quando é marcada como perdida ou quando é excluída.
 *
 * Proposta aprovada não vence sozinha hoje: a validade só impede a
 * aprovação. Ver o relatório da entrega C sobre a liberação das antigas —
 * ela não é feita aqui.
 */

export type SeguradoPorPropostas = {
  /** Unidades seguradas, por produto. */
  total: Map<string, number>;
  propostas: { id: string; numero: number; cliente: string; opcao: string; produtos: string[] }[];
};

/** A opção que uma aprovada segura: a que viraria reserva. */
export function opcaoQueSegura<T extends { id: string; ordem: number }>(a: {
  numero: number;
  opcaoAprovadaId: string | null;
  opcoes: T[];
}): T | null {
  try {
    return opcaoParaConverter(a);
  } catch {
    // Sem registro de qual opção foi aprovada (não deveria existir), a de
    // referência — a mesma que o resumo da proposta mostra.
    return opcaoDeReferencia(a);
  }
}

/**
 * As peças ativas dos kits que ainda não têm composição congelada — as
 * mesmas que a conversão leria do catálogo.
 */
export async function kitsDoCatalogo(opcoes: readonly OpcaoComMaterial[], db: Tx = prisma) {
  const ids = [
    ...new Set(
      opcoes
        .filter((op) => op.kitId && !lerComposicaoCongelada(op.composicaoDoKit))
        .map((op) => op.kitId as string),
    ),
  ];
  if (ids.length === 0) return new Map<string, { productId: string; quantity: number }[]>();
  const kits = await db.kit.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      products: { where: { product: { active: true } }, select: { productId: true, quantity: true } },
    },
  });
  return new Map(kits.map((k) => [k.id, k.products]));
}

/**
 * As aprovadas sem reserva com festa em [inicio, fim), cada uma com o dia e o
 * que segura. A leitura é uma só para o período — o calendário do mês da
 * loja pergunta trinta dias de uma vez.
 */
async function aprovadasNoPeriodo(inicio: Date, fim: Date, ignorarId: string | undefined, db: Tx) {
  const aprovadas = await db.orcamento.findMany({
    where: {
      status: "APROVADO",
      reservationId: null,
      festaEm: { gte: inicio, lt: fim },
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
    select: {
      id: true,
      numero: true,
      clienteNome: true,
      festaEm: true,
      opcaoAprovadaId: true,
      opcoes: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          ordem: true,
          nome: true,
          kitId: true,
          composicaoDoKit: true,
          itens: { select: { productId: true, quantidade: true } },
        },
      },
    },
  });
  const seguradas = aprovadas.flatMap((a) => {
    const opcao = opcaoQueSegura(a);
    return opcao ? [{ a, opcao }] : [];
  });
  const kits = await kitsDoCatalogo(seguradas.map((x) => x.opcao), db);
  return seguradas.map(({ a, opcao }) => ({
    dia: diaDaFesta(a.festaEm as Date),
    demanda: demandaDaOpcao(opcao, (kitId) => kits.get(kitId)) as PedidoComprometido,
    proposta: { id: a.id, numero: a.numero, cliente: a.clienteNome, opcao: opcao.nome },
  }));
}

function resumir(lista: Awaited<ReturnType<typeof aprovadasNoPeriodo>>): SeguradoPorPropostas {
  return {
    total: compromissoDasAprovadas(lista.map((x) => x.demanda)),
    propostas: lista.map((x) => ({
      ...x.proposta,
      produtos: [...x.demanda.itensDoKit, ...x.demanda.itensAvulsos].map((i) => i.productId),
    })),
  };
}

/**
 * O que as aprovadas seguram no dia da festa. `ignorarId` tira da conta a
 * própria proposta — a que está sendo aprovada ou convertida não disputa
 * material consigo mesma.
 *
 * Quem confere dentro de uma transação travada passa a conexão dela (`db`).
 */
export async function seguradoPorPropostasAprovadas(
  festaEm: Date,
  ignorarId?: string,
  db: Tx = prisma,
): Promise<SeguradoPorPropostas> {
  const inicio = new Date(`${diaDaFesta(festaEm)}T00:00:00.000Z`);
  const fim = new Date(inicio.getTime() + 86_400_000);
  return resumir(await aprovadasNoPeriodo(inicio, fim, ignorarId, db));
}

/** O mesmo, dia a dia, para um período (o calendário do mês). */
export async function seguradoPorPropostasNoPeriodo(
  inicio: Date,
  fim: Date,
  db: Tx = prisma,
): Promise<Map<string, SeguradoPorPropostas>> {
  const lista = await aprovadasNoPeriodo(inicio, fim, undefined, db);
  const porDia = new Map<string, typeof lista>();
  for (const x of lista) porDia.set(x.dia, [...(porDia.get(x.dia) ?? []), x]);
  return new Map([...porDia].map(([dia, doDia]) => [dia, resumir(doDia)]));
}
