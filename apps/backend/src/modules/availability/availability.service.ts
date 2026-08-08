import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@festae/database";
import { RESERVATION_HOLD_MINUTES } from "@festae/shared";
import { getMaxReservationsPerDay } from "../../common/operations-config";

/**
 * Estados que ocupam a agenda do dia. PREPARING, READY e COMPLETED contam
 * tanto quanto CONFIRMED: a festa existe e o material está comprometido.
 * Só REJECTED e CANCELLED liberam a data.
 */
const COUNTED_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

export interface DayAvailability {
  date: string;
  reserved: number;
  remaining: number;
  available: boolean;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  /**
   * Devolve à agenda as reservas que ninguém pagou.
   *
   * Com capacidade de poucas festas por dia, uma reserva sem sinal é o
   * recurso mais escasso da empresa parado: duas delas fecham uma data
   * inteira sem um centavo ter entrado. A janela é maior que a validade do
   * Pix de propósito — quando ela vence, o QR já morreu e não há risco de o
   * pagamento chegar para uma vaga que já foi de outra pessoa.
   *
   * Roda junto das consultas de disponibilidade em vez de num agendador:
   * a limpeza só importa na hora de decidir se um dia está livre, e um
   * agendador seria mais uma peça para manter no ar.
   */
  private async releaseUnpaidHolds(): Promise<void> {
    const deadline = new Date(Date.now() - RESERVATION_HOLD_MINUTES * 60_000);

    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        requestedAt: { lt: deadline },
        order: { payments: { none: { status: "PAID" } } },
      },
      select: { id: true, orderId: true },
    });
    if (expired.length === 0) return;

    await prisma.$transaction([
      prisma.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "CANCELLED" },
      }),
      prisma.order.updateMany({
        where: { id: { in: expired.map((r) => r.orderId) } },
        data: { status: "CANCELLED" },
      }),
    ]);

    this.logger.log(
      `${expired.length} reserva(s) sem sinal pago passaram do prazo e a data foi liberada.`,
    );
  }

  async getMonth(month: string): Promise<DayAvailability[]> {
    await this.releaseUnpaidHolds();

    const capacity = getMaxReservationsPerDay();
    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    const reservations = await prisma.reservation.findMany({
      where: {
        eventDate: { gte: start, lt: end },
        status: { in: [...COUNTED_STATUSES] },
      },
      select: { eventDate: true },
    });

    const countByDay = new Map<string, number>();
    for (const reservation of reservations) {
      const key = reservation.eventDate.toISOString().slice(0, 10);
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
    }

    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const days: DayAvailability[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, monthNumber - 1, day));
      const key = date.toISOString().slice(0, 10);
      const reserved = countByDay.get(key) ?? 0;
      days.push({
        date: key,
        reserved,
        remaining: Math.max(0, capacity - reserved),
        available: reserved < capacity,
      });
    }
    return days;
  }

  /**
   * Ainda cabe uma festa nesta data?
   *
   * Consultado no momento de reservar, e não só ao desenhar o calendário:
   * entre abrir o app e confirmar, outra pessoa pode ter fechado a última
   * vaga do dia. Sem esta checagem, a Festaê receberia o sinal de uma data
   * que não tem como cumprir — e teria que devolver o dinheiro e o cliente.
   */
  async isDateAvailable(date: Date): Promise<boolean> {
    await this.releaseUnpaidHolds();

    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const reserved = await prisma.reservation.count({
      where: { eventDate: { gte: start, lt: end }, status: { in: [...COUNTED_STATUSES] } },
    });

    return reserved < getMaxReservationsPerDay();
  }
}
