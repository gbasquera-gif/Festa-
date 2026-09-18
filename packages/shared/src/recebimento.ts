import { toCentsInt } from "./pricing";

/**
 * Em que pé está o recebimento de um pedido, para efeito de apresentação.
 *
 * Existe porque a mesma pergunta era respondida de três jeitos diferentes. A
 * tela de Reservas olhava o TIPO do lançamento — um `DEPOSIT` pago virava
 * "Sinal recebido" mesmo tendo quitado o pedido inteiro; o comprovante olhava
 * o saldo e dizia "Pago integralmente" para o mesmo contrato. Uma cliente que
 * pagou R$ 200,00 de uma vez aparecia como "sinal" numa tela e como quitada
 * na outra, e não havia como saber qual estava certa — porque nenhuma delas
 * era a regra, as duas eram cópias.
 *
 * A regra é o dinheiro: quanto entrou contra quanto foi contratado. O tipo do
 * lançamento continua importando para descrever COMO se pagou, nunca para
 * decidir SE está pago.
 *
 * Complementa `situacaoDePagamento` do módulo financeiro, que acrescenta
 * tempo e cancelamento à mesma pergunta. Esta aqui é só o dinheiro, e é o que
 * as telas operacionais precisam.
 */

export const SITUACOES_DO_RECEBIMENTO = ["QUITADO", "PARCIAL", "AGUARDANDO"] as const;
export type SituacaoDoRecebimento = (typeof SITUACOES_DO_RECEBIMENTO)[number];

export const SITUACAO_DO_RECEBIMENTO_LABEL: Record<SituacaoDoRecebimento, string> = {
  QUITADO: "Pago integralmente",
  PARCIAL: "Parcialmente recebido",
  AGUARDANDO: "Aguardando pagamento",
};

/**
 * A situação do recebimento, a partir do total e do que efetivamente entrou.
 *
 * Comparação em centavos: `199.99999 >= 200` é falso em ponto flutuante, e um
 * contrato quitado que não parece quitado manda a operação cobrar de novo
 * quem já pagou.
 *
 * Nada recebido nunca é QUITADO, mesmo num pedido de total zero — um contrato
 * sem dinheiro nenhum não é uma boa notícia para exibir como tal.
 */
export function situacaoDoRecebimento(total: number, recebido: number): SituacaoDoRecebimento {
  const recebidoEmCentavos = toCentsInt(recebido);
  if (recebidoEmCentavos <= 0) return "AGUARDANDO";
  return recebidoEmCentavos >= toCentsInt(total) ? "QUITADO" : "PARCIAL";
}

/** Quitado é saldo coberto, qualquer que seja o tipo do lançamento que cobriu. */
export function estaQuitado(total: number, recebido: number): boolean {
  return situacaoDoRecebimento(total, recebido) === "QUITADO";
}
