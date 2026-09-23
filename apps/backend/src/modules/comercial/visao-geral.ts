import {
  DIAS_DA_SEMANA,
  EVENT_TYPE_META,
  MODELOS_DE_ATENDIMENTO,
  MODELO_DE_ATENDIMENTO_LABEL,
  DIA_DA_SEMANA_LABEL,
  ajustesComerciais,
  canalDaVenda,
  diaDaSemanaDaFesta,
  distribuir,
  funilDePropostas,
  isEventType,
  janelaFutura,
  mesDaFesta,
  modeloDeAtendimento,
  receitaPorCompetencia,
  rotuloDoCanal,
  toCentsInt,
  totalAReceber,
  totalRecebido,
  ultimosDozeMeses,
  diaEmChapeco,
  fromCentsInt,
  type AjustesComerciais,
  type FatiaDaDistribuicao,
  type FunilDePropostas,
  type PeriodoComercial,
  type PropostaDoFunil,
} from "@festae/shared";
import type { LinhaDaCarteira } from "../financeiro/contratos";
import { paraLinha, type Detalhamento } from "../financeiro/detalhamento";

/**
 * A Visão Geral Comercial, como função pura.
 *
 * Recebe a carteira já montada — a mesma que o Financeiro lê, pela mesma
 * consulta — e as propostas, e devolve tudo que a tela mostra. Sem banco por
 * perto, para as fórmulas terem teste que roda sempre.
 *
 * Dinheiro sai das funções do Financeiro (`receitaPorCompetencia`,
 * `totalRecebido`, `totalAReceber`): contratado aqui e faturamento lá são o
 * mesmo número pela mesma conta, e não dois cálculos que coincidem.
 */

export type PropostaComDados = PropostaDoFunil & {
  numero: number;
  cliente: string;
};

export type Fatia = FatiaDaDistribuicao & { rotulo: string };

export type VisaoGeralComercial = {
  periodo: PeriodoComercial;
  /** O dia de Chapecó que serviu de "hoje" para realizadas, futuras e carteira. */
  hoje: string;
  contratado: { valor: number; festas: number; confere: boolean };
  ticketMedio: { valor: number | null; contratos: number };
  festas: { total: number; realizadas: number; futuras: number };
  funil: Omit<FunilDePropostas, "idsDaCoorte">;
  carteiraFutura: {
    de: string;
    ate: string;
    dias: number;
    contratado: number;
    festas: number;
    recebido: number;
    aReceber: number;
  };
  tiposDeFesta: Fatia[];
  atendimento: Fatia[];
  diasDaSemana: Fatia[];
  canais: Fatia[];
  sazonalidade: { mes: string; festas: number; contratado: number }[];
  ajustes: AjustesComerciais;
};

const DIAS_DA_CARTEIRA = 30;

function somaCentavos(valores: readonly number[]): number {
  return fromCentsInt(valores.reduce((soma, v) => soma + toCentsInt(v), 0));
}

/** As festas do período: vigentes, com a data da festa num dos meses. */
export function contratosDoPeriodo(linhas: readonly LinhaDaCarteira[], meses: readonly string[]) {
  return linhas
    .filter((l) => l.comercial.vigente && meses.includes(mesDaFesta(l.comercial.festaEm)))
    .sort((a, b) => a.comercial.festaEm.localeCompare(b.comercial.festaEm));
}

/** A carteira futura: vigentes com a festa de hoje até a janela, independente do filtro. */
export function contratosDaCarteiraFutura(linhas: readonly LinhaDaCarteira[], agora: Date) {
  const { de, ate } = janelaFutura(agora, DIAS_DA_CARTEIRA);
  return {
    de,
    ate,
    linhas: linhas
      .filter((l) => l.comercial.vigente && l.comercial.festaEm >= de && l.comercial.festaEm < ate)
      .sort((a, b) => a.comercial.festaEm.localeCompare(b.comercial.festaEm)),
  };
}

function rotuloDoTipo(tipo: string): string {
  if (tipo === "NAO_INFORMADO") return "Não informado";
  return isEventType(tipo) ? EVENT_TYPE_META[tipo].label : tipo;
}

