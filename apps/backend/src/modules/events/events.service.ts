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
  order: { include: { items: { include: { product: true } }, kit: true, reservation: true } },
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

  async update(id: string, userId: string, input: UpdateEventInput) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Evento não encontrado.");
    if (event.userId !== userId) throw new ForbiddenException("Você não tem acesso a este evento.");

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
      include: { order: { include: { payments: true } } },
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

    // Pedido, itens e reserva caem junto por cascata no banco.
    await prisma.event.delete({ where: { id } });
    return { success: true };
  }
}
