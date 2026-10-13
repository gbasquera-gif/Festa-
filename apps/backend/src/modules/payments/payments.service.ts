import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  PERCENTUAL_DO_SALDO,
  PERCENTUAL_DO_SINAL,
  PIX_EXPIRATION_MINUTES,
  confirmaAReserva,
  saldoAPagar,
  splitPayment,
  type ReservationStatus,
} from "@festae/shared";
import type { CreateCheckoutInput as CreateCheckoutBody } from "@festae/shared";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/payment-gateway.interface";
import { travarPedido } from "../creditos/ledger";

/** Reserva que não existe mais como festa: cancelada ou recusada. */
const ENCERRADAS = ["CANCELLED", "REJECTED"];

/** O que aconteceu com as cobranças pendentes de uma reserva cancelada. */
export type EncerramentoDeCobrancas = {
  /** Encerradas: no provedor, ou só aqui quando nunca existiram lá. */
  encerradas: number;
  /** Já tinham sido pagas: viram pagamento após o cancelamento. */
  jaPagas: number;
  /** Não deu para confirmar o encerramento no provedor. */
  naoEncerradas: number;
};

/**
 * O que a cliente lê na fatura do Mercado Pago.
 *
 * A porcentagem vem da constante, não da mão: é texto que sai da Festaê e
 * chega no extrato de outra pessoa, e prometer 50% num lugar onde o sistema
 * cobra 30% é o tipo de divergência que só aparece na reclamação.
 */
const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: `Sinal (${PERCENTUAL_DO_SINAL}) da festa`,
  BALANCE: `Saldo restante (${PERCENTUAL_DO_SALDO}) da festa`,
};

/**
 * Quanto cobrar neste Pix.
 *
 * As duas metades desta conta são diferentes, e a diferença tem valor em
 * reais. O SINAL é uma fração do total — é o que a Festaê pede para segurar
 * a data. O SALDO é dívida: o que falta depois de tudo que já entrou.
 *
 * Enquanto o sinal foi 50% para todo mundo, `total − sinal` e `total − pago`
 * davam sempre o mesmo número, e a distinção não aparecia. Baixar o sinal
 * para 30% separou as duas: uma festa de R$ 600 cujo sinal de 50% (R$ 300)
 * já entrou cobraria R$ 420 de saldo se a conta fosse refeita pela taxa de
 * hoje — R$ 120 a mais do que a cliente deve. Por isso o saldo se mede pelo
 * que foi pago, nunca pela taxa vigente.
 *
 * Função separada e exportada porque é uma decisão sobre o dinheiro de outra
 * pessoa: merece teste próprio, sem precisar de banco nem de gateway.
 */
