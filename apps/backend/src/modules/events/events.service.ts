import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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
}
