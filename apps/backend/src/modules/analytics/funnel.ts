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

/**
 * Fuso de Chapecó, fixo. O Brasil não tem mais horário de verão desde 2019.
 *
 * Importa porque o mês do painel precisa ser o mês de quem lê. Em UTC, uma
 * visita das 22h do dia 31 cairia no mês seguinte, e a soma das colunas não
 * bateria com o que a Maria Luiza viu acontecer.
 */
const FUSO_BRASIL = "-03:00";

export interface Periodo {
  inicio: Date;
  fim: Date;
  /** Como o painel descreve a janela para quem está lendo. */
  rotulo: string;
}

/** Janela móvel dos últimos N dias, terminando agora. */
export function ultimosDias(dias: number, agora = new Date()): Periodo {
  const inicio = new Date(agora);
  inicio.setDate(inicio.getDate() - dias);
  return { inicio, fim: agora, rotulo: `Últimos ${dias} dias` };
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Um mês do calendário, de 1º às 00h até o primeiro instante do mês seguinte.
 *
 * Recebe "2026-08". Devolve nulo para qualquer outra coisa — o painel manda
 * o valor por query string, e um mês inválido virando "desde 1970" mostraria
 * um número errado com cara de certo, que é pior que um erro.
 */
export function intervaloDoMes(mes: string): Periodo | null {
  const casa = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!casa) return null;

  const ano = Number(casa[1]);
  const numero = Number(casa[2]);
  if (numero < 1 || numero > 12) return null;

  const inicio = new Date(`${casa[1]}-${casa[2]}-01T00:00:00${FUSO_BRASIL}`);
  const proximoAno = numero === 12 ? ano + 1 : ano;
  const proximoMes = numero === 12 ? 1 : numero + 1;
  const fim = new Date(
    `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01T00:00:00${FUSO_BRASIL}`,
  );

  return { inicio, fim, rotulo: `${MESES[numero - 1]} de ${ano}` };
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
