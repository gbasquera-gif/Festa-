import { Logger } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { Conflito } from "./item-commitment";

/** Em que operação a falta de material foi constatada. */
export type ContextoDoConflito =
  | "VENDA_MANUAL"
  | "CONVERSAO_DE_PROPOSTA"
  | "EDICAO_DE_RESERVA"
  | "REAGENDAMENTO"
  | "LOJA";

/** Quem grava — injetável para o teste poder simular uma falha. */
export interface EscritorDeEventos {
  createMany(args: {
    data: { type: string; metadata: Record<string, unknown> }[];
  }): Promise<unknown>;
}

const logger = new Logger("ConflitoDeAcervo");

/**
 * Registra que uma venda (ou edição) foi recusada por falta de peça.
 *
 * Só é chamado depois de uma conferência real de estoque ter dado conflito —
 * o calendário da loja, que só pinta dia de vermelho, não registra nada.
 * Uma linha por produto em falta, porque a pergunta que isto vai responder
 * mais tarde é por produto: "o que mais nos faz perder data?".
 *
 * Nunca lança erro. O registro é estatística; a recusa é a operação. Se o
 * banco de eventos estiver fora, quem estava vendendo tem de receber o 409
 * com o motivo, não um 500 sobre uma tabela que não é dela.
 */
export async function registrarConflitosDeAcervo(
  conflitos: readonly Conflito[],
  dataDaFesta: Date,
  contexto: ContextoDoConflito,
  referencia?: string,
  escritor: EscritorDeEventos = {
    createMany: (args) => prisma.analyticsEvent.createMany(args as never),
  },
): Promise<void> {
  if (conflitos.length === 0) return;
  const dia = dataDaFesta.toISOString().slice(0, 10);

  try {
    await escritor.createMany({
      data: conflitos.map((c) => ({
        type: "CONFLITO_DE_ACERVO",
        metadata: {
          productId: c.productId,
          dataDaFesta: dia,
          solicitado: c.pedido,
          disponivel: Math.max(0, c.estoque - c.jaComprometido),
          contexto,
          ...(referencia ? { referencia } : {}),
        },
      })),
    });
  } catch (erro) {
    logger.warn(
      `Não foi possível registrar ${conflitos.length} conflito(s) de acervo (${contexto}, ${dia}): ` +
        `${erro instanceof Error ? erro.message : String(erro)}. A operação seguiu normalmente.`,
    );
  }
}
