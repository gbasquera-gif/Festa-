import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";

/**
 * Regra de negócio confirmada com a operação (Maria Luiza): no máximo
 * 2 festas por dia. Fixo por enquanto — sem UI de configuração — porque
 * ainda não há necessidade real de variar por data/sazonalidade.
 */
const MAX_RESERVATIONS_PER_DAY = 2;
const COUNTED_STATUSES = ["PENDING", "CONFIRMED"] as const;

export interface DayAvailability {
  date: string;
  reserved: number;
  remaining: number;
  available: boolean;
}

@Injectable()
export class AvailabilityService {
  async getMonth(month: string): Promise<DayAvailability[]> {
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
        remaining: Math.max(0, MAX_RESERVATIONS_PER_DAY - reserved),
        available: reserved < MAX_RESERVATIONS_PER_DAY,
      });
    }
    return days;
  }
}
