/**
 * Desfaz a carga histórica.
 *
 *   tsx scripts/desfazer-carga-historica.ts            simula
 *   tsx scripts/desfazer-carga-historica.ts --aplicar  apaga
 *
 * Só alcança o que a carga criou. O critério é a referência externa
 * `legado:` — nada que a operação tenha cadastrado carrega essa marca, e é
 * por isso que ela existe.
 *
 * O que NÃO desfaz, de propósito:
 *
 *   clientes — a carga cria o cliente quando não acha pelo nome, e não há
 *   marca que separe "criado agora" de "já existia". Apagar um cliente que
 *   já estava ali seria pior que deixar um cadastro vazio para trás.
 *
 *   meta mensal — a carga faz upsert, então pode ter sobrescrito um valor
 *   anterior que ninguém guardou. Restaurar exige saber qual era.
 *
 *   reservas da operação — a carga nunca as altera, então não há o que
 *   desfazer. As exceções comerciais que ela tenha acrescentado a elas são
 *   removidas, porque essas sim foram gravadas pela carga.
 */
import { prisma } from "@festae/database";

const PREFIXO = "legado:";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  console.log(aplicar ? "MODO: APAGANDO\n" : "MODO: SIMULAÇÃO — nada será apagado\n");
  console.log(`banco: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}\n`);

  const reservas = await prisma.reservation.findMany({
    where: { referenciaExterna: { startsWith: PREFIXO } },
    select: {
      id: true,
      referenciaExterna: true,
      orderId: true,
      order: { select: { eventId: true, total: true, payments: { select: { id: true } } } },
      excecoes: { select: { id: true } },
    },
  });

  const gastos = await prisma.gasto.findMany({
    where: { referenciaExterna: { startsWith: PREFIXO } },
    select: { id: true, valor: true },
  });

  // Exceções gravadas pela carga em reservas que a operação já tinha.
  const idsMigrados = new Set(reservas.map((r) => r.id));
  const excecoesEmReservasDaOperacao = await prisma.excecaoComercial.findMany({
    where: { reservationId: { notIn: [...idsMigrados] } },
    select: { id: true, reservationId: true, regra: true },
  });

  console.log(`reservas migradas.................. ${reservas.length}`);
  console.log(`  pedidos.......................... ${reservas.length}`);
  console.log(`  pagamentos....................... ${reservas.reduce((s, r) => s + r.order.payments.length, 0)}`);
  console.log(`  exceções nessas reservas......... ${reservas.reduce((s, r) => s + r.excecoes.length, 0)}`);
  console.log(`exceções em reservas da operação... ${excecoesEmReservasDaOperacao.length}`);
  console.log(`gastos importados.................. ${gastos.length}`);
  console.log(`\nnão serão tocados: clientes, meta mensal, e qualquer reserva sem referência ${PREFIXO}`);

  if (!aplicar) {
    console.log("\nNada foi apagado. Rode com --aplicar para executar.");
    return;
  }

  // Apagar o evento derruba pedido, pagamentos, reserva e exceções em cascata,
  // numa transação só: um rollback pela metade deixaria pedido órfão sem
  // reserva, que é pior que não ter desfeito nada.
  const eventos = reservas.map((r) => r.order.eventId);
  const apagados = await prisma.$transaction(async (tx) => {
    if (excecoesEmReservasDaOperacao.length > 0) {
      await tx.excecaoComercial.deleteMany({
        where: { id: { in: excecoesEmReservasDaOperacao.map((e) => e.id) } },
      });
    }
    const eventosApagados = eventos.length > 0 ? await tx.event.deleteMany({ where: { id: { in: eventos } } }) : { count: 0 };
    const gastosApagados = gastos.length > 0 ? await tx.gasto.deleteMany({ where: { referenciaExterna: { startsWith: PREFIXO } } }) : { count: 0 };
    return { eventos: eventosApagados.count, gastos: gastosApagados.count };
  });

  console.log(`\napagados: ${apagados.eventos} eventos (com pedido, pagamento e reserva) e ${apagados.gastos} gastos.`);
  const sobrou = await prisma.reservation.count({ where: { referenciaExterna: { startsWith: PREFIXO } } });
  console.log(sobrou === 0 ? "nenhuma reserva migrada restante." : `ATENÇÃO: ainda restam ${sobrou}.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
