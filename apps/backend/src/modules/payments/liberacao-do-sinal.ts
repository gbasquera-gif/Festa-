/**
 * Antes de liberar uma reserva sem sinal: o que o banco já diz do pagamento.
 *
 * A liberação devolve as peças ao acervo quando a reserva da loja passa do
 * prazo sem sinal. "Sem sinal" era lido só no banco — e o banco não sabe de
 * um Pix pago cujo aviso ainda não chegou, nem de um Pix gerado de novo que
 * ainda pode ser pago. Cancelar nesses casos devolvia a peça com o dinheiro
 * da cliente a caminho.
 *
 * A triagem separa o que se decide sem sair daqui do que precisa de consulta
 * ao Mercado Pago. Ela não muda prazo nenhum: só impede liberar enquanto o
 * pagamento não está confirmado como não feito.
 */

export type CobrancaDoSinal = {
  id: string;
  status: string;
  method: string;
  externalReference: string | null;
  expiresAt: Date | null;
  syncedAt: Date | null;
};

/**
 * - PAGO: há pagamento registrado; não se libera.
 * - COBRANCA_VIVA: há Pix ainda pagável (inclusive um sendo gerado agora).
 * - VERIFICACAO_PENDENTE: o estado do pagamento não pôde ser confirmado
 *   (provedor fora do ar, resposta divergente, pagamento em análise). A
 *   reserva fica como está, segurando as peças, até a próxima conferência.
 * - LIBERAVEL: não há pagamento, nem como haver.
 */
export type SituacaoDoSinal = "PAGO" | "COBRANCA_VIVA" | "VERIFICACAO_PENDENTE" | "LIBERAVEL";

/**
 * Cobrança no provedor que ainda não foi confirmada como não paga.
 *
 * Pendente com referência no provedor (Pix vencido ou cartão), e recusada
 * por vencimento sem consulta depois de vencer — a geração de um Pix novo
 * marca o anterior como recusado sem perguntar ao Mercado Pago, e ele pode
 * ter sido pago no último minuto. É o mesmo critério da conferência
 * periódica.
 */
export function precisaConsultarOProvedor(c: CobrancaDoSinal, agora: Date): boolean {
  if (!c.externalReference) return false;
  if (c.status === "PENDING") return true;
  if (c.status !== "FAILED" || !c.expiresAt || c.expiresAt.getTime() >= agora.getTime()) return false;
  return !c.syncedAt || c.syncedAt.getTime() <= c.expiresAt.getTime();
}

export function triagemDoSinal(
  cobrancas: readonly CobrancaDoSinal[],
  agora: Date,
): { decisao: Exclude<SituacaoDoSinal, "VERIFICACAO_PENDENTE"> | null; aConsultar: CobrancaDoSinal[] } {
  if (cobrancas.some((c) => c.status === "PAID")) return { decisao: "PAGO", aConsultar: [] };
  const pixVivo = cobrancas.some(
    (c) => c.status === "PENDING" && c.method === "PIX" && c.expiresAt !== null && c.expiresAt.getTime() > agora.getTime(),
  );
  if (pixVivo) return { decisao: "COBRANCA_VIVA", aConsultar: [] };
  const aConsultar = cobrancas.filter((c) => precisaConsultarOProvedor(c, agora));
  return { decisao: aConsultar.length === 0 ? "LIBERAVEL" : null, aConsultar };
}
