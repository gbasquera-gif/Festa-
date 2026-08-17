import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import type { TrackEventInput } from "@festae/shared";
import { montarFunil, taxa, ticketMedio, type LinhaDeOrigem } from "./funnel";

const SUMMARY_WINDOW_DAYS = 30;

/** Reservas que continuam de pé. Recusada e cancelada não contam como venda. */
const RESERVAS_VALIDAS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

@Injectable()
export class AnalyticsService {
  track(input: TrackEventInput) {
    return prisma.analyticsEvent.create({
      data: {
        type: input.type,
        userId: input.userId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }

  /**
   * O placar da loja: quem chegou, de onde, quem montou, reservou e pagou.
   *
   * Uma tela só, com as contas que decidem alguma coisa nesta fase. As
   * conversões vêm prontas do servidor em vez de calculadas no painel para
   * que o número seja o mesmo em qualquer lugar que alguém o leia.
   */
  async summary() {
    const desde = new Date();
    desde.setDate(desde.getDate() - SUMMARY_WINDOW_DAYS);

    const [porTipo, festas] = await Promise.all([
      prisma.analyticsEvent.groupBy({
        by: ["type"],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
      }),
      // As festas da janela com o que precisamos para ligar origem a dinheiro.
      prisma.event.findMany({
        where: { createdAt: { gte: desde } },
        select: {
          utmSource: true,
          utmCampaign: true,
          order: {
            select: {
              total: true,
              reservation: { select: { status: true } },
              payments: { select: { status: true, type: true } },
            },
          },
        },
      }),
    ]);

    const contagem = new Map(porTipo.map((linha) => [linha.type, linha._count._all]));
    const funnel = montarFunil(contagem);

    const visitas = contagem.get("VISITA_LOJA") ?? 0;

    // Reservas e pagamentos saem das festas, e não da contagem de eventos:
    // evento de funil é best-effort e pode se perder, mas reserva gravada é
    // fato. Para o número que vira decisão, o banco manda.
    const comReserva = festas.filter(
      (f) => f.order?.reservation && RESERVAS_VALIDAS.includes(f.order.reservation.status as never),
    );
    const pagas = comReserva.filter((f) =>
      f.order!.payments.some((p) => p.status === "PAID" && p.type === "DEPOSIT"),
    );

    const porOrigem = new Map<string, LinhaDeOrigem>();
    const visitasPorOrigem = await this.visitasPorOrigem(desde);

    for (const [origem, quantidade] of visitasPorOrigem) {
      porOrigem.set(origem, {
        origem,
        campanha: null,
        visitas: quantidade,
        reservas: 0,
        pagas: 0,
        receita: 0,
      });
    }

    for (const festa of festas) {
      const origem = festa.utmSource ?? "sem origem";
      const linha = porOrigem.get(origem) ?? {
        origem,
        campanha: festa.utmCampaign,
        visitas: 0,
        reservas: 0,
        pagas: 0,
        receita: 0,
      };
      linha.campanha = linha.campanha ?? festa.utmCampaign;

      const reservada = comReserva.includes(festa);
      if (reservada) linha.reservas += 1;
      if (pagas.includes(festa)) {
        linha.pagas += 1;
        linha.receita += Number(festa.order!.total);
      }
      porOrigem.set(origem, linha);
    }

    return {
      windowDays: SUMMARY_WINDOW_DAYS,
      totalEvents: porTipo.reduce((soma, linha) => soma + linha._count._all, 0),
      byType: Object.fromEntries(contagem),
      funnel,

      placar: {
        visitas,
        reservas: comReserva.length,
        pagas: pagas.length,
        // As duas conversões que a Sprint pediu, já calculadas.
        conversaoVisitaReserva: taxa(comReserva.length, visitas),
        conversaoReservaPagamento: taxa(pagas.length, comReserva.length),
        ticketMedio: ticketMedio(pagas.map((f) => Number(f.order!.total))),
        receita: pagas.reduce((soma, f) => soma + Number(f.order!.total), 0),
      },

      origens: [...porOrigem.values()].sort((a, b) => b.visitas - a.visitas || b.reservas - a.reservas),
    };
  }

  /**
   * Visitas agrupadas por origem.
   *
   * A origem mora no JSON de metadados do evento, então o agrupamento é
   * feito aqui e não no banco: são poucos milhares de linhas por mês nesta
   * fase, e uma consulta em JSON custaria mais para manter do que rende.
   */
  private async visitasPorOrigem(desde: Date): Promise<Map<string, number>> {
    const visitas = await prisma.analyticsEvent.findMany({
      where: { type: "VISITA_LOJA", createdAt: { gte: desde } },
      select: { metadata: true },
    });

    const contagem = new Map<string, number>();
    for (const visita of visitas) {
      const meta = visita.metadata as { utmSource?: string } | null;
      const origem = meta?.utmSource ?? "sem origem";
      contagem.set(origem, (contagem.get(origem) ?? 0) + 1);
    }
    return contagem;
  }
}