export function montarVisaoGeral(
  linhas: readonly LinhaDaCarteira[],
  propostas: readonly PropostaComDados[],
  periodo: PeriodoComercial,
  agora: Date,
): VisaoGeralComercial {
  const hoje = diaEmChapeco(agora);
  const vigentes = linhas.filter((l) => l.comercial.vigente);
  const doPeriodo = contratosDoPeriodo(linhas, periodo.meses);

  // Contratado: a MESMA função do Financeiro, mês a mês do período. A soma
  // das linhas tem de dar o mesmo número — se não der, a tela diz.
  const contratado = somaCentavos(
    periodo.meses.map((m) => receitaPorCompetencia(vigentes.map((l) => l.apurado), m)),
  );
  const somaDasLinhas = somaCentavos(doPeriodo.map((l) => l.comercial.valor));
  const festas = doPeriodo.length;

  // Ticket em centavos: 3 festas de R$ 100,00 dão R$ 33,33, e não uma dízima.
  const ticket = festas > 0 ? fromCentsInt(Math.round(toCentsInt(contratado) / festas)) : null;

  // "Realizada" é festa com data já passada. O sistema não registra a
  // conclusão sozinho — COMPLETED é um status que alguém marca à mão, e
  // quase nunca marca —, então a data é o dado confiável que existe.
  const realizadas = doPeriodo.filter((l) => l.comercial.festaEm < hoje).length;

  const funilCompleto = funilDePropostas(propostas, periodo.meses, agora);
  const { idsDaCoorte, ...funil } = funilCompleto;
  const coorte = propostas.filter((p) => idsDaCoorte.includes(p.id));

  const carteira = contratosDaCarteiraFutura(linhas, agora);
  const apuradosDaCarteira = carteira.linhas.map((l) => l.apurado);

  const valor = (l: LinhaDaCarteira) => l.comercial.valor;
  const comRotulo = (fatias: FatiaDaDistribuicao[], rotulo: (k: string) => string): Fatia[] =>
    fatias.map((f) => ({ ...f, rotulo: rotulo(f.chave) }));

  const atendimento = comRotulo(
    distribuir(
      doPeriodo,
      (l) => modeloDeAtendimento(l.comercial.entrega ? "DELIVERY" : "PICKUP", l.comercial.montagem),
      valor,
      MODELOS_DE_ATENDIMENTO,
    ),
    (k) => MODELO_DE_ATENDIMENTO_LABEL[k as keyof typeof MODELO_DE_ATENDIMENTO_LABEL],
  // Retirada com montagem só aparece se existir: é resíduo do painel antigo,
  // não uma opção que a operação ofereça.
  ).filter((f) => f.chave !== "RETIRADA_MONTAGEM" || f.quantidade > 0);

  return {
    periodo,
    hoje,
    contratado: {
      valor: contratado,
      festas,
      confere: toCentsInt(contratado) === toCentsInt(somaDasLinhas),
    },
    ticketMedio: { valor: ticket, contratos: festas },
    festas: { total: festas, realizadas, futuras: festas - realizadas },
    funil,
    carteiraFutura: {
      de: carteira.de,
      ate: carteira.ate,
      dias: DIAS_DA_CARTEIRA,
      contratado: somaCentavos(carteira.linhas.map(valor)),
      festas: carteira.linhas.length,
      recebido: totalRecebido(apuradosDaCarteira),
      aReceber: totalAReceber(apuradosDaCarteira),
    },
    tiposDeFesta: comRotulo(
      distribuir(doPeriodo, (l) => l.comercial.tipoDeFesta || "NAO_INFORMADO", valor),
      rotuloDoTipo,
    ),
    atendimento,
    diasDaSemana: comRotulo(
      distribuir(doPeriodo, (l) => diaDaSemanaDaFesta(l.comercial.festaEm), valor, DIAS_DA_SEMANA),
      (k) => DIA_DA_SEMANA_LABEL[k as keyof typeof DIA_DA_SEMANA_LABEL],
    ),
    canais: comRotulo(
      distribuir(
        doPeriodo,
        (l) => canalDaVenda({ migrado: l.comercial.migrado, canal: l.comercial.canal }),
        valor,
      ),
      rotuloDoCanal,
    ),
    sazonalidade: ultimosDozeMeses(agora).map((mes) => ({
      mes,
      festas: vigentes.filter((l) => mesDaFesta(l.comercial.festaEm) === mes).length,
      contratado: receitaPorCompetencia(vigentes.map((l) => l.apurado), mes),
    })),
    ajustes: ajustesComerciais(coorte),
  };
}

