/**
 * Apuração financeira da Festaê.
 *
 * Existe porque o painel antigo respondia à pergunta errada com confiança:
 * somava faturamento pela data em que o contrato foi assinado e despesa pela
 * data em que a conta foi paga, e chamava a diferença de "lucro líquido". São
 * dois regimes diferentes subtraídos um do outro — um número que não descreve
 * nem o caixa nem a competência. Em setembro/2026 ele exibia lucro quase três
 * vezes maior que o real.
 *
 * Aqui não existe indicador de regime misto. Cada resultado é apurado inteiro
 * num regime só, e diz qual:
 *
 *   COMPETÊNCIA  a festa de outubro pertence a outubro, mesmo que o contrato
 *                tenha sido assinado em setembro e pago em novembro. É o
 *                regime que responde "este mês deu lucro?".
 *
 *   CAIXA        só o dinheiro que efetivamente entrou e saiu, na data em que
 *                entrou e saiu. É o regime que responde "tenho dinheiro?".
 *
 * Os dois lado a lado, porque as duas perguntas são legítimas e as respostas
 * divergem — um mês pode ser lucrativo e apertado ao mesmo tempo.
 *
 * Ver docs/SPRINT-0-PAINEL-FINANCEIRO.md §4.1 para o diagnóstico completo.
 */

import { diaEmChapeco } from "./data-da-festa";
import { fromCentsInt, toCentsInt } from "./pricing";

/** Em que sentido um resultado foi apurado. */
export const REGIMES = ["COMPETENCIA", "CAIXA"] as const;
export type Regime = (typeof REGIMES)[number];

export const REGIME_LABEL: Record<Regime, string> = {
  COMPETENCIA: "competência",
  CAIXA: "caixa",
};

/** O que o dinheiro que saiu virou. Espelha o enum do banco. */
export const NATUREZAS_DO_GASTO = ["ACERVO", "CONSUMO", "CUSTEIO"] as const;
export type NaturezaDoGasto = (typeof NATUREZAS_DO_GASTO)[number];

export const NATUREZA_LABEL: Record<NaturezaDoGasto, string> = {
  ACERVO: "Acervo",
  CONSUMO: "Consumo",
  CUSTEIO: "Custeio",
};

/**
 * As naturezas que são despesa do mês.
 *
 * Acervo fica de fora porque não é despesa: é capital que continua existindo
 * depois da festa e pode ser alugado de novo. Contar a compra de um painel
 * como despesa do mês faria todo mês de investimento parecer prejuízo.
 */
export const NATUREZAS_DE_DESPESA: readonly NaturezaDoGasto[] = ["CONSUMO", "CUSTEIO"];

/** Um recebimento já confirmado. */
export type RecebimentoApurado = {
  valor: number;
  /**
   * Quando o dinheiro entrou. Nulo para o que veio do painel antigo, que
   * guardava o valor do sinal e nunca a data — informação que não existe
   * mais e que nenhuma conta recupera.
   */
  recebidoEm: Date | null;
};

/** Um contrato, do ponto de vista do dinheiro. */
export type ContratoApurado = {
  fechadoEm: Date;
  festaEm: Date;
  valor: number;
  recebimentos: readonly RecebimentoApurado[];
  cancelado?: boolean;
};

/** Um lançamento de saída. */
export type GastoApurado = {
  valor: number;
  natureza: NaturezaDoGasto;
  pagoEm: Date | null;
};

/** O mês de uma data, no fuso de Chapecó, como "2026-09". */
export function mesEmChapeco(instante: Date): string {
  return diaEmChapeco(instante).slice(0, 7);
}

function somar(valores: readonly number[]): number {
  return fromCentsInt(valores.reduce((total, valor) => total + toCentsInt(valor), 0));
}

function vigentes(contratos: readonly ContratoApurado[]): ContratoApurado[] {
  return contratos.filter((contrato) => !contrato.cancelado);
}

/** Tudo que já foi recebido de um contrato. */
export function recebidoDoContrato(contrato: ContratoApurado): number {
  return somar(contrato.recebimentos.map((r) => r.valor));
}

