import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import { PIX_EXPIRATION_MINUTES, splitPayment } from "@festae/shared";
import type { CreateCheckoutInput as CreateCheckoutBody } from "@festae/shared";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/payment-gateway.interface";

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Sinal (50%) da festa",
  BALANCE: "Saldo restante (50%) da festa",
};

/** Intervalo mínimo entre duas consultas ao Mercado Pago sobre o mesmo Pix. */
const SYNC_INTERVAL_MS = 20_000;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  /**
   * Pagamentos do pedido, com o pendente reconferido no Mercado Pago.
   *
   * A tela do cliente consulta este endpoint enquanto espera o Pix cair. Se
   * o webhook se perder — configuração errada, instabilidade, retentativa
   * que nunca chega —, é esta consulta que descobre o pagamento e destrava
   * o cliente sozinho.
   */
  async findByOrder(orderId: string) {
    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });

    const pending = payments.find((payment) => payment.status === "PENDING");
    if (pending) await this.syncWithGateway(pending.id);

    return prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  }

  /**
   * Confere no Mercado Pago o status de um pagamento pendente.
   *
   * Só pergunta se faz sentido perguntar: pagamento vencido não muda mais, e
   * consultar a cada 5 segundos por cliente com a tela aberta estouraria o
   * limite de requisições deles sem necessidade.
   */
  private async syncWithGateway(paymentId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== "PENDING" || !payment.externalReference) return;

    const recentlySynced =
      payment.syncedAt && Date.now() - payment.syncedAt.getTime() < SYNC_INTERVAL_MS;
    if (recentlySynced) return;

    const expired = payment.expiresAt && payment.expiresAt.getTime() < Date.now();
    if (expired) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", syncedAt: new Date() },
      });
      return;
    }

    const status = await this.gateway.getStatus(payment.id);
    await prisma.payment.update({ where: { id: payment.id }, data: { syncedAt: new Date() } });

    if (status === "PAID") {
      this.logger.log(`Pagamento ${payment.id} confirmado por consulta ativa (webhook não chegou).`);
      await this.settle(payment.id, "PAID");
    } else if (status === "FAILED") {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    }
  }

  /**
   * Gera — ou reaproveita — o Pix de um pagamento.
   *
   * Reaproveitar é a parte que importa: criar um Pix novo a cada chamada
   * deixaria dois QR válidos ao mesmo tempo para a mesma cobrança, e o
   * cliente poderia pagar duas vezes. Só quando o anterior venceu é que um
   * novo é gerado no lugar dele.
   */
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

    const now = Date.now();
    const reusable = order.payments.find(
      (p) =>
        p.type === input.type &&
        p.status === "PENDING" &&
        p.pixQrCode &&
        (!p.expiresAt || p.expiresAt.getTime() > now),
    );
    if (reusable) return reusable;

    // Pendentes vencidos saem do caminho para não confundirem a tela nem a
    // conferência da Maria Luiza com QR que ninguém mais consegue pagar.
    const stale = order.payments.filter(
      (p) => p.type === input.type && p.status === "PENDING" && p.expiresAt && p.expiresAt.getTime() <= now,
    );
    if (stale.length > 0) {
      await prisma.payment.updateMany({
        where: { id: { in: stale.map((p) => p.id) } },
        data: { status: "FAILED" },
      });
    }

    // A divisão vem do pacote compartilhado: o valor cobrado no Pix é
    // exatamente o que o cliente viu no resumo, calculado pela mesma função.
    const { deposit, balance } = splitPayment(Number(order.total));
    const amount = input.type === "DEPOSIT" ? deposit : balance;
    const expiresAt = new Date(now + PIX_EXPIRATION_MINUTES * 60_000);

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        type: input.type,
        method: input.method,
        amount,
        status: "PENDING",
        expiresAt: input.method === "PIX" ? expiresAt : null,
      },
    });

    let checkout;
    try {
      checkout = await this.gateway.createCheckout({
        paymentId: payment.id,
        amount,
        description: `${PAYMENT_TYPE_LABEL[input.type]} — Festaê`,
        payerEmail,
        method: input.method,
        expiresAt: input.method === "PIX" ? expiresAt : undefined,
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
   * Grava o resultado de um pagamento e, se for o sinal, confirma a reserva.
   *
   * A data já foi conferida contra a capacidade do dia quando a reserva foi
   * solicitada, então não há decisão humana pendente: quem pagou o sinal tem
   * a data. Deixar a pessoa pagando e esperando resposta é justamente o que
   * se quis eliminar.
   */
  private async settle(paymentId: string, status: "PAID" | "FAILED" | "PENDING") {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { reservation: true } } },
    });
    if (!payment || payment.status === "PAID") return;

    const confirmsReservation =
      status === "PAID" &&
      payment.type === "DEPOSIT" &&
      payment.order.reservation?.status === "PENDING";

    if (status === "PAID" && payment.type === "DEPOSIT" && !confirmsReservation) {
      // Sinal pago para uma reserva que não está mais aguardando (expirada,
      // cancelada ou já confirmada). O dinheiro entrou e precisa aparecer no
      // painel: registramos o pagamento e avisamos para alguém olhar.
      this.logger.warn(
        `Sinal do pagamento ${payment.id} chegou com a reserva em ${payment.order.reservation?.status ?? "nenhuma"}. Confira no painel.`,
      );
    }

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          paidAt: status === "PAID" ? new Date() : payment.paidAt,
          syncedAt: new Date(),
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

  /** Notificação do Mercado Pago. A autenticidade é checada no controller. */
  async handleWebhook(payload: unknown) {
    const result = await this.gateway.parseWebhook(payload);
    if (!result) return;

    const payment = await prisma.payment.findUnique({ where: { id: result.externalReference } });
    if (!payment) return;
    // Webhook repetido é normal no Mercado Pago: ignorar o que já está pago
    // evita reconfirmar reserva e reescrever a data de pagamento.
    if (payment.status === "PAID") return;

    await this.settle(payment.id, result.status);
  }
}
