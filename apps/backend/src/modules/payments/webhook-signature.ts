import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Quanto o horário da assinatura pode estar longe do nosso relógio.
 *
 * Fora da janela, a notificação é recusada: uma notificação verdadeira que
 * alguém capturou não pode ser reapresentada depois. A janela é folgada de
 * propósito — relógios diferentes e reenvios do próprio Mercado Pago cabem
 * nela —, e o que eventualmente ficar de fora não se perde: a conferência
 * periódica dos Pix pendentes encontra o pagamento na API deles.
 */
export const JANELA_DA_ASSINATURA_MS = 15 * 60_000;

export interface SignatureInput {
  /** Cabeçalho `x-signature`, no formato `ts=...,v1=...`. */
  xSignature?: string;
  /** Cabeçalho `x-request-id`. */
  xRequestId?: string;
  /** `data.id` da notificação — o mesmo que depois é processado. */
  dataId?: string;
}

export type MotivoDaRecusa =
  /** Produção sem `MP_WEBHOOK_SECRET`: não há como saber quem chamou. */
  | "SEM_SEGREDO_EM_PRODUCAO"
  | "SEM_CABECALHO"
  | "MALFORMADA"
  | "NAO_CONFERE"
  | "FORA_DA_JANELA";

export type ResultadoDaAssinatura =
  /**
   * `conferida: false` só fora de produção, sem segredo configurado.
   * `idadeS`: quantos segundos se passaram desde o `ts` da assinatura
   * (negativo se o `ts` está no futuro), quando ele pôde ser lido.
   */
  | { valida: true; conferida: boolean; idadeS?: number }
  | { valida: false; motivo: MotivoDaRecusa; idadeS?: number };

/**
 * Confere se a notificação veio mesmo do Mercado Pago.
 *
 * A rota do webhook é pública — tem que ser, é o Mercado Pago que chama, sem
 * token nosso. A consulta à API deles continua sendo a fonte do status, mas
 * ela sozinha não basta: a notificação decide QUAL pagamento consultar e
 * QUANDO. Por isso, em produção:
 *  - sem segredo configurado, nada passa (antes passava tudo);
 *  - o id assinado é o id que será processado (quem chama garante);
 *  - o horário da assinatura tem de estar dentro da janela.
 *
 * O manifesto assinado é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * com HMAC-SHA256 da chave secreta mostrada ao configurar o webhook.
 */
export function verificarAssinatura(
  input: SignatureInput,
  contexto: { agora: number; producao: boolean; segredo?: string },
): ResultadoDaAssinatura {
  const segredo = contexto.segredo?.trim();
  if (!segredo) {
    return contexto.producao
      ? { valida: false, motivo: "SEM_SEGREDO_EM_PRODUCAO" }
      : { valida: true, conferida: false };
  }

  const { xSignature, xRequestId, dataId } = input;
  if (!xSignature || !xRequestId) return { valida: false, motivo: "SEM_CABECALHO" };

  const partes = new Map(
    xSignature.split(",").map((parte) => {
      const [chave, ...resto] = parte.split("=");
      return [chave.trim(), resto.join("=").trim()] as const;
    }),
  );
  const ts = partes.get("ts");
  const recebida = partes.get("v1");
  if (!ts || !recebida || !/^\d+$/.test(ts)) return { valida: false, motivo: "MALFORMADA" };

  // O Mercado Pago normaliza o id para minúsculas ao montar o manifesto, e
  // omite o par que não veio na notificação.
  const manifesto =
    (dataId ? `id:${dataId.toLowerCase()};` : "") + `request-id:${xRequestId};ts:${ts};`;
  const esperada = createHmac("sha256", segredo).update(manifesto).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  // Comparação de tempo constante: comparar hash com === vaza, pelo tempo
  // de resposta, quantos caracteres iniciais o atacante acertou.
  const idadeMs = contexto.agora - horarioEmMs(ts);
  const idadeS = Math.trunc(idadeMs / 1000);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valida: false, motivo: "NAO_CONFERE", idadeS };

  if (Math.abs(idadeMs) > JANELA_DA_ASSINATURA_MS) {
    return { valida: false, motivo: "FORA_DA_JANELA", idadeS };
  }
  return { valida: true, conferida: true, idadeS };
}

/**
 * O `ts` vem em milissegundos (é assim que o SDK oficial o lê). Um valor com
 * cara de segundos é aceito como segundos: errar a unidade recusaria todas
 * as notificações verdadeiras, e o erro só apareceria como "pagamento que
 * não confirma".
 */