/** O que falta receber de um contrato. Nunca negativo. */
export function saldoDoContrato(contrato: ContratoApurado): number {
  const falta = toCentsInt(contrato.valor) - toCentsInt(recebidoDoContrato(contrato));
  return fromCentsInt(Math.max(0, falta));
}

/**
 * Resultado de um mês, apurado inteiro num regime só.
 *
 * `margem` é nula quando não houve receita: dividir por zero devolveria
 * Infinity, e uma tela que exibe "∞%" de margem é pior que uma que exibe "—".
 */
export type ResultadoDoMes = {
  regime: Regime;
  receita: number;
  despesa: number;
  resultado: number;
  margem: number | null;
};

function montarResultado(regime: Regime, receita: number, despesa: number): ResultadoDoMes {
  const resultado = fromCentsInt(toCentsInt(receita) - toCentsInt(despesa));
  return {
    regime,
    receita,
    despesa,
    resultado,
    margem: receita > 0 ? resultado / receita : null,
  };
}

/**
 * Receita por competência: a festa pertence ao mês em que acontece.
 *
 * É o regime certo para "este mês deu lucro?". A festa de outubro entra em
 * outubro mesmo que o contrato tenha sido assinado em setembro — foi em
 * outubro que o acervo saiu, a equipe montou e o serviço existiu.
 */
export function receitaPorCompetencia(contratos: readonly ContratoApurado[], mes: string): number {
  return somar(
    vigentes(contratos)
      .filter((contrato) => mesEmChapeco(contrato.festaEm) === mes)
      .map((contrato) => contrato.valor),
  );
}

/** Receita por caixa: só o que entrou, no mês em que entrou. */
export function receitaPorCaixa(contratos: readonly ContratoApurado[], mes: string): number {
  return somar(
    vigentes(contratos).flatMap((contrato) =>
      contrato.recebimentos
        .filter((r) => r.recebidoEm !== null && mesEmChapeco(r.recebidoEm) === mes)
        .map((r) => r.valor),
    ),
  );
}

/**
 * Dinheiro que entrou sem data conhecida.
 *
 * Tudo que veio do painel antigo cai aqui: ele guardava quanto, nunca quando.
 * A visão de caixa precisa exibir este número separado em vez de somá-lo a um
 * mês arbitrário — atribuir uma data inventada faria o caixa de um mês
 * qualquer parecer melhor do que foi.
 */
export function recebidoSemData(contratos: readonly ContratoApurado[]): number {
  return somar(
    vigentes(contratos).flatMap((contrato) =>
      contrato.recebimentos.filter((r) => r.recebidoEm === null).map((r) => r.valor),
    ),
  );
}

/** Despesa do mês: consumo e custeio, pela data em que o dinheiro saiu. */
export function despesaDoMes(gastos: readonly GastoApurado[], mes: string): number {
  return somar(
    gastos
      .filter(
        (gasto) =>
          NATUREZAS_DE_DESPESA.includes(gasto.natureza) &&
          gasto.pagoEm !== null &&
          mesEmChapeco(gasto.pagoEm) === mes,
      )
      .map((gasto) => gasto.valor),
  );
}

/** O que virou acervo no mês. Não é despesa — é capital. */
export function acervoDoMes(gastos: readonly GastoApurado[], mes: string): number {
  return somar(
    gastos
      .filter(
        (gasto) =>
          gasto.natureza === "ACERVO" && gasto.pagoEm !== null && mesEmChapeco(gasto.pagoEm) === mes,
      )
      .map((gasto) => gasto.valor),
  );
}

/** Todo o acervo acumulado, de qualquer mês. */
export function acervoAcumulado(gastos: readonly GastoApurado[]): number {
  return somar(gastos.filter((gasto) => gasto.natureza === "ACERVO").map((gasto) => gasto.valor));
}

/** Tudo que já saiu, de qualquer natureza. */
export function gastoAcumulado(gastos: readonly GastoApurado[]): number {
  return somar(gastos.map((gasto) => gasto.valor));
}

/** Quanto ainda falta receber, somando todos os contratos vigentes. */
export function totalAReceber(contratos: readonly ContratoApurado[]): number {
  return somar(vigentes(contratos).map(saldoDoContrato));
}

