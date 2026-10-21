import type { FluxoDeCaixa, TotalPorCategoria } from "@festae/shared";

/** O que o endpoint /financeiro/panorama devolve. */
export type Panorama = {
  mes: string;
  ano: number;
  /** `retencao`: receita de retenção por cancelamento — no resultado, fora do faturamento. */
  operacional: { faturamento: number; retencao: number; despesas: number; resultado: number; margem: number | null };
  /**
   * Caixa do mês: pagamentos confirmados que entraram menos reembolsos que
   * saíram. Reembolso a realizar não saiu: vem à parte, como pendência.
   */
  caixa: { entradas: number; reembolsos: number; liquido: number; reembolsosARealizar?: number };
  /** Soma dos saldos de crédito Festaê das clientes. Não é caixa nem receita. */
  creditoEmAberto: number;
  ytd: {
    ano: number; ateMes: string; faturamento: number; retencao: number; despesas: number;
    resultado: number; margem: number | null; acervo: number; mesesComDados: number;
  };
  /** Retiradas dos sócios: do mês e do ano até o mês. Fora do Resultado Operacional. */
  retiradas: { mes: TotalPorCategoria; ano: TotalPorCategoria };
  /** Entradas menos reembolsos, despesas, acervo e retiradas, pela data do dinheiro. */
  fluxoDeCaixa: { mes: FluxoDeCaixa; ano: FluxoDeCaixa };
  aReceber: number;
  recebidoSemData: number;
  acervoAcumulado: number;
  ticketMedio: number | null;
  festasNoMes: number;
  meta: {
    valor: number; realizado: number; percentual: number | null; gap: number;
    atrasoNoRitmo: number; porDia: number | null; percentualDoMes: number;
  } | null;
  comparacao: {
    mesAnterior: string;
    temBase: boolean;
    faturamento: Variacao;
    resultado: Variacao;
  };
  serie: {
    mes: string; numero: number; faturamento: number; retencao: number; despesas: number; resultado: number;
    margem: number | null; acumuladoFaturamento: number; acumuladoResultado: number;
    temDados: boolean; futuro: boolean;
  }[];
};

export type Variacao = {
  atual: number; anterior: number; absoluta: number;
  percentual: number | null; temBase: boolean;
};
