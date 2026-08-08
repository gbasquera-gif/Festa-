export interface CreateCheckoutInput {
  paymentId: string;
  amount: number;
  description: string;
  payerEmail: string;
  /** Nome do pagador, para conciliar o Pix com o cliente no extrato. */
  payerFirstName?: string;
  payerLastName?: string;
  method: "PIX" | "CARTAO";
  /** Quando o QR do Pix deixa de ser pagável. */
  expiresAt?: Date;
}

export interface CheckoutResult {
  externalReference: string;
  checkoutUrl?: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
}

export type GatewayPaymentStatus = "PENDING" | "PAID" | "FAILED";

export interface WebhookResult {
  externalReference: string;
  status: "PENDING" | "PAID" | "FAILED";
}

// Ponto de extensão: qualquer gateway (Mercado Pago hoje; Stripe, Pagar.me
// etc. amanhã, se fizer sentido) implementa esta interface. Nada que chama
// PaymentsService precisa saber qual gateway está por trás.
export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  parseWebhook(payload: unknown): Promise<WebhookResult | null>;
  /**
   * Consulta o status atual de um pagamento.
   *
   * Rede de segurança para quando o webhook não chega: sem isto, uma
   * notificação perdida deixaria um cliente que já pagou olhando
   * "aguardando confirmação" para sempre.
   */
  getStatus(externalReference: string): Promise<GatewayPaymentStatus | null>;
}

export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";
