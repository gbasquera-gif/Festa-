import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import { diaDaFesta, formatarDataDaFesta, type CreateEventInput, type UpdateEventInput } from "@festae/shared";
import type { AuthUser } from "../../common/decorators/current-user.decorator";
import { travarPedido } from "../creditos/ledger";
import {
  cadastroAlterado,
  camposAlteradosPorOutro,
  dia,
  exigirAntes,
  numero,
  type Normalizador,
} from "../../common/conferencia-de-campos";

/** Como a recusa nomeia os campos da festa. */
const ROTULOS_DA_FESTA: Record<string, string> = {
  date: "a data",
  type: "o tipo de festa",
  guestCount: "o número de convidados",
  city: "a cidade",
  address: "o endereço",
  neighborhood: "o bairro",
  themeId: "o tema",
  budgetGoal: "o orçamento",
};
const NORMALIZAR_FESTA: Record<string, Normalizador> = { date: dia, guestCount: numero, budgetGoal: numero };

/** Reserva que ainda segura data e material. Cancelada e recusada não seguram. */
const reservaAtiva = (status: string) => status !== "CANCELLED" && status !== "REJECTED";

const eventInclude = {
  theme: true,
  order: {
    include: {
      items: { include: { product: true } },
      // O tema do kit vem junto porque o resumo cai nele quando a festa não
      // tem tema próprio: quem escolheu "Kit Safari" na vitrine já disse
      // qual é o tema, e sem isto o resumo exibia "Sem tema definido".
      kit: { include: { theme: true } },
      reservation: true,
    },
  },
} as const;

@Injectable()
export class EventsService {
  create(userId: string, input: CreateEventInput) {
    return prisma.event.create({
      data: {
        ...input,
        userId,
        // Every event gets an empty cart (Order) right away — the client
        // fills it in as they pick a kit and extras before requesting a reservation.
        order: { create: {} },
      },
      include: eventInclude,
    });
  }

