import type { Prisma } from "@festae/database";
import { diaDaFesta } from "@festae/shared";

/**
 * A trava do acervo de um dia.
 *
 * Todo caminho que compromete material numa data — loja, venda manual,
 * conversão e aprovação de proposta, edição e remarcação de reserva — confere
 * a disponibilidade e grava sob esta trava, dentro da mesma transação. Duas
 * operações no mesmo dia passam uma de cada vez: a segunda só confere depois
 * que a primeira gravou (ou desistiu), e por isso enxerga o que a primeira
 * levou.
 *
 * A chave é a mesma que a aprovação de proposta já usava. Mudar o texto dela
 * separaria os canais em travas diferentes sem nenhum erro aparecer — por
 * isso existe uma função só para montá-la.
 *
 * É uma trava de transação (`pg_advisory_xact_lock`): sai sozinha no commit
 * ou no rollback, e pedir de novo a que a própria transação já tem não espera.
 */
export function chaveDaTravaDaData(dia: string): string {
  return `aprovacao-de-proposta:${dia}`;
}

/**
 * Trava os dias das datas, sempre em ordem crescente e sem repetir.
 *
 * Ordem das travas, em todo o sistema: **dias** (crescentes) → **pedido**
 * (`travarPedido`) → **crédito** (`travarCredito`). Ninguém pede a trava de um
 * dia segurando a de um pedido. Com a mesma ordem em todo lugar, duas
 * operações nunca ficam esperando uma pela outra em círculo.
 *
 * Devolve os dias travados (AAAA-MM-DD), na ordem em que foram travados.
 */
export async function travarDatas(tx: Prisma.TransactionClient, datas: readonly Date[]): Promise<string[]> {
  const dias = [...new Set(datas.map((d) => diaDaFesta(d)))].sort();
  for (const dia of dias) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chaveDaTravaDaData(dia)}))`;
  }
  return dias;
}
