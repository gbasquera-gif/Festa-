import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@festae/database";
import { fromCentsInt, motivoDeRecusaDaAplicacao, toCentsInt } from "@festae/shared";

/**
 * As operações do extrato de crédito, dentro da transação de quem chama.
 *
 * Toda escrita no extrato passa por aqui, e sempre depois de `travarCredito`:
 * duas abas aplicando o mesmo crédito ao mesmo tempo leriam o mesmo saldo,
 * as duas achariam que cabe, e a cliente gastaria duas vezes o que tem uma.
 * A trava é por cliente — clientes diferentes não esperam umas pelas outras.
 *
 * Ordem das travas, sempre a mesma em todo caminho: primeiro a linha do
 * pedido (`FOR UPDATE`, a mesma do registro de pagamento), depois o crédito
 * da cliente. Duas operações que travassem em ordens diferentes poderiam
 * esperar uma pela outra para sempre.
 */

type Tx = Prisma.TransactionClient;

/** Serializa tudo que mexe no saldo desta cliente até o fim da transação. */
export async function travarCredito(tx: Tx, userId: string): Promise<void> {
  // $executeRaw, e não $queryRaw: a função devolve void, que o Prisma não
  // consegue desserializar como linha.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credito-da-cliente:${userId}`}))`;
}

/** Trava a linha do pedido: a mesma trava do registro de pagamento. */
export async function travarPedido(tx: Tx, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
}

/** O saldo da cliente: a soma do extrato, em centavos. */
export async function saldoEmCentavos(tx: Tx, userId: string): Promise<number> {
  const linhas = await tx.creditoClienteMovimento.findMany({
    where: { userId },
    select: { valor: true },
  });
  return linhas.reduce((t, l) => t + toCentsInt(Number(l.valor)), 0);
}

/** Crédito abatendo a reserva agora: o que saiu para ela e não voltou. */
export async function creditoAplicadoEmCentavos(tx: Tx, reservationId: string): Promise<number> {
  const linhas = await tx.creditoClienteMovimento.findMany({
    where: { reservationDestinoId: reservationId },
    select: { valor: true },
  });
  return Math.max(0, -linhas.reduce((t, l) => t + toCentsInt(Number(l.valor)), 0));
}

/** Soma dos pagamentos PAID do pedido, em centavos. Pendente não conta. */
export async function pagoEmCentavos(tx: Tx, orderId: string): Promise<number> {
  const pagos = await tx.payment.findMany({
    where: { orderId, status: "PAID" },
    select: { amount: true },
  });
  return pagos.reduce((t, p) => t + toCentsInt(Number(p.amount)), 0);
}

/**
 * Usa crédito da cliente numa reserva.
 *
 * Quem chama já travou o pedido. Aqui se trava o crédito, se relê o saldo e o
 * que falta pagar — os dois de dentro da trava — e só então se grava.
 */
export async function utilizarCredito(
  tx: Tx,
  dados: {
    userId: string;
    reservationId: string;
    orderId: string;
    totalDoPedido: number;
    valor: number;
    createdById: string;
    observacao?: string | null;
  },
) {
  await travarCredito(tx, dados.userId);

  const saldo = await saldoEmCentavos(tx, dados.userId);
  const pago = await pagoEmCentavos(tx, dados.orderId);
  const jaAplicado = await creditoAplicadoEmCentavos(tx, dados.reservationId);
  const falta = toCentsInt(dados.totalDoPedido) - pago - jaAplicado;

  const recusa = motivoDeRecusaDaAplicacao({
    valor: dados.valor,
    saldoDaCliente: fromCentsInt(saldo),
    faltaPagar: fromCentsInt(falta),
  });
  if (recusa) throw new ConflictException({ message: recusa, codigo: "CREDITO_INVALIDO" });

  return tx.creditoClienteMovimento.create({
    data: {
      userId: dados.userId,
      tipo: "CREDITO_UTILIZADO",
      valor: -fromCentsInt(toCentsInt(dados.valor)),
      reservationDestinoId: dados.reservationId,
      observacao: dados.observacao?.trim() || null,
      createdById: dados.createdById,
    },
  });
}
