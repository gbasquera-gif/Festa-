import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateCheckoutInput as CreateCheckoutBody } from "@festae/shared";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/payment-gateway.interface";

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Sinal (50%) da festa",
  BALANCE: "Saldo restante (50%) da festa",
};

/**
 * Split 50/50 confirmado com a operação: metade na reserva (DEPOSIT),
 * metade na retirada/entrega (BALANCE). Sem parcelamento, sem Apple/Google
 * Pay por enquanto — fica pro roadmap quando o volume justificar.
 */
function splitAmount(total: number): { deposit: number; balance: number } {
  const deposit = Math.round(total * 50) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;
  return { deposit, balance };
}

@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  findByOrder(orderId: string) {
    return prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  }

  async createCheckout(eventId: string, input: CreateCheckoutBody, payerEmail: string) {
    const order = await prisma.order.findUnique({
      where: { eventId },
      include: { payments: true },
    });
    if (!order) throw new NotFoundException("Orçamento do evento não encontrado.");
    if (!order.kitId) {
      throw new ConflictException("Selecione um kit antes de gerar o pagamento.");
    }
    if (order.payments.some((p) => p.type === input.type && p.status === "PAID")) {
      throw new ConflictException("Este pagamento já foi realizado.");
    }

    const total = Number(order.total);
    const { deposit, balance } = splitAmount(total);
    const amount = input.type === "DEPOSIT" ? deposit : balance;

    const payment = await prisma.payment.create({
      data: { orderId: order.id, type: input.type, method: input.method, amount, status: "PENDING" },
    });

    let checkout;
    try {
      checkout = await this.gateway.createCheckout({
        paymentId: payment.id,
        amount,
        description: `${PAYMENT_TYPE_LABEL[input.type]} — Festaê`,
        payerEmail,
        method: input.method,
      });
    } catch (error) {
      // Não deixa um registro PENDING órfão (sem checkout de verdade) toda
      // vez que o gateway falha — ele nunca vai virar um pagamento real.
      await prisma.payment.delete({ where: { id: payment.id } });
      throw error;
    }

    return prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalReference: checkout.externalReference,
        checkoutUrl: checkout.checkoutUrl,
        pixQrCode: checkout.pixQrCode,
        pixQrCodeBase64: checkout.pixQrCodeBase64,
      },
    });
  }

  async handleWebhook(payload: unknown) {
    const result = await this.gateway.parseWebhook(payload);
    if (!result) return;

    const payment = await prisma.payment.findUnique({ where: { id: result.externalReference } });
    if (!payment) return;

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: result.status,
        paidAt: result.status === "PAID" ? new Date() : payment.paidAt,
      },
    });
  }
}
