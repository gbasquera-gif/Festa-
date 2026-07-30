import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { AddOrderItemInput, SelectKitInput, UpdateOrderItemInput } from "@festae/shared";

const orderInclude = {
  kit: true,
  items: { include: { product: true } },
  event: { include: { theme: true } },
  reservation: true,
} as const;

@Injectable()
export class OrdersService {
  findByEventId(eventId: string) {
    return this.getOrderOrThrow(eventId);
  }

  async selectKit(eventId: string, input: SelectKitInput) {
    const order = await this.getOrderOrThrow(eventId);
    const kit = await prisma.kit.findUnique({ where: { id: input.kitId } });
    if (!kit || !kit.active) throw new NotFoundException("Kit não encontrado.");

    await prisma.order.update({ where: { id: order.id }, data: { kitId: kit.id } });
    return this.recalculate(order.id);
  }

  async addItem(eventId: string, input: AddOrderItemInput) {
    const order = await this.getOrderOrThrow(eventId);
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product || !product.active) throw new NotFoundException("Produto não encontrado.");

    await prisma.orderItem.upsert({
      where: { orderId_productId: { orderId: order.id, productId: product.id } },
      update: { quantity: { increment: input.quantity }, unitPriceSnapshot: product.unitPrice },
      create: {
        orderId: order.id,
        productId: product.id,
        quantity: input.quantity,
        unitPriceSnapshot: product.unitPrice,
      },
    });

    return this.recalculate(order.id);
  }

  async updateItem(eventId: string, productId: string, input: UpdateOrderItemInput) {
    const order = await this.getOrderOrThrow(eventId);

    if (input.quantity === 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: order.id, productId } });
    } else {
      await prisma.orderItem.updateMany({
        where: { orderId: order.id, productId },
        data: { quantity: input.quantity },
      });
    }

    return this.recalculate(order.id);
  }

  private async getOrderOrThrow(eventId: string) {
    const order = await prisma.order.findUnique({ where: { eventId }, include: orderInclude });
    if (!order) throw new NotFoundException("Orçamento do evento não encontrado.");
    return order;
  }

  /** Recomputes subtotalKit, subtotalExtras and total from the current kit + items. */
  private async recalculate(orderId: string) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { kit: true, items: true },
    });

    const subtotalKit = order.kit ? Number(order.kit.basePrice) : 0;
    const subtotalExtras = order.items.reduce(
      (sum, item) => sum + Number(item.unitPriceSnapshot) * item.quantity,
      0,
    );

    return prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalKit,
        subtotalExtras,
        total: subtotalKit + subtotalExtras,
      },
      include: orderInclude,
    });
  }
}
