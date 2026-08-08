import { randomUUID } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { MercadoPagoConfig, Payment as MpPayment, Preference as MpPreference } from "mercadopago";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  GatewayPaymentStatus,
  PaymentGateway,
  WebhookResult,
} from "./payment-gateway.interface";

/**
 * Integração com o Mercado Pago via Checkout Transparente.
 *
 * Pix é criado pela API de pagamentos e devolve o QR Code e o copia-e-cola
 * para o app exibir na própria tela — sem tirar o cliente do aplicativo.
 * Cartão fica para depois; a Preference existe só como caminho já aberto.
 */
@Injectable()
export class MercadoPagoGateway implements PaymentGateway {
  private readonly logger = new Logger(MercadoPagoGateway.name);

  private client(): MercadoPagoConfig {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new ServiceUnavailableException(
        "Pagamento online ainda não está configurado (falta MP_ACCESS_TOKEN). A reserva pode ser feita normalmente; o pagamento será combinado manualmente por enquanto.",
      );
    }
    return new MercadoPagoConfig({ accessToken });
  }

  /** Converte a data para o formato com offset que o Mercado Pago exige. */
  private formatExpiration(date: Date): string {
    return date.toISOString().replace("Z", "-00:00");
  }

  private toStatus(mpStatus: string | undefined): GatewayPaymentStatus {
    if (mpStatus === "approved") return "PAID";
    if (mpStatus === "rejected" || mpStatus === "cancelled" || mpStatus === "refunded") {
      return "FAILED";
    }
    return "PENDING";
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const client = this.client();

    if (input.method === "PIX") {
      const payment = new MpPayment(client);
      const result = await payment.create({
        body: {
          transaction_amount: input.amount,
          description: input.description,
          payment_method_id: "pix",
          external_reference: input.paymentId,
          payer: { email: input.payerEmail },
          ...(input.expiresAt
            ? { date_of_expiration: this.formatExpiration(input.expiresAt) }
            : {}),
        },
        // Chave de idempotência exigida pelo Mercado Pago: se a requisição
        // for repetida por falha de rede, eles devolvem o mesmo pagamento em
        // vez de criar um segundo Pix para a mesma cobrança.
        requestOptions: { idempotencyKey: input.paymentId },
      });

      const pix = result.point_of_interaction?.transaction_data;
      return {
        externalReference: String(result.id),
        pixQrCode: pix?.qr_code,
        pixQrCodeBase64: pix?.qr_code_base64,
      };
    }

    const preference = new MpPreference(client);
    const result = await preference.create({
      body: {
        external_reference: input.paymentId,
        items: [
          {
            id: input.paymentId,
            title: input.description,
            quantity: 1,
            unit_price: input.amount,
            currency_id: "BRL",
          },
        ],
        payer: { email: input.payerEmail },
      },
      requestOptions: { idempotencyKey: input.paymentId },
    });

    return { externalReference: input.paymentId, checkoutUrl: result.init_point };
  }

  async parseWebhook(payload: unknown): Promise<WebhookResult | null> {
    const body = payload as { type?: string; action?: string; data?: { id?: string } };
    const isPayment = body?.type === "payment" || body?.action?.startsWith("payment.");
    if (!isPayment || !body.data?.id) return null;

    const payment = new MpPayment(this.client());
    // Nunca acreditamos no corpo da notificação: o status vem da consulta ao
    // Mercado Pago. É isso que impede alguém de forjar um "pago".
    const result = await payment.get({ id: body.data.id });

    const externalReference = result.external_reference;
    if (!externalReference) return null;

    return { externalReference, status: this.toStatus(result.status) };
  }

  async getStatus(externalReference: string): Promise<GatewayPaymentStatus | null> {
    try {
      const payment = new MpPayment(this.client());
      const search = await payment.search({
        options: { external_reference: externalReference, limit: 1 },
      });
      const found = search.results?.[0];
      return found ? this.toStatus(found.status) : null;
    } catch (error) {
      // Consulta ativa é rede de segurança, não caminho principal: se o
      // Mercado Pago estiver fora do ar, a tela segue esperando o webhook em
      // vez de mostrar erro para quem já pagou.
      this.logger.warn(`Não foi possível consultar o pagamento ${externalReference}: ${error}`);
      return null;
    }
  }
}