export function valorACobrar(
  tipo: "DEPOSIT" | "BALANCE" | string,
  total: number,
  pagamentosPagos: number[],
): number {
  if (tipo === "DEPOSIT") return splitPayment(total).deposit;
  const jaPago = pagamentosPagos.reduce((soma, valor) => soma + valor, 0);
  return saldoAPagar(total, jaPago);
}

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
      include: { payments: true, event: { include: { user: true } }, reservation: { select: { status: true } } },
    });
    if (!order) throw new NotFoundException("Orçamento do evento não encontrado.");
    // Reserva cancelada não gera cobrança nova: um Pix de uma festa que não
    // existe mais seria dinheiro entrando sem destino.
    if (order.status === "CANCELLED" || (order.reservation && ENCERRADAS.includes(order.reservation.status))) {
      throw new ConflictException("Esta reserva foi cancelada. Não há pagamento a gerar.");
    }
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

    const amount = valorACobrar(
      input.type,
      Number(order.total),
      order.payments.filter((p) => p.status === "PAID").map((p) => Number(p.amount)),
    );

    if (amount <= 0) {
      throw new ConflictException("Esta festa já está paga integralmente.");
    }
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
      const [firstName, ...restOfName] = (order.event.user.name ?? "").trim().split(/\s+/);
      checkout = await this.gateway.createCheckout({
        paymentId: payment.id,
        amount,
        description: `${PAYMENT_TYPE_LABEL[input.type]} — Festaê`,
        payerEmail,
        payerFirstName: firstName || undefined,
        payerLastName: restOfName.join(" ") || undefined,
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
   *
   * Roda sob a trava do pedido — a mesma do cancelamento e do registro
   * manual. Isso decide, sem ambiguidade, de que lado do cancelamento o
   * pagamento caiu: confirmado antes, o cancelamento o enxerga e ele entra no
   * tratamento; confirmado depois, a reserva já está cancelada aqui dentro e
   * ele vira "pagamento após o cancelamento", com pendência explícita. Em
   * nenhum dos dois casos o dinheiro some ou é contado duas vezes.
   */
  async settle(paymentId: string, status: "PAID" | "FAILED" | "PENDING") {
    const alvo = await prisma.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
    if (!alvo) return;

    const registro = await prisma.$transaction(async (tx) => {
      await travarPedido(tx, alvo.orderId);

      // Relido sob a trava: o webhook repetido e a consulta ativa podem ter
      // chegado juntos, e o cancelamento pode ter acabado de gravar.
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { reservation: true } } },
      });
      if (!payment || payment.status === "PAID") return null;

      const reserva = payment.order.reservation;
      const confirmsReservation =
        status === "PAID" &&
        reserva !== null &&
        confirmaAReserva(reserva.status as ReservationStatus, payment.type === "DEPOSIT" ? "SINAL" : "SALDO");
      const aposCancelamento = status === "PAID" && reserva !== null && ENCERRADAS.includes(reserva.status);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          paidAt: status === "PAID" ? new Date() : payment.paidAt,
          syncedAt: new Date(),
        },
      });

      if (confirmsReservation) {
        await tx.reservation.update({
          where: { id: reserva!.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "CONFIRMED" } });
      }

      // Dinheiro que entrou numa festa cancelada: fica registrado como pago
      // e ganha a pendência que pede o tratamento complementar.
      if (aposCancelamento) {
        await tx.pagamentoAposCancelamento.create({
          data: { paymentId: payment.id, reservationId: reserva!.id, valor: payment.amount },
        });
      }

      // O último degrau do funil só pode ser registrado aqui: é o Mercado
      // Pago que diz que o dinheiro entrou, não o aplicativo. Sem isto o
      // relatório terminava sempre em zero pagamentos — a única linha que
      // realmente responde se a loja vende.
      if (status === "PAID") {
        await tx.analyticsEvent.create({
          data: {
            type: "PAGAMENTO_REALIZADO",
            metadata: {
              paymentId: payment.id,
              orderId: payment.orderId,
              tipo: payment.type,
              valor: payment.amount.toString(),
            },
          },
        });
      }

      return { payment, reserva, aposCancelamento, confirmsReservation };
    });

    if (registro?.aposCancelamento) {
      this.logger.warn(
        `Pagamento ${registro.payment.id} (R$ ${Number(registro.payment.amount).toFixed(2)}) confirmado com a ` +
          `reserva ${registro.reserva!.id} já cancelada: registrado como pago, com tratamento financeiro pendente.`,
      );
    } else if (
      registro &&
      status === "PAID" &&
      registro.payment.type === "DEPOSIT" &&
      !registro.confirmsReservation
    ) {
      this.logger.warn(
        `Sinal do pagamento ${registro.payment.id} chegou com a reserva em ${registro.reserva?.status ?? "nenhuma"}. Confira no painel.`,
      );
    }
  }

  /**
   * Encerra as cobranças ainda pendentes de uma reserva que acabou de ser
   * cancelada.
   *
   * Roda depois que o cancelamento foi gravado — nunca antes: cancelar o Pix
   * da cliente e depois descobrir que a reserva não pôde ser cancelada
   * deixaria uma festa de pé sem como pagar.
   *
   * - Cobrança que só existe aqui (lançada à mão, sem Pix no provedor) ou Pix
   *   já vencido: não há o que pagar; é encerrada aqui.
   * - Pix vivo no Mercado Pago: cancelado lá, pela API real. Se o provedor
   *   disser que ele já foi pago, o pagamento é registrado agora — e, como a
   *   reserva já está cancelada, entra como pagamento após o cancelamento.
   * - Não deu para confirmar no provedor: fica como está, e a resposta diz
   *   isso. Se for pago depois, cai no mesmo caminho do pagamento tardio.
   */
  async encerrarCobrancasPendentes(orderId: string): Promise<EncerramentoDeCobrancas> {
    const pendentes = await prisma.payment.findMany({
      where: { orderId, status: "PENDING" },
      select: { id: true, method: true, externalReference: true, expiresAt: true },
    });
    const resultado: EncerramentoDeCobrancas = { encerradas: 0, jaPagas: 0, naoEncerradas: 0 };
    const agora = Date.now();

    for (const p of pendentes) {
      const soAqui = !p.externalReference;
      const vencido = p.expiresAt !== null && p.expiresAt.getTime() <= agora;
      if (soAqui || vencido) {
        // `status: "PENDING"` no filtro: nada aqui reescreve um pagamento que
        // o webhook acabou de confirmar.
        const { count } = await prisma.payment.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        resultado.encerradas += count;
        continue;
      }
      if (p.method !== "PIX") {
        resultado.naoEncerradas += 1;
        continue;
      }

      const noProvedor = await this.gateway.cancelar(p.externalReference!);
      if (noProvedor === "ENCERRADA") {
        const { count } = await prisma.payment.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        resultado.encerradas += count;
      } else if (noProvedor === "JA_PAGA") {
        await this.settle(p.id, "PAID");
        resultado.jaPagas += 1;
      } else {
        resultado.naoEncerradas += 1;
      }
    }

    if (pendentes.length > 0) {
      this.logger.log(
        `Cobranças pendentes do pedido ${orderId} após o cancelamento: ${resultado.encerradas} encerrada(s), ` +
          `${resultado.jaPagas} já paga(s), ${resultado.naoEncerradas} sem confirmação do provedor.`,
      );
    }
    return resultado;
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
