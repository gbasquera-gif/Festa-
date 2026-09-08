import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateReservationInput, UpdateReservationStatusInput } from "@festae/shared";
import { AvailabilityService } from "../availability/availability.service";
import { getMaxReservationsPerDay } from "../../common/operations-config";
import { mensagemDeConflito } from "../availability/item-commitment";

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

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

  /**
   * Cancela uma reserva, guardando o histórico.
   *
   * Cancelar não apaga nada: a reserva continua no banco com status
   * CANCELLED, e com ela o pedido, os itens e os pagamentos já registrados.
   * O que muda é o efeito no presente — a data volta a caber uma festa e o
   * material volta ao acervo, porque as duas contagens ignoram reserva
   * cancelada.
   *
   * Registra quem cancelou. A operação inteira sente o efeito de uma data
   * que abre; sem autoria, "por que essa data liberou?" é uma pergunta sem
   * resposta, e alguém remarca por cima de uma decisão que não sabe que
   * existiu.
   */
  async cancelar(id: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true, orderId: true, status: true },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED") {
      throw new BadRequestException("Esta reserva já está cancelada.");
    }

    const [atualizada] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: usuarioId },
      }),
      prisma.order.update({ where: { id: reserva.orderId }, data: { status: "CANCELLED" } }),
    ]);

    this.logger.log(`Reserva ${id} cancelada por ${usuarioId}.`);
    return atualizada;
  }

  /**
   * Apaga de vez uma reserva de teste ou lançada por engano.
   *
   * Exclusão física, e não arquivamento, por uma razão concreta: um registro
   * "arquivado" precisaria ser filtrado na agenda, na conferência de estoque,
   * na lista de reservas, na tela de operação e no funil. Um filtro esquecido
   * em qualquer um desses lugares vira uma reserva invisível que continua
   * segurando uma data — exatamente a classe de defeito que este projeto já
   * passou meses corrigindo. Apagar resolve os cinco lugares de uma vez.
   *
   * É seguro porque o banco cascateia: apagar a festa leva junto pedido,
   * itens, pagamentos, reserva e tarefas, sem deixar órfão. Nenhuma outra
   * festa, cliente ou pagamento é tocado — cada festa tem o seu próprio
   * pedido, e não há registro compartilhado entre elas.
   *
   * A ficha do cliente só cai junto quando ela existe apenas por causa desta
   * reserva: sem senha (nunca foi uma conta de verdade) e sem outra festa. É
   * o que impede o painel de acumular clientes de teste órfãos.
   */
  async excluirDefinitivamente(id: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            payments: { select: { id: true, status: true, amount: true } },
            event: {
              select: {
                id: true,
                userId: true,
                user: { select: { id: true, name: true, passwordHash: true } },
              },
            },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");

    const evento = reserva.order.event;
    const pagos = reserva.order.payments.filter((p) => p.status === "PAID");

    const outrasFestas = await prisma.event.count({
      where: { userId: evento.userId, id: { not: evento.id } },
    });

    // Ficha criada só para esta reserva: some junto. Conta de verdade (tem
    // senha) ou cliente com outra festa ficam onde estão.
    const clienteFicaOrfao = outrasFestas === 0 && !evento.user.passwordHash;

    await prisma.$transaction(async (tx) => {
      // Apagar a festa cascateia para pedido, itens, pagamentos, reserva e
      // tarefas. Uma chamada só, sem chance de deixar metade para trás.
      await tx.event.delete({ where: { id: evento.id } });
      if (clienteFicaOrfao) {
        await tx.user.delete({ where: { id: evento.userId } });
      }
    });

    this.logger.warn(
      `Reserva ${id} EXCLUÍDA por ${usuarioId} — festa ${evento.id}, ` +
        `${pagos.length} pagamento(s) marcado(s) como pago apagado(s)` +
        `${clienteFicaOrfao ? `, ficha do cliente "${evento.user.name}" removida` : ""}.`,
    );

    return {
      excluida: true,
      pagamentosApagados: pagos.length,
      valorApagado: pagos.reduce((soma, p) => soma + Number(p.amount), 0),
      clienteRemovido: clienteFicaOrfao ? evento.user.name : null,
    };
  }

  /**
   * Muda a data de uma festa já reservada.
   *
   * A cliente que reservou para o dia 25 e pediu o 27 não tinha caminho no
   * painel: a operação teria que cancelar e lançar de novo, perdendo o
   * histórico, o pagamento e o checklist.
   *
   * A data nova passa pelas mesmas duas conferências de uma reserva nova —
   * cabe mais uma festa nesse dia? o material está livre? — porque remarcar
   * é ocupar uma data, e ocupar sem conferir é como se vendem duas festas
   * para o mesmo sábado.
   *
   * A própria reserva é ignorada nas duas contagens: ela não pode disputar
   * vaga nem material consigo mesma.
   *
   * Grava a data nos DOIS lugares onde ela vive. `Reservation.eventDate`
   * manda na agenda e no painel; `Event.date` é o que a cliente vê no app.
   * Mover só um deixaria a loja e a operação discordando sobre quando é a
   * festa — o pior desacordo possível.
   */
  async alterarData(id: string, novaDataISO: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            kit: {
              select: {
                products: {
                  where: { product: { active: true } },
                  select: { productId: true, quantity: true },
                },
              },
            },
            items: { select: { productId: true, quantity: true } },
            event: { select: { id: true, date: true } },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Registre uma nova reserva para a data desejada.",
      );
    }

    const novaData = new Date(`${novaDataISO}T12:00:00.000Z`);
    if (Number.isNaN(novaData.getTime())) {
      throw new BadRequestException("Data inválida.");
    }

    const mesmoDia =
      reserva.eventDate.toISOString().slice(0, 10) === novaData.toISOString().slice(0, 10);
    if (mesmoDia) {
      throw new BadRequestException("A festa já está marcada para esta data.");
    }

    if (!(await this.availability.isDateAvailable(novaData, id))) {
      const limite = getMaxReservationsPerDay();
      throw new ConflictException(
        `O dia ${novaDataISO.split("-").reverse().join("/")} já tem ${limite} festa(s) — ` +
          "o limite operacional do dia. Escolha outra data.",
      );
    }

    const conflitos = await this.availability.conflitosDeItens(
      novaData,
      {
        itensDoKit: reserva.order.kit?.products ?? [],
        itensAvulsos: reserva.order.items,
      },
      reserva.order.id,
    );
    if (conflitos.length > 0) {
      throw new ConflictException({
        message: "Falta material na data nova.",
        conflitos: conflitos.map((c) => ({
          produto: c.nome,
          estoqueTotal: c.estoque,
          jaComprometido: c.jaComprometido,
          necessario: c.pedido,
          disponivel: Math.max(0, c.estoque - c.jaComprometido),
        })),
      });
    }

    const dataAnterior = reserva.eventDate;

    const [atualizada] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          eventDate: novaData,
          rescheduledAt: new Date(),
          // Guarda a primeira data, não a penúltima: se a festa for remarcada
          // duas vezes, o que interessa é de onde ela saiu originalmente.
          rescheduledFrom: reserva.rescheduledFrom ?? dataAnterior,
        },
      }),
      prisma.event.update({ where: { id: reserva.order.event.id }, data: { date: novaData } }),
    ]);

    this.logger.log(
      `Reserva ${id} remarcada por ${usuarioId}: ` +
        `${dataAnterior.toISOString().slice(0, 10)} -> ${novaData.toISOString().slice(0, 10)}.`,
    );

    return atualizada;
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