/** Quanto já entrou, somando todos os contratos vigentes. */
export function totalRecebido(contratos: readonly ContratoApurado[]): number {
  return somar(vigentes(contratos).map(recebidoDoContrato));
}

/**
 * Quanto falta por dia para bater a meta, e se está atrás ou à frente.
 *
 * `atrasoNoRitmo` negativo é atraso. O ritmo esperado é linear no mês, que é
 * uma simplificação — festa se concentra em fim de semana — mas serve ao que
 * a linha existe para fazer: avisar cedo, não prever.
 */
export type LinhaDeRitmo = {
  meta: number;
  realizado: number;
  falta: number;
  atrasoNoRitmo: number;
  porDia: number | null;
  percentualAtingido: number | null;
  percentualDoMes: number;
};

export function linhaDeRitmo(
  realizado: number,
  meta: number,
  diaDoMes: number,
  diasNoMes: number,
): LinhaDeRitmo {
  const percentualDoMes = diaDoMes / diasNoMes;
  const falta = fromCentsInt(Math.max(0, toCentsInt(meta) - toCentsInt(realizado)));
  const diasRestantes = Math.max(0, diasNoMes - diaDoMes);
  return {
    meta,
    realizado,
    falta,
    atrasoNoRitmo: fromCentsInt(toCentsInt(realizado) - Math.round(toCentsInt(meta) * percentualDoMes)),
    porDia: diasRestantes > 0 ? fromCentsInt(Math.round(toCentsInt(falta) / diasRestantes)) : null,
    percentualAtingido: meta > 0 ? realizado / meta : null,
    percentualDoMes,
  };
}

/** Tudo que a tela de saúde financeira precisa de um mês. */
export type IndicadoresDoMes = {
  mes: string;
  competencia: ResultadoDoMes;
  caixa: ResultadoDoMes;
  contratosFechados: number;
  festasNoMes: number;
  ticketMedio: number | null;
  acervoNoMes: number;
  acervoAcumulado: number;
  aReceber: number;
  recebidoSemData: number;
};

export function indicadoresDoMes(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  mes: string,
): IndicadoresDoMes {
  const doMes = vigentes(contratos).filter((c) => mesEmChapeco(c.festaEm) === mes);
  const receitaCompetencia = receitaPorCompetencia(contratos, mes);
  const despesa = despesaDoMes(gastos, mes);

  return {
    mes,
    competencia: montarResultado("COMPETENCIA", receitaCompetencia, despesa),
    caixa: montarResultado("CAIXA", receitaPorCaixa(contratos, mes), despesa),
    contratosFechados: vigentes(contratos).filter((c) => mesEmChapeco(c.fechadoEm) === mes).length,
    festasNoMes: doMes.length,
    ticketMedio: doMes.length > 0 ? fromCentsInt(Math.round(toCentsInt(receitaCompetencia) / doMes.length)) : null,
    acervoNoMes: acervoDoMes(gastos, mes),
    acervoAcumulado: acervoAcumulado(gastos),
    aReceber: totalAReceber(contratos),
    recebidoSemData: recebidoSemData(contratos),
  };
}

/* ------------------------------------------------------------------ *
 * Situação de pagamento de um contrato
 * ------------------------------------------------------------------ */

/**
 * Em que pé está o dinheiro de um contrato.
 *
 * É uma regra só, num lugar só, de propósito. No painel antigo cada aba
 * decidia por conta própria o que era "em aberto": uma olhava o campo de
 * sinal, outra comparava status com texto, e a terceira não olhava data
 * nenhuma. O mesmo contrato aparecia quitado numa tela e pendente na outra,
 * e não havia como saber qual estava certa — porque nenhuma delas era a
 * regra, todas eram cópias dela.
 */
export const SITUACOES_DE_PAGAMENTO = [
  "QUITADO",
  "VENCIDO",
  "PARCIAL",
  "AGUARDANDO",
  "CANCELADO",
] as const;
export type SituacaoDePagamento = (typeof SITUACOES_DE_PAGAMENTO)[number];

