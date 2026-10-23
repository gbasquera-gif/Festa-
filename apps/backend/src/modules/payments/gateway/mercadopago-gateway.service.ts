import { randomUUID } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { MercadoPagoConfig, Payment as MpPayment, Preference as MpPreference } from "mercadopago";
import type {
  CheckoutResult,
  CreateCheckoutInput,
  GatewayPaymentStatus,
  OpcoesDaConsulta,
  PaymentGateway,
  ResultadoDoCancelamentoNoProvedor,
} from "./payment-gateway.interface";
import type { PagamentoNoProvedor } from "../conferencia-do-provedor";

/**
 * A consulta rápida: 5 s e uma tentativa.
 *
 * `retries` é o total de tentativas no SDK (o padrão é 2) e não está no tipo
 * público dele, embora o cliente HTTP o leia. Sem isto, um tempo esgotado era
 * repetido: o erro de tempo não tem status HTTP, e o SDK só deixa de repetir
 * erro com status abaixo de 500.
 */
export const CONSULTA_RAPIDA = { timeout: 5_000, retries: 1 } as const;

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
          payer: {
            email: input.payerEmail,
            ...(input.payerFirstName ? { first_name: input.payerFirstName } : {}),
            ...(input.payerLastName ? { last_name: input.payerLastName } : {}),
          },
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
        // Página oficial do Mercado Pago com o mesmo QR e as instruções.
        // Guardada como plano B: se o QR não renderizar no aparelho de
        // alguém, ainda existe um caminho para pagar.
        checkoutUrl: pix?.ticket_url,
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

  async consultarPagamento(idNoProvedor: string, opcoes?: OpcoesDaConsulta): Promise<PagamentoNoProvedor | null> {
    const pagamento = new MpPayment(this.client());
    try {
      return paraConferencia(await pagamento.get({ id: idNoProvedor, requestOptions: opcoesDoSdk(opcoes) }));
    } catch (error) {
      // 404 é resposta, não falha: o id não existe na conta da Festaê.
      if ((error as { status?: number })?.status === 404) return null;
      throw error;
    }
  }

  async buscarPorReferencia(referencia: string, opcoes?: OpcoesDaConsulta): Promise<PagamentoNoProvedor[]> {
    const pagamento = new MpPayment(this.client());
    const busca = await pagamento.search({
      options: { external_reference: referencia, limit: 10 },
      requestOptions: opcoesDoSdk(opcoes),
    });
    return (busca.results ?? []).map(paraConferencia);
  }

  /**
   * Cancela um Pix pendente pela API de pagamentos do Mercado Pago
   * (`Payment.cancel` do SDK oficial, que só cancela o que não foi aprovado).
   *
   * Recusa do provedor não é tratada como sucesso nem como erro: o status
   * real é consultado em seguida, porque a recusa mais comum é justamente a
   * cobrança já ter sido paga — e aí o dinheiro precisa ser registrado.
   */
  async cancelar(idNoProvedor: string): Promise<ResultadoDoCancelamentoNoProvedor> {
    let client: MercadoPagoConfig;
    try {
      client = this.client();
    } catch {
      // Sem credencial não há Pix no provedor para cancelar nem para consultar.
      return "NAO_CONFIRMADO";
    }
    const pagamento = new MpPayment(client);
    try {
      const resultado = await pagamento.cancel({
        id: idNoProvedor,
        requestOptions: { idempotencyKey: `cancelar-${idNoProvedor}` },
      });
      if (resultado.status === "cancelled") return "ENCERRADA";
      if (this.toStatus(resultado.status) === "PAID") return "JA_PAGA";
    } catch (error) {
      this.logger.warn(`O Mercado Pago recusou cancelar a cobrança ${idNoProvedor}: ${error}`);
    }
    try {
      const atual = await pagamento.get({ id: idNoProvedor });
      const status = this.toStatus(atual.status);
      if (status === "PAID") return "JA_PAGA";
      // Cancelada, recusada ou estornada: não pode mais ser paga.
      if (status === "FAILED") return "ENCERRADA";
    } catch (error) {
      this.logger.warn(`Não foi possível consultar a cobrança ${idNoProvedor}: ${error}`);
    }
    return "NAO_CONFIRMADO";
  }

}

type OpcoesDoSdk = Parameters<MpPayment["get"]>[0]["requestOptions"];

function opcoesDoSdk(opcoes?: OpcoesDaConsulta): OpcoesDoSdk {
  return opcoes?.rapida ? (CONSULTA_RAPIDA as OpcoesDoSdk) : undefined;
}

/** Os campos que a conferência usa, do jeito que o SDK os devolve. */
function paraConferencia(p: {
  id?: string | number;
  external_reference?: string;
  status?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  currency_id?: string;
  live_mode?: boolean;
}): PagamentoNoProvedor {
  return {
    id: String(p.id ?? ""),
    referencia: p.external_reference ?? null,
    status: p.status ?? null,
    valor: typeof p.transaction_amount === "number" ? p.transaction_amount : null,
    valorEstornado: typeof p.transaction_amount_refunded === "number" ? p.transaction_amount_refunded : null,
    moeda: p.currency_id ?? null,
    producao: typeof p.live_mode === "boolean" ? p.live_mode : null,
  };
}
