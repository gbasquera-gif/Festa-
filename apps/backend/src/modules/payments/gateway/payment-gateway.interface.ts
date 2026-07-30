export interface CreateCheckoutInput {
  paymentId: string;
  amount: number;
  description: string;
  payerEmail: string;
  method: "PIX" | "CARTAO";
}

export interface CheckoutResult {
  externalReference: string;
  checkoutUrl?: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
}

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
}

export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";
