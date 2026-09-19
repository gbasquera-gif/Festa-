import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateEventInput, UpdateEventInput } from "@festae/shared";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

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
  async update(id: string, requester: AuthUser, input: UpdateEventInput) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.userId !== requester.userId && requester.role === "CLIENT") {
      throw new ForbiddenException("Você não tem acesso a este evento.");
    }

    return prisma.event.update({ where: { id }, data: input, include: eventInclude });
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
