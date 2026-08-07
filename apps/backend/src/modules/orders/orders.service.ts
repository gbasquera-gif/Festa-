import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import { calculateOrderPricing, checkFulfillment } from "@festae/shared";
import type {
  AddOrderItemInput,
  SelectKitInput,
  SetLogisticsInput,
  UpdateOrderItemInput,
} from "@festae/shared";

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

  /**
   * Grava a logística escolhida pelo cliente e recalcula o pedido.
   *
   * A cidade da festa é quem manda: entrega só existe em Chapecó, e a
   * checagem acontece aqui — não só na tela — porque a tela pode estar
   * desatualizada e a API é a fronteira que precisa segurar a regra.
   */
  async setLogistics(eventId: string, input: SetLogisticsInput) {
    const order = await this.getOrderOrThrow(eventId);
    if (order.status !== "CART") {
      throw new ConflictException(
        "Este pedido já foi enviado. Fale com a Festaê para alterar a entrega ou a montagem.",
      );
    }

    const allowed = checkFulfillment(input.fulfillment, order.event.city);
    if (!allowed.allowed) throw new BadRequestException(allowed.reason);

    if (input.fulfillment === "DELIVERY" && !input.address?.trim()) {
      throw new BadRequestException("Informe o endereço para a entrega.");
    }

    // Escolher retirada apaga o endereço: guardar endereço de entrega de
    // quem vai buscar na loja é dado pessoal sem finalidade, e a LGPD pede
    // exatamente o contrário disso.
    await prisma.event.update({
      where: { id: order.eventId },
      data:
        input.fulfillment === "DELIVERY"
          ? { address: input.address?.trim(), neighborhood: input.neighborhood?.trim() || null }
          : { address: null, neighborhood: null },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { fulfillment: input.fulfillment, assembly: input.assembly },
    });

    return this.recalculate(order.id);
  }

  private async getOrderOrThrow(eventId: string) {
    const order = await prisma.order.findUnique({ where: { eventId }, include: orderInclude });
    if (!order) throw new NotFoundException("Orçamento do evento não encontrado.");
    return order;
  }

  /**
   * Recalcula o pedido inteiro a partir do kit, dos itens e da logística.
   *
   * A conta em si mora em `calculateOrderPricing`, no pacote compartilhado,
   * para que a API, o app e o painel cheguem sempre ao mesmo centavo — e
   * para que ela possa ser testada sem banco.
   */
  private async recalculate(orderId: string) {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { kit: true, items: true, event: true },
    });

    const pricing = calculateOrderPricing({
      subtotalKit: order.kit ? Number(order.kit.basePrice) : 0,
      subtotalExtras: order.items.reduce(
        (sum, item) => sum + Number(item.unitPriceSnapshot) * item.quantity,
        0,
      ),
      fulfillment: order.fulfillment,
      assembly: order.assembly,
      city: order.event.city,
    });

    return prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalKit: pricing.subtotalKit,
        subtotalExtras: pricing.subtotalExtras,
        deliveryFee: pricing.deliveryFee,
        assemblyFee: pricing.assemblyFee,
        total: pricing.total,
      },
      include: orderInclude,
    });
  }
}