export const SITUACAO_DE_PAGAMENTO_LABEL: Record<SituacaoDePagamento, string> = {
  QUITADO: "Quitado",
  VENCIDO: "Vencido",
  PARCIAL: "Sinal recebido",
  AGUARDANDO: "Aguardando",
  CANCELADO: "Cancelado",
};

/** Frase curta que explica a situação, para a tela não ter de inventar uma. */
export const SITUACAO_DE_PAGAMENTO_NOTA: Record<SituacaoDePagamento, string> = {
  QUITADO: "nada a receber",
  VENCIDO: "a festa já passou e o saldo continua aberto",
  PARCIAL: "parte recebida, saldo vence no dia da festa",
  AGUARDANDO: "nada recebido ainda",
  CANCELADO: "fora da apuração",
};

/**
 * Quando o saldo de um contrato vence.
 *
 * É o dia da festa, e isso não é uma convenção escolhida aqui: é a regra
 * comercial que a Festaê já pratica — o saldo é pago na retirada ou na
 * entrega, que acontecem no dia. Por isso não existe campo de vencimento no
 * banco, e criar um seria pedir para a operação digitar uma data que o
 * sistema já sabe.
 */
export function vencimentoDoSaldo(contrato: ContratoApurado): Date {
  return contrato.festaEm;
}

/**
 * A situação de pagamento de um contrato num dado instante.
 *
 * O `agora` entra por parâmetro em vez de a função ler o relógio: uma regra
 * que depende de `new Date()` por dentro não tem como ser testada na véspera,
 * no dia e no dia seguinte da mesma festa — que são exatamente as três bordas
 * onde ela decide algo.
 *
 * A comparação é por dia do calendário em Chapecó, nunca por instante. A
 * festa é um dia, não um horário: comparar timestamps faria a festa de hoje
 * virar "vencida" às 9h da manhã, quando o saldo ainda vai ser pago na
 * entrega da tarde.
 */
export function situacaoDePagamento(contrato: ContratoApurado, agora: Date): SituacaoDePagamento {
  if (contrato.cancelado) return "CANCELADO";

  const saldo = saldoDoContrato(contrato);
  if (saldo <= 0) return "QUITADO";

  // Vencido é o dia seguinte ao da festa, não o dia dela. No dia da festa o
  // saldo ainda está no prazo — é nele que a cliente paga.
  const festaJaPassou = diaEmChapeco(contrato.festaEm) < diaEmChapeco(agora);
  if (festaJaPassou) return "VENCIDO";

  return recebidoDoContrato(contrato) > 0 ? "PARCIAL" : "AGUARDANDO";
}

/** As situações que significam dinheiro a cobrar. */
export const SITUACOES_EM_ABERTO: readonly SituacaoDePagamento[] = [
  "VENCIDO",
  "PARCIAL",
  "AGUARDANDO",
];

/** O retrato da carteira: quanto foi vendido, quanto entrou, quanto falta. */
export type ResumoDaCarteira = {
  contratos: number;
  contratado: number;
  recebido: number;
  saldoEmAberto: number;
  vencido: number;
  contratosVencidos: number;
  ticketMedio: number | null;
  recebidoSemData: number;
};

/**
 * Soma a carteira inteira.
 *
 * Recebe só contratos vigentes — cancelado não entra em total nenhum, e
 * filtrar aqui dentro esconderia do chamador quantas linhas ele passou que
 * não contaram. Quem chama decide o que é vigente; esta função só soma.
 */
export function resumoDaCarteira(
  contratos: readonly ContratoApurado[],
  agora: Date,
): ResumoDaCarteira {
  const vivos = vigentes(contratos);
  const contratado = somar(vivos.map((c) => c.valor));
  const vencidos = vivos.filter((c) => situacaoDePagamento(c, agora) === "VENCIDO");

  return {
    contratos: vivos.length,
    contratado,
    recebido: totalRecebido(vivos),
    saldoEmAberto: totalAReceber(vivos),
    vencido: somar(vencidos.map(saldoDoContrato)),
    contratosVencidos: vencidos.length,
    ticketMedio:
      vivos.length > 0 ? fromCentsInt(Math.round(toCentsInt(contratado) / vivos.length)) : null,
    recebidoSemData: recebidoSemData(vivos),
  };
}
