import type { PagamentoNoProvedor } from "../conferencia-do-provedor";

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

// Ponto de extensão: qualquer gateway (Mercado Pago hoje; Stripe, Pagar.me
// etc. amanhã, se fizer sentido) implementa esta interface. Nada que chama
// PaymentsService precisa saber qual gateway está por trás.
export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult>;
  /**
   * O pagamento como está no provedor, pelo id dele.
   *
   * Devolve o pagamento inteiro — referência, valor, moeda, estorno —, e não
   * só o status: o status não prova que o pagamento é o desta cobrança nem
   * que tem o valor dela (`decidirPeloProvedor` confere). `null` quando o
   * provedor não o encontra. Falha de comunicação é exceção.
   */
  consultarPagamento(idNoProvedor: string): Promise<PagamentoNoProvedor | null>;
  /**
   * Os pagamentos do provedor que dizem ser desta cobrança.
   *
   * Para o cartão, cujo id no provedor só existe depois do pagamento. Mais de
   * um resultado é possível, e cada um passa pela mesma conferência.
   */
  buscarPorReferencia(referencia: string): Promise<PagamentoNoProvedor[]>;
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
