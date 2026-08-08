import { createHmac, timingSafeEqual } from "node:crypto";
import { Logger } from "@nestjs/common";

const logger = new Logger("WebhookSignature");

export interface SignatureInput {
  /** Cabeçalho `x-signature`, no formato `ts=...,v1=...`. */
  xSignature?: string;
  /** Cabeçalho `x-request-id`. */
  xRequestId?: string;
  /** `data.id` da notificação. */
  dataId?: string;
}

/**
 * Confere se a notificação veio mesmo do Mercado Pago.
 *
 * A rota do webhook é pública — tem que ser, é o Mercado Pago que chama, sem
 * token nosso. A proteção principal já existe e é outra: nunca acreditamos
 * no corpo da notificação, sempre buscamos o pagamento na API deles antes de
 * marcar qualquer coisa como paga. Ou seja, forjar um "pago" não funciona.
 *
 * A assinatura fecha o buraco que sobra: sem ela, qualquer um pode disparar
 * chamadas na nossa rota e nos fazer consultar a API do Mercado Pago em
 * looping, até estourarmos o limite deles.
 *
 * O manifesto assinado é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * com HMAC-SHA256 da chave secreta mostrada ao configurar o webhook.
 */
export function isValidWebhookSignature(input: SignatureInput): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;

  if (!secret) {
    // Sem segredo configurado a checagem não tem como acontecer. Deixamos
    // passar porque a busca na API do Mercado Pago continua impedindo
    // fraude, mas isso precisa aparecer no log — é configuração faltando.
    logger.warn(
      "MP_WEBHOOK_SECRET não configurado: a assinatura das notificações do Mercado Pago não está sendo verificada.",
    );
    return true;
  }

  const { xSignature, xRequestId, dataId } = input;
  if (!xSignature || !xRequestId || !dataId) return false;

  const parts = new Map(
    xSignature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.trim(), rest.join("=").trim()] as const;
    }),
  );

  const ts = parts.get("ts");
  const received = parts.get("v1");
  if (!ts || !received) return false;

  // O Mercado Pago normaliza o id para minúsculas ao montar o manifesto.
  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  // Comparação de tempo constante: comparar hash com === vaza, pelo tempo
  // de resposta, quantos caracteres iniciais o atacante acertou.
  return a.length === b.length && timingSafeEqual(a, b);
}
