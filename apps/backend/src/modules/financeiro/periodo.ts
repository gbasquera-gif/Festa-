import type { NaturezaDoGasto } from "@festae/shared";

/**
 * O intervalo de um mês, em UTC.
 *
 * Função pura e separada do serviço para poder ser testada sem banco — a
 * borda do mês é onde erro de fuso se esconde, e um teste que precisa de
 * Postgres para rodar acaba não rodando.
 */
export function intervaloDoMes(mes: string): { de: Date; ate: Date } {
  const [ano, numero] = mes.split("-").map(Number);
  return {
    de: new Date(Date.UTC(ano, numero - 1, 1)),
    ate: new Date(Date.UTC(numero === 12 ? ano + 1 : ano, numero === 12 ? 0 : numero, 1)),
  };
}

export type FiltroDeGastos = {
  mes?: string;
  natureza?: NaturezaDoGasto | NaturezaDoGasto[];
};

/**
 * Monta o `where` da consulta de gastos.
 *
 * Duas decisões que valem explicação:
 *
 * O mês alcança tanto o que foi pago quanto o que vence sem ter sido pago.
 * Uma conta a pagar de outubro precisa aparecer em outubro mesmo sem
 * `pagoEm`, senão ela só existiria no dia em que fosse quitada — e a tela de
 * contas a pagar ficaria sempre vazia.
 *
 * `natureza` aceita lista porque Despesas é exatamente "consumo mais
 * custeio", e Aportes é "acervo". São a mesma tabela vista por dois
 * filtros — não duas entidades. Foi separá-las que quebrou o financeiro
 * antigo.
 */
export function filtroDeGastos(filtro: FiltroDeGastos): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filtro.natureza) {
    where.natureza = Array.isArray(filtro.natureza) ? { in: filtro.natureza } : filtro.natureza;
  }

  if (filtro.mes) {
    const { de, ate } = intervaloDoMes(filtro.mes);
    where.OR = [
      { pagoEm: { gte: de, lt: ate } },
      { pagoEm: null, venceEm: { gte: de, lt: ate } },
    ];
  }

  return where;
}