// ---------------------------------------------------------------- detalhe

export const DETALHES_COMERCIAIS = ["CONTRATADO", "FESTAS", "CARTEIRA"] as const;
export type DetalheComercial = (typeof DETALHES_COMERCIAIS)[number];

export function ehDetalheComercial(valor: string): valor is DetalheComercial {
  return (DETALHES_COMERCIAIS as readonly string[]).includes(valor);
}

/**
 * De que contratos um KPI é feito.
 *
 * Sai do MESMO filtro que gerou o número (`contratosDoPeriodo`,
 * `contratosDaCarteiraFutura`), e `confere` compara o total das linhas com
 * o valor que a Visão Geral mostrou. No formato do detalhamento do
 * Financeiro, para a tela reaproveitar o mesmo painel.
 */
export function detalharComercial(
  linhas: readonly LinhaDaCarteira[],
  tipo: DetalheComercial,
  periodo: PeriodoComercial,
  agora: Date,
): Detalhamento {
  const visao = montarVisaoGeral(linhas, [], periodo, agora);

  if (tipo === "CARTEIRA") {
    const { linhas: daCarteira } = contratosDaCarteiraFutura(linhas, agora);
    const totais = totaisDe(daCarteira);
    return {
      tipo: "A_RECEBER",
      escopo: null,
      periodo: null,
      linhas: daCarteira.map(paraLinha),
      totais,
      confere:
        totais.festas === visao.carteiraFutura.festas &&
        toCentsInt(totais.contratado) === toCentsInt(visao.carteiraFutura.contratado) &&
        toCentsInt(totais.recebido) === toCentsInt(visao.carteiraFutura.recebido) &&
        toCentsInt(totais.saldo) === toCentsInt(visao.carteiraFutura.aReceber),
    };
  }

  const doPeriodo = contratosDoPeriodo(linhas, periodo.meses);
  const totais = totaisDe(doPeriodo);
  const escopo = periodo.meses.length === 1 ? "MES" : "ANO";
  return {
    tipo: tipo === "FESTAS" ? "FESTAS" : "FATURAMENTO",
    escopo,
    periodo: periodo.rotulo,
    linhas: doPeriodo.map(paraLinha),
    totais,
    confere:
      tipo === "FESTAS"
        ? totais.festas === visao.festas.total
        : toCentsInt(totais.contratado) === toCentsInt(visao.contratado.valor),
  };
}

function totaisDe(linhas: readonly LinhaDaCarteira[]) {
  return {
    contratado: somaCentavos(linhas.map((l) => l.comercial.valor)),
    recebido: somaCentavos(linhas.map((l) => l.comercial.recebido)),
    saldo: somaCentavos(linhas.map((l) => l.comercial.saldo)),
    festas: linhas.length,
  };
}

/** As propostas da coorte do funil, para o detalhe do KPI de Propostas. */
export function detalharPropostas(
  propostas: readonly PropostaComDados[],
  periodo: PeriodoComercial,
  agora: Date,
) {
  const funil = funilDePropostas(propostas, periodo.meses, agora);
  const coorte = propostas
    .filter((p) => funil.idsDaCoorte.includes(p.id))
    .sort((a, b) => (a.primeiroEnvioEm?.getTime() ?? 0) - (b.primeiroEnvioEm?.getTime() ?? 0));
  return {
    periodo: periodo.rotulo,
    propostas: coorte.map((p) => ({
      id: p.id,
      numero: p.numero,
      cliente: p.cliente,
      primeiroEnvioEm: p.primeiroEnvioEm?.toISOString() ?? null,
      situacao: p.status === "APROVADO" && p.reservationId ? "CONVERTIDA" : situacaoDaProposta(p, agora),
      total: p.total,
    })),
    confere: coorte.length === funil.enviadas,
  };
}

function situacaoDaProposta(p: PropostaComDados, agora: Date): string {
  if (p.status === "ENVIADO" && p.validoAte.getTime() < agora.getTime()) return "EXPIRADO";
  return p.status;
}
