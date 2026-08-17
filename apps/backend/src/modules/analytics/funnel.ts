import { ANALYTICS_FUNNEL_ORDER, type AnalyticsEventType } from "@festae/shared";

/**
 * Cálculo do placar da loja, separado do serviço para poder ser testado.
 *
 * As contas aqui são simples de propósito. O objetivo desta fase é responder
 * "entrou gente? montou? reservou? pagou?" com números que a Festaê consiga
 * conferir na mão — não construir um produto de análise.
 */

export interface DegrauDoFunil {
  type: AnalyticsEventType;
  count: number;
  /** Queda em relação ao degrau anterior, em %. Nulo no primeiro. */
  dropoffRate: number | null;
}

/** Divisão que devolve nulo quando não há base — 0/0 não é 0%. */
export function taxa(parte: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((parte / total) * 1000) / 10;
}

export function montarFunil(contagem: Map<string, number>): DegrauDoFunil[] {
  const degraus = ANALYTICS_FUNNEL_ORDER.map((type) => ({
    type,
    count: contagem.get(type) ?? 0,
  }));

  return degraus.map((degrau, i) => {
    const anterior = i === 0 ? null : degraus[i - 1].count;
    // Queda negativa é possível e não é erro: dá para chegar num kit sem
    // passar por tema, e a mesma pessoa abre vários. O painel avisa que a
    // contagem é de eventos, não de pessoas.
    const dropoffRate = anterior && anterior > 0 ? taxa(anterior - degrau.count, anterior) : null;
    return { ...degrau, dropoffRate };
  });
}

/** Uma linha da tabela de origem: quanto o Instagram trouxe e quanto virou dinheiro. */
export interface LinhaDeOrigem {
  origem: string;
  campanha: string | null;
  visitas: number;
  reservas: number;
  pagas: number;
  receita: number;
}

/**
 * Ticket médio das festas que **pagaram**, não das que foram criadas.
 *
 * Orçamento montado e abandonado não é venda, e incluí-lo faria o ticket
 * parecer maior do que a Festaê recebe.
 */
export function ticketMedio(totaisPagos: number[]): number | null {
  if (totaisPagos.length === 0) return null;
  const soma = totaisPagos.reduce((acc, valor) => acc + valor, 0);
  return Math.round((soma / totaisPagos.length) * 100) / 100;
}
