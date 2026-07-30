import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { MercadoPagoConfig, Payment as MpPayment, Preference as MpPreference } from "mercadopago";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  PaymentGateway,
  WebhookResult,
} from "./payment-gateway.interface";

/**
 * Integração real com o Mercado Pago (Pix via Payments API, cartão via
 * Checkout Pro/Preferences). Não dá pra testar de ponta a ponta neste
 * ambiente — não existe conta/credenciais de sandbox do Mercado Pago
 * ainda. O código segue a documentação oficial do SDK v2; a validação
 * real (criar um Pix de verdade, receber o webhook de verdade) só
 * acontece quando a Festaê tiver uma conta Mercado Pago configurada.
 */
@Injectable()
export class MercadoPagoGateway implements PaymentGateway {
  private client(): MercadoPagoConfig {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new ServiceUnavailableException(
        "Pagamento online ainda não está configurado (falta MP_ACCESS_TOKEN). A reserva pode ser feita normalmente; o pagamento será combinado manualmente por enquanto.",
      );
    }
    return new MercadoPagoConfig({ accessToken });
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
        },
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
    });
    return {
      externalReference: input.paymentId,
      checkoutUrl: result.init_point,
    };
  }

  async parseWebhook(payload: unknown): Promise<WebhookResult | null> {
    const body = payload as { type?: string; data?: { id?: string } };
    if (body?.type !== "payment" || !body.data?.id) return null;

    const client = this.client();
    const payment = new MpPayment(client);
    const result = await payment.get({ id: body.data.id });

    const externalReference = result.external_reference;
    if (!externalReference) return null;

    const status =
      result.status === "approved" ? "PAID" : result.status === "rejected" || result.status === "cancelled" ? "FAILED" : "PENDING";

    return { externalReference, status };
  }
}
