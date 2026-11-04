import { createHash } from "node:crypto";
import { ConflictException, BadRequestException } from "@nestjs/common";
import type { Prisma } from "@festae/database";
import { diaDaFesta, formatarDataDaFesta } from "@festae/shared";

/**
 * A versão de uma reserva, para nenhuma gravação apagar outra sem avisar.
 *
 * A edição da reserva reescreve o pedido inteiro com o que estava na tela:
 * data, kit, itens, valores, logística, dados da festa e da cliente. Se outra
 * pessoa remarcou, trocou um item ou corrigiu o endereço entre a abertura do
 * formulário e o "Salvar", gravar a tela velha desfaria essa mudança calada —
 * e a festa voltaria para a data antiga sem ninguém ter pedido.
 *
 * O painel recebe a versão quando abre a reserva e a devolve ao salvar. Sob a
 * trava do pedido, o servidor recalcula: se mudou, recusa (409) e nada é
 * gravado; a pessoa recarrega e refaz em cima do que está valendo.
 *
 * A versão é um resumo do que a edição reescreve — e só disso. Pagamento,
 * crédito e etapa da reserva ficam de fora: o sinal que entra enquanto a
 * operadora corrige o endereço não conflita com a correção, e recusar por
 * isso seria conflito falso. Cancelamento é tratado à parte (a edição recusa
 * reserva cancelada). Sem coluna nova: nada de migration.
 */
export const SELECAO_DA_VERSAO = {
  eventDate: true,
  notes: true,
  order: {
    select: {
      kitId: true,
      subtotalKit: true,
      subtotalExtras: true,
      fulfillment: true,
      assembly: true,
      deliveryFee: true,
      assemblyFee: true,
      ajusteComercial: true,
      total: true,
      notes: true,
      kitItems: { select: { productId: true, quantity: true } },
      items: { select: { productId: true, quantity: true } },
      event: {
        select: {
          type: true,
          date: true,
          guestCount: true,
          themeId: true,
          nomeDoFestejado: true,
          address: true,
          neighborhood: true,
          city: true,
          saleChannel: true,
          user: { select: { name: true, phone: true } },
        },
      },
    },
  },
} satisfies Prisma.ReservationSelect;

export type EstadoDaVersao = Prisma.ReservationGetPayload<{ select: typeof SELECAO_DA_VERSAO }>;

type Db = Pick<Prisma.TransactionClient, "reservation">;

const valor = (v: unknown) => (v === null || v === undefined ? null : Number(v).toFixed(2));
const instante = (v: Date | null | undefined) => (v ? v.toISOString() : null);
const linhas = (l: { productId: string; quantity: number }[]) =>
  l.map((i) => `${i.productId}:${i.quantity}`).sort();

/** O resumo do estado que a edição reescreve. Mesma entrada, mesma versão. */
export function versaoDaReserva(r: EstadoDaVersao): string {
  const o = r.order;
  const e = o.event;
  const canonico = [
    instante(r.eventDate),
    r.notes ?? null,
    o.kitId ?? null,
    valor(o.subtotalKit),
    valor(o.subtotalExtras),
    o.fulfillment ?? null,
    o.assembly ?? null,
    valor(o.deliveryFee),
    valor(o.assemblyFee),
    valor(o.ajusteComercial),
    valor(o.total),
    o.notes ?? null,
    linhas(o.kitItems),
    linhas(o.items),
    e.type ?? null,
    instante(e.date),
    e.guestCount ?? null,
    e.themeId ?? null,
    e.nomeDoFestejado ?? null,
    e.address ?? null,
    e.neighborhood ?? null,
    e.city ?? null,
    e.saleChannel ?? null,
    e.user?.name ?? null,
    e.user?.phone ?? null,
  ];
  return createHash("sha256").update(JSON.stringify(canonico)).digest("hex").slice(0, 32);
}

/** A versão como está gravada agora (na transação, quando houver uma). */
export async function versaoAtualDaReserva(db: Db, id: string): Promise<{ versao: string; dia: string } | null> {
  const r = await db.reservation.findUnique({ where: { id }, select: SELECAO_DA_VERSAO });
  return r ? { versao: versaoDaReserva(r), dia: diaDaFesta(r.eventDate) } : null;
}

/**
 * Painel aberto antes desta atualização não manda versão. Recusar é o seguro:
 * aceitar seria voltar ao "a última gravação vence".
 */
export function exigirVersao(versao: string | undefined | null): string {
  if (!versao) {
    throw new BadRequestException({
      message: "O painel foi atualizado. Recarregue a página da reserva antes de salvar — nada foi alterado.",
      codigo: "VERSAO_DA_RESERVA_AUSENTE",
    });
  }
  return versao;
}

/** A recusa quando a reserva mudou depois que o formulário abriu. */
export function reservaAlterada(diaAtual: string): ConflictException {
  return new ConflictException({
    message:
      "Esta reserva foi alterada por outra pessoa enquanto você editava " +
      `(a festa está hoje em ${formatarDataDaFesta(`${diaAtual}T12:00:00.000Z`)}). ` +
      "Nada foi salvo. Recarregue a reserva e refaça a alteração em cima da versão atual.",
    codigo: "RESERVA_ALTERADA",
    dataAtual: diaAtual,
  });
}

/** A recusa quando a data mudou depois que o diálogo de remarcar abriu. */
export function dataDaReservaMudou(diaAtual: string): ConflictException {
  return new ConflictException({
    message:
      `A data desta reserva mudou para ${formatarDataDaFesta(`${diaAtual}T12:00:00.000Z`)} enquanto você remarcava. ` +
      "Nada foi alterado. Confira a data atual antes de remarcar.",
    codigo: "DATA_DA_RESERVA_MUDOU",
    dataAtual: diaAtual,
  });
}
