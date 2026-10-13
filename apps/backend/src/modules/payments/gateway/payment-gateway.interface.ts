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
  /**
   * Encerra no provedor uma cobrança Pix que ainda não foi paga.
   *
   * Usado quando a reserva é cancelada: o QR antigo deixa de ser pagável e
   * a cliente não consegue mandar dinheiro para uma festa que não existe
   * mais. O provedor só cancela o que não foi aprovado; se já foi pago, a
   * resposta diz isso e o pagamento segue o caminho do pagamento tardio.
   *
   * Recebe o id da cobrança no provedor (o `externalReference` gravado).
   */
  cancelar(idNoProvedor: string): Promise<ResultadoDoCancelamentoNoProvedor>;
}

/**
 * - ENCERRADA: o provedor confirmou que a cobrança não pode mais ser paga.
 * - JA_PAGA: a cobrança foi aprovada antes do cancelamento chegar.
 * - NAO_CONFIRMADO: não deu para confirmar (provedor fora do ar, sem
 *   credencial, resposta inesperada). A cobrança continua como estava.
 */
export type ResultadoDoCancelamentoNoProvedor = "ENCERRADA" | "JA_PAGA" | "NAO_CONFIRMADO";

export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";
