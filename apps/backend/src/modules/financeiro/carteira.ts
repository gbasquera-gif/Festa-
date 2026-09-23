import { prisma } from "@festae/database";

/**
 * A carteira de contratos, crua, do jeito que `montarLinha` espera.
 *
 * Uma consulta só para toda leitura de contrato — o Financeiro, o seu
 * detalhamento e a Visão Geral Comercial. Duas consultas parecidas é como um
 * número passa a divergir do seu vizinho de tela: basta uma ganhar um filtro
 * que a outra não tem.
 *
 * Traz canceladas e rejeitadas junto; é `vigente`, em `contratos.ts`, que
 * decide o que entra em total.
 */
export function lerCarteiraCrua() {
  return prisma.reservation.findMany({
      select: {
        id: true,
        contractSeq: true,
        status: true,
        eventDate: true,
        requestedAt: true,
        confirmedAt: true,
        cancelledAt: true,
        rescheduledFrom: true,
        origemDoRegistro: true,
        referenciaExterna: true,
        order: {
          select: {
            total: true,
            fulfillment: true,
            assembly: true,
            kit: { select: { name: true } },
            event: {
              select: {
                city: true,
                saleChannel: true,
                guestCount: true,
                type: true,
                theme: { select: { name: true } },
                user: { select: { name: true, email: true, phone: true } },
              },
            },
            payments: {
              select: {
                id: true,
                type: true,
                status: true,
                method: true,
                amount: true,
                paidAt: true,
              },
            },
          },
        },
      },
      orderBy: { eventDate: "desc" },
    });
}