  findAllForUser(userId: string) {
    return prisma.event.findMany({
      where: { userId },
      include: eventInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findAllAdmin() {
    return prisma.event.findMany({
      include: { ...eventInclude, user: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string, requester: AuthUser) {
    const event = await prisma.event.findUnique({ where: { id }, include: eventInclude });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.userId !== requester.userId && requester.role === "CLIENT") {
      throw new ForbiddenException("Você não tem acesso a este evento.");
    }
    return event;
  }

  /**
   * Edita a festa.
   *
   * Dono edita a própria; painel edita qualquer uma. A regra de acesso é a
   * mesma de `discard`, e precisa ser: sem isto a Maria Luiza não consegue
   * corrigir a data ou o número de convidados de uma festa que ela mesma
   * cadastrou no balcão, porque o dono do registro é o cliente.
   */
  async update(id: string, requester: AuthUser, entrada: UpdateEventInput) {
    const { antes, ...input } = entrada;
    const event = await prisma.event.findUnique({ where: { id }, include: { order: { select: { id: true } } } });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.userId !== requester.userId && requester.role === "CLIENT") {
      throw new ForbiddenException("Você não tem acesso a este evento.");
    }

    /**
     * Correção campo a campo (ver conferencia-de-campos): o painel manda só o
     * que mudou e como estava quando a tela abriu; se outra pessoa mudou o
     * mesmo campo nesse meio-tempo, recusa em vez de gravar por cima. O
     * painel sempre manda `antes`; o app da cliente pode não mandar.
     */
    const campos = Object.keys(input).filter((c) => (input as Record<string, unknown>)[c] !== undefined);
    const referencia = requester.role === "CLIENT" ? antes : exigirAntes(campos, antes);
    const conferir = async (tx: Pick<typeof prisma, "event">) => {
      if (!referencia) return;
      const agora = await tx.event.findUnique({ where: { id } });
      const conflito = camposAlteradosPorOutro(
        campos.filter((c) => Object.prototype.hasOwnProperty.call(referencia, c)),
        referencia,
        (agora ?? {}) as Record<string, unknown>,
        input as Record<string, unknown>,
        NORMALIZAR_FESTA,
      );
      if (conflito.length > 0) throw cadastroAlterado(conflito, ROTULOS_DA_FESTA);
    };

    if (!event.order) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM events WHERE id = ${id} FOR UPDATE`;
        await conferir(tx);
        await tx.event.update({ where: { id }, data: input });
      });
      return prisma.event.findUnique({ where: { id }, include: eventInclude });
    }

    // Só conta como mudança de dia o que difere do dia gravado no evento (o
    // mesmo critério de antes: reenviar o dia atual não é remarcar).
    const novoDia = input.date && diaDaFesta(input.date) !== diaDaFesta(event.date) ? diaDaFesta(input.date) : null;

    /**
     * A data da festa com reserva só muda pela remarcação.
     *
     * A agenda, o acervo, a operação e o financeiro leem a data da RESERVA.
     * Mudar só a do evento deixava a peça presa no dia antigo e o dia novo
     * sem proteção — duas festas para uma peça. Com reserva ativa, o dia só
     * muda por "Alterar data da festa" (ou pela edição da reserva), que
     * confere o acervo do dia novo sob a trava, muda as duas datas juntas e
     * guarda a data anterior.
     *
     * Alinhar o evento ao dia da própria reserva continua permitido: é como a
     * equipe corrige, à mão, um registro antigo que ficou divergente — sem
     * efeito no acervo, que já segue a reserva.
     *
     * Decidido sob a trava do pedido, a mesma do pedido de reserva da loja:
     * uma reserva sendo criada agora não passa no meio.
     */
    const orderId = event.order.id;
    await prisma.$transaction(async (tx) => {
      // A trava do pedido: a mesma da edição, da remarcação e de "Corrigir
      // dados" — as correções da festa passam uma de cada vez.
      await travarPedido(tx, orderId);
      await conferir(tx);
      const reserva = novoDia
        ? await tx.reservation.findUnique({
            where: { orderId },
            select: { id: true, status: true, eventDate: true },
          })
        : null;
      if (novoDia && reserva && reservaAtiva(reserva.status) && diaDaFesta(reserva.eventDate) !== novoDia) {
        const dataDaReserva = formatarDataDaFesta(reserva.eventDate);
        throw new ConflictException({
          message:
            requester.role === "CLIENT"
              ? `Sua festa já está reservada para ${dataDaReserva}. Para mudar a data, fale com a Festaê pelo WhatsApp: conferimos se o dia novo está livre.`
              : `Esta festa tem reserva para ${dataDaReserva}. A data só muda pela reserva — "Alterar data da festa" na tela de Reservas, ou a edição da reserva —, que confere o acervo do dia novo e guarda a data anterior.`,
          codigo: "DATA_DA_FESTA_COM_RESERVA",
          ...(requester.role === "CLIENT" ? {} : { reservaId: reserva.id, dataDaReserva: diaDaFesta(reserva.eventDate) }),
        });
      }
      await tx.event.update({ where: { id }, data: input });
    });
    return prisma.event.findUnique({ where: { id }, include: eventInclude });
  }

  /**
   * Descarta uma festa que o cliente desistiu de montar.
   *
   * Apaga de verdade em vez de marcar como cancelada: enquanto ninguém pagou
   * nada, isso é rascunho, e rascunho abandonado só polui o painel da Maria
   * Luiza e a lista de pedidos do cliente. Apagar também devolve a data à
   * agenda na hora, sem esperar a janela de retenção.
   *
   * Festa com sinal pago não some por aqui. Aí existe dinheiro, uma reserva
   * confirmada e uma política de cancelamento com faixas de reembolso — é
   * conversa com a Festaê, não um botão.
   */
  async discard(id: string, requester: AuthUser) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: { order: { include: { payments: true, reservation: true } } },
    });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.userId !== requester.userId && requester.role === "CLIENT") {
      throw new ForbiddenException("Você não tem acesso a este evento.");
    }

    const hasPaid = event.order?.payments.some((payment) => payment.status === "PAID") ?? false;
    if (hasPaid) {
      throw new ConflictException(
        "Esta festa já tem sinal pago. Fale com a Festaê pelo WhatsApp para cancelar — o reembolso segue a política de cancelamento.",
      );
    }

    /**
     * Pelo painel a trava é mais apertada que no app, e de propósito.
     *
     * No app, apagar rascunho é o cliente desistindo de montar — some o que
     * só existia na tela dele. No painel, a mesma cascata apaga Order,
     * OrderItem, Reservation e Payment: seria o contrato inteiro saindo do
     * Financeiro, sem deixar rastro de que existiu. Reserva cancelada também
     * não some por aqui — ela é o registro de que a festa foi vendida e
     * depois desfeita, e é isso que a carteira mostra.
     *
     * Quem cancela reserva é a tela de Reservas, que marca CANCELLED e
     * guarda quem cancelou. Exclusão é para o que nunca virou contrato.
     */
    if (requester.role !== "CLIENT") {
      const impedimentos: string[] = [];
      if (event.order?.reservation) impedimentos.push("uma reserva registrada");
      if ((event.order?.payments.length ?? 0) > 0) impedimentos.push("lançamentos de pagamento");
      if (event.order && event.order.status !== "CART") impedimentos.push("um pedido fechado");

      if (impedimentos.length > 0) {
        throw new ConflictException(
          `Esta festa não pode ser excluída: tem ${impedimentos.join(" e ")}. ` +
            "Excluir apagaria o contrato e o histórico financeiro junto. Para desfazer a venda, cancele a reserva na tela de Reservas.",
        );
      }
    }

    // Pedido, itens e reserva caem junto por cascata no banco.
    await prisma.event.delete({ where: { id } });
    return { success: true };
  }
}
