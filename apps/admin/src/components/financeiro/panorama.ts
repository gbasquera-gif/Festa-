/** O que o endpoint /financeiro/panorama devolve. */
export type Panorama = {
  mes: string;
  ano: number;
  operacional: { faturamento: number; despesas: number; resultado: number; margem: number | null };
  ytd: {
    ano: number; ateMes: string; faturamento: number; despesas: number;
    resultado: number; margem: number | null; acervo: number; mesesComDados: number;
  };
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
    mes: string; numero: number; faturamento: number; despesas: number; resultado: number;
    margem: number | null; acumuladoFaturamento: number; acumuladoResultado: number;
    temDados: boolean; futuro: boolean;
  }[];
};

export type Variacao = {
  atual: number; anterior: number; absoluta: number;
  percentual: number | null; temBase: boolean;
};