function horarioEmMs(ts: string): number {
  const n = Number(ts);
  return n < 1e12 ? n * 1000 : n;
}

/**
 * O número da tentativa de entrega, do cabeçalho `x-retry` (0 na primeira).
 * Só dígitos; qualquer outra coisa vira `null`.
 */
export function lerTentativa(xRetry: unknown): number | null {
  const valor = Array.isArray(xRetry) ? xRetry[0] : xRetry;
  return typeof valor === "string" && /^\d{1,4}$/.test(valor.trim()) ? Number(valor.trim()) : null;
}

/**
 * A linha de log de uma notificação, só com o que serve para diagnóstico:
 * motivo, idade da assinatura e tentativa. Nunca a assinatura, o segredo,
 * o id do pagamento ou valores — o formato é fechado aqui para isso não
 * escapar por descuido em quem chama.
 */
export function diagnosticoDaNotificacao(d: {
  situacao: "recusada" | "aceita";
  motivo?: MotivoDaRecusa | "ID_DIVERGENTE";
  idadeS?: number;
  tentativa: number | null;
}): string {
  const partes = [`Notificação do Mercado Pago ${d.situacao}`];
  if (d.motivo) partes.push(`motivo=${d.motivo}`);
  // Limitado: o ts de uma assinatura que não confere vem de quem chamou.
  if (d.idadeS !== undefined) partes.push(`idade=${Math.max(-999_999, Math.min(999_999, d.idadeS))}s`);
  partes.push(`tentativa=${d.tentativa ?? "?"}`);
  return partes.join(" ");
}

/**
 * As notificações já processadas, para a mesma não ser processada duas vezes.
 *
 * Chave: o `x-request-id`, que está dentro da assinatura. Uma notificação
 * capturada e reapresentada dentro da janela traz o mesmo id e é ignorada;
 * fora da janela, a assinatura já a recusa. Fica só em memória: a API roda
 * em uma instância, e depois de um reinício o pior caso é processar de novo
 * algo que já está gravado — o processamento é idempotente.
 *
 * Só se marca depois de processar com sucesso: se a primeira tentativa
 * falhou, o reenvio do Mercado Pago precisa passar.
 */
export class NotificacoesProcessadas {
  private readonly vistas = new Map<string, number>();

  constructor(private readonly limite = 10_000) {}

  jaProcessada(requestId: string, agora: number): boolean {
    const expira = this.vistas.get(requestId);
    return expira !== undefined && expira > agora;
  }

  marcar(requestId: string, agora: number): void {
    // Expira com folga: além da janela, a assinatura já não passa.
    this.vistas.set(requestId, agora + 2 * JANELA_DA_ASSINATURA_MS);
    if (this.vistas.size <= this.limite) return;
    for (const [id, expira] of this.vistas) {
      if (expira <= agora || this.vistas.size > this.limite) this.vistas.delete(id);
      if (this.vistas.size <= this.limite / 2) break;
    }
  }
}

export type Notificacao =
  | { ok: true; dataId?: string; ehPagamento: boolean }
  | { ok: false };

/**
 * Lê de onde vem o id da notificação.
 *
 * O Mercado Pago manda `data.id` na URL e no corpo. A assinatura é conferida
 * com um deles; processar o outro deixaria a assinatura cobrir um pagamento e
 * o processamento mexer em outro. Os dois têm de ser iguais quando vêm juntos,
 * e o id devolvido aqui é o único usado daqui em diante.
 */
export function lerNotificacao(
  query: { dataId?: unknown; type?: unknown; topic?: unknown },
  corpo: unknown,
): Notificacao {
  const body = (corpo ?? {}) as { type?: unknown; action?: unknown; data?: { id?: unknown } };
  const daUrl = comoTexto(query.dataId);
  const doCorpo = comoTexto(body.data?.id);
  // Presente mas ilegível (lista, objeto): não se escolhe um dos valores.
  if (query.dataId !== undefined && daUrl === undefined) return { ok: false };
  if (body.data?.id !== undefined && doCorpo === undefined) return { ok: false };
  if (daUrl !== undefined && doCorpo !== undefined && daUrl !== doCorpo) return { ok: false };

  const ehPagamento =
    body.type === "payment" ||
    (typeof body.action === "string" && body.action.startsWith("payment.")) ||
    query.type === "payment" ||
    query.topic === "payment";
  return { ok: true, dataId: daUrl ?? doCorpo, ehPagamento };
}

function comoTexto(valor: unknown): string | undefined {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== "string") return undefined;
  const t = valor.trim();
  return t.length > 0 ? t : undefined;
}
