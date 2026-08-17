import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateReservationInput, UpdateReservationStatusInput } from "@festae/shared";
import { AvailabilityService } from "../availability/availability.service";
import { mensagemDeConflito } from "../availability/item-commitment";

@Injectable()
export class ReservationsService {
  constructor(private readonly availability: AvailabilityService) {}

  async requestReservation(eventId: string, input: CreateReservationInput) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        order: {
          include: {
            reservation: true,
            kit: { include: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });
    if (!event || !event.order) throw new NotFoundException("Orçamento do evento não encontrado.");
    if (!event.order.kitId) {
      throw new BadRequestException("Selecione um kit antes de solicitar a reserva.");
    }
    if (event.order.reservation) {
      throw new ConflictException("Este evento já possui uma reserva solicitada.");
    }
    if (!(await this.availability.isDateAvailable(event.date))) {
      throw new ConflictException(
        "Esta data acabou de ficar indisponível. Escolha outra data ou fale com a Festaê pelo WhatsApp.",
      );
    }

    // A agenda ter vaga não quer dizer que o material esteja livre: com duas
    // festas por dia, as duas podem ter escolhido o mesmo painel. Sem esta
    // conferência a Festaê recebe dois sinais por um item que ela tem um só.
    const conflitos = await this.availability.conflitosDeItens(event.date, {
      itensDoKit: event.order.kit?.products ?? [],
      itensAvulsos: event.order.items,
    });
    if (conflitos.length > 0) {
      throw new ConflictException(mensagemDeConflito(conflitos));
    }

    const [reservation] = await prisma.$transaction([
      prisma.reservation.create({
        data: {
          orderId: event.order.id,
          eventDate: event.date,
          notes: input.notes,
        },
      }),
      prisma.order.update({ where: { id: event.order.id }, data: { status: "REQUESTED" } }),
    ]);

    return reservation;
  }

  /**
   * Tudo que a operação precisa para atender uma reserva, numa consulta só.
   *
   * A Maria Luiza abre o painel para responder quatro perguntas: quem é,
   * o que separo, quando e onde entrego, e quanto já recebi. Trazer os
   * itens, o telefone, a logística e os pagamentos junto é o que evita que
   * ela precise abrir outra tela — ou pedir a informação por WhatsApp.
   */
  findAllAdmin() {
    return prisma.reservation.findMany({
      include: {
        order: {
          include: {
            event: { include: { user: true, theme: true } },
            kit: { include: { products: { include: { product: true } } } },
            items: { include: { product: true } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
      },
      orderBy: { eventDate: "asc" },
    });
  }

  async updateStatus(id: string, input: UpdateReservationStatusInput) {
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException("Reserva não encontrada.");

    // PREPARING, READY e COMPLETED são etapas posteriores à confirmação: o
    // pedido continua CONFIRMED e só a etapa operacional avança.
    const orderStatus =
      input.status === "CONFIRMED" || input.status === "PREPARING" || input.status === "READY" || input.status === "COMPLETED"
        ? ("CONFIRMED" as const)
        : input.status === "CANCELLED" || input.status === "REJECTED"
          ? ("CANCELLED" as const)
          : undefined;

    const [updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          status: input.status,
          confirmedAt: input.status === "CONFIRMED" ? new Date() : reservation.confirmedAt,
        },
      }),
      ...(orderStatus
        ? [prisma.order.update({ where: { id: reservation.orderId }, data: { status: orderStatus } })]
        : []),
    ]);

    return updated;
  }
}
