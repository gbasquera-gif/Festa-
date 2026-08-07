import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import { splitPayment } from "@festae/shared";
import type { CreateCheckoutInput as CreateCheckoutBody } from "@festae/shared";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/payment-gateway.interface";

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Sinal (50%) da festa",
  BALANCE: "Saldo restante (50%) da festa",
};

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

    // A divisão vem do pacote compartilhado: o valor cobrado no Pix é
    // exatamente o que o cliente viu no resumo, calculado pela mesma função.
    const { deposit, balance } = splitPayment(Number(order.total));
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

  /**
   * Confirmação vinda do Mercado Pago.
   *
   * O sinal pago confirma a reserva automaticamente: a data já foi checada
   * contra a capacidade do dia quando a reserva foi solicitada, então não há
   * o que a operação precise decidir depois — e deixar a pessoa pagando e
   * esperando resposta humana é justamente o que se quis eliminar.
   */
  async handleWebhook(payload: unknown) {
    const result = await this.gateway.parseWebhook(payload);
    if (!result) return;

    const payment = await prisma.payment.findUnique({
      where: { id: result.externalReference },
      include: { order: { include: { reservation: true } } },
    });
    if (!payment) return;
    // Webhook repetido é normal no Mercado Pago: ignorar o que já está pago
    // evita reconfirmar reserva e reescrever a data de pagamento.
    if (payment.status === "PAID") return;

    const confirmsReservation =
      result.status === "PAID" &&
      payment.type === "DEPOSIT" &&
      payment.order.reservation?.status === "PENDING";

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: result.status,
          paidAt: result.status === "PAID" ? new Date() : payment.paidAt,
        },
      }),
      ...(confirmsReservation
        ? [
            prisma.reservation.update({
              where: { id: payment.order.reservation!.id },
              data: { status: "CONFIRMED", confirmedAt: new Date() },
            }),
            prisma.order.update({ where: { id: payment.orderId }, data: { status: "CONFIRMED" } }),
          ]
        : []),
    ]);
  }
}
