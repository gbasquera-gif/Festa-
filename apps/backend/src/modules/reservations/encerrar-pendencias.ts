import { toCentsInt } from "@festae/shared";

/**
 * Quais cobranças pendentes um novo pagamento encerra.
 *
 * Vive fora do serviço, como função pura, pelo mesmo motivo que `periodo.ts`
 * e `contratos.ts`: é regra de dinheiro, e regra de dinheiro precisa de teste
 * que rode sem um Postgres de pé. O defeito que ela corrige só apareceu em
 * produção — um contrato pago integralmente ficou com uma cobrança de sinal
 * pendurada, porque a regra antiga só olhava o tipo do pagamento.
 */

export type PagamentoExistente = {
  id: string;
  type: string;
  status: string;
};

/** O pagamento novo quita o pedido? Comparado em centavos. */
export function quitaOPedido(jaPago: number, valorNovo: number, totalDoPedido: number): boolean {
  // 219,99999 >= 220 é falso em ponto flutuante, e um pedido quitado que não
  // parece quitado deixaria a pendência de pé.
  return toCentsInt(jaPago + valorNovo) >= toCentsInt(totalDoPedido);
}

/**
 * Os ids das pendências que este pagamento encerra.
 *
 * Dois níveis:
 *
 * 1. As do MESMO TIPO, sempre. A cliente pagou o sinal por outro caminho;
 *    deixar o Pix antigo "aguardando" faria o painel cobrar de novo alguém
 *    que já pagou.
 *
 * 2. TODAS as restantes, quando este pagamento quita o pedido. Um pedido pago
 *    não tem o que cobrar, seja qual for o tipo do lançamento que o pagou.
 *    Sem este segundo nível, um sinal pendente sobrevivia a um pagamento
 *    registrado como saldo, porque os tipos não batiam.
 *
 * Nunca devolve um pagamento PAID nem um FAILED: só o que está PENDING entra
 * na lista. Dinheiro que entrou é registro histórico, e nenhuma regra de
 * cobrança tem por que reescrevê-lo.
 */
export function pendentesAEncerrar(
  existentes: readonly PagamentoExistente[],
  novo: { tipo: string; valor: number },
  totalDoPedido: number,
  jaPago: number,
): string[] {
  const pendentes = existentes.filter((p) => p.status === "PENDING");
  const alvo = quitaOPedido(jaPago, novo.valor, totalDoPedido)
    ? pendentes
    : pendentes.filter((p) => p.type === novo.tipo);
  return alvo.map((p) => p.id);
}
