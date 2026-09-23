import { mesEmChapeco } from "./financeiro";
import { diaEmChapeco } from "./data-da-festa";
import { situacaoDoOrcamento, type StatusDoOrcamento } from "./orcamento";
import { SALE_CHANNEL_LABELS, type SaleChannel } from "./sale-channels";
import { fromCentsInt, toCentsInt } from "./pricing";

/**
 * As regras da Visão Geral Comercial.
 *
 * Aqui mora o que é comercial e não existe em outro lugar: modelo de
 * atendimento, dia da semana, canal, coorte de propostas, apresentação de
 * taxa. O que é dinheiro — contratado por competência, recebido, saldo —
 * NÃO está aqui: vem de `financeiro.ts`, as mesmas funções que o Financeiro
 * usa. Uma segunda definição de faturamento seria a primeira coisa a
 * divergir.
 */

// ---------------------------------------------------------------- período

/**
 * Um período da Visão Geral: um mês, ou o ano inteiro.
 *
 * É o mesmo recorte do filtro do Financeiro (ano + mês, com "todos os
 * meses"), e a competência também: uma festa pertence ao mês em que
 * acontece, lido no fuso de Chapecó.
 */
export type PeriodoComercial = {
  /** "2026-09", ou "2026" quando é o ano inteiro. */
  rotulo: string;
  meses: string[];
  /** Primeiro dia e dia seguinte ao último, "AAAA-MM-DD", no calendário de Chapecó. */
  de: string;
  ate: string;
};

export function periodoComercial(ano: number, mes: string | null): PeriodoComercial {
  const meses = mes
    ? [mes]
    : Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
  const primeiro = meses[0];
  const ultimo = meses[meses.length - 1];
  return {
    rotulo: mes ?? String(ano),
    meses,
    de: `${primeiro}-01`,
    ate: mesSeguinte(ultimo) + "-01",
  };
}

function mesSeguinte(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  return numero === 12 ? `${ano + 1}-01` : `${ano}-${String(numero + 1).padStart(2, "0")}`;
}

/** O mês, no fuso de Chapecó, de um dia de festa "AAAA-MM-DD". */
export function mesDaFesta(festaEm: string): string {
  return mesEmChapeco(new Date(`${festaEm}T12:00:00.000Z`));
}

/** Os últimos doze meses até o corrente, do mais antigo ao mais novo. */
export function ultimosDozeMeses(agora: Date): string[] {
  const atual = mesEmChapeco(agora);
  const [ano, numero] = atual.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(ano, numero - 1 - (11 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * A janela da carteira futura: de hoje (inclusive) até `dias` à frente.
 *
 * Hoje é o dia de Chapecó, e não o de UTC: às 22h de Chapecó já é amanhã em
 * UTC, e a festa desta noite sumiria da carteira.
 */
export function janelaFutura(agora: Date, dias = 30): { de: string; ate: string } {
  const hoje = diaEmChapeco(agora);
  const fim = new Date(`${hoje}T12:00:00.000Z`);
  fim.setUTCDate(fim.getUTCDate() + dias);
  return { de: hoje, ate: fim.toISOString().slice(0, 10) };
}

// ---------------------------------------------------------------- atendimento

export const MODELOS_DE_ATENDIMENTO = [
  "RETIRADA",
  "ENTREGA",
  "ENTREGA_MONTAGEM",
  "RETIRADA_MONTAGEM",
] as const;
export type ModeloDeAtendimento = (typeof MODELOS_DE_ATENDIMENTO)[number];

export const MODELO_DE_ATENDIMENTO_LABEL: Record<ModeloDeAtendimento, string> = {
  RETIRADA: "Retirada",
  ENTREGA: "Entrega",
  ENTREGA_MONTAGEM: "Entrega + Montagem",
  RETIRADA_MONTAGEM: "Retirada + Montagem",
};

/**
 * Como a cliente contratou: dos dois campos do pedido, nunca das taxas.
 *
 * Retirada com montagem não é combinação que a loja ofereça, mas o painel
 * antigo registrava entrega e montagem como marcações independentes, e há
 * contrato migrado assim. Aparece com o nome dela em vez de ser empurrado
 * para um balde parecido.
 */
export function modeloDeAtendimento(fulfillment: string, montagem: boolean): ModeloDeAtendimento {
  const entrega = fulfillment === "DELIVERY";
  if (entrega) return montagem ? "ENTREGA_MONTAGEM" : "ENTREGA";
  return montagem ? "RETIRADA_MONTAGEM" : "RETIRADA";
}

// ---------------------------------------------------------------- dia da semana

/** Segunda primeiro: é como a operação lê a semana, com o fim de semana junto no final. */
export const DIAS_DA_SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"] as const;
export type DiaDaSemana = (typeof DIAS_DA_SEMANA)[number];

export const DIA_DA_SEMANA_LABEL: Record<DiaDaSemana, string> = {
  SEG: "Seg",
  TER: "Ter",
  QUA: "Qua",
  QUI: "Qui",
  SEX: "Sex",
  SAB: "Sáb",
  DOM: "Dom",
};

/**
 * O dia da semana de uma festa, a partir do dia do calendário.
 *
 * Calculado sobre "AAAA-MM-DD" e não sobre o instante gravado: a data da
 * festa já é o dia de Chapecó, e reconvertê-la por fuso é o caminho clássico
 * para um sábado virar sexta.
 */
export function diaDaSemanaDaFesta(festaEm: string): DiaDaSemana {
  const [ano, mes, dia] = festaEm.split("-").map(Number);
  const domingoZero = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return DIAS_DA_SEMANA[(domingoZero + 6) % 7];
}

// ---------------------------------------------------------------- canal

/** Contrato que veio do painel antigo: o canal de lá não diz por onde a venda entrou. */
export const CANAL_HISTORICO = "HISTORICO_SEM_CANAL";
export const CANAL_NAO_INFORMADO = "NAO_INFORMADO";

/**
 * O canal de uma venda, para contagem.
 *
 * A carga do painel antigo gravou `OUTRO` em todo contrato, porque a origem
 * não dizia o canal. Somar isso com o `OUTRO` de uma venda de hoje — que é
 * um canal de verdade, só não listado — inflaria "Outros" com cada contrato
 * antigo. Então o histórico ganha nome próprio, e fica fora de qualquer
 * leitura de "de onde vêm as vendas".
 */
export function canalDaVenda(venda: { migrado: boolean; canal: string | null }): string {
  if (venda.migrado) return CANAL_HISTORICO;
  return venda.canal ?? CANAL_NAO_INFORMADO;
}

export function rotuloDoCanal(chave: string): string {
  if (chave === CANAL_HISTORICO) return "Histórico sem canal";
  if (chave === CANAL_NAO_INFORMADO) return "Não informado";
  if (chave === "OUTRO") return "Outros";
  return SALE_CHANNEL_LABELS[chave as SaleChannel] ?? chave;
}

// ---------------------------------------------------------------- distribuição

export type FatiaDaDistribuicao = {
  chave: string;
  quantidade: number;
  /** Parte do conjunto, de 0 a 1. É a distribuição do próprio período, não uma estimativa. */
  participacao: number;
  valor: number;
};

/**
 * Conta um conjunto por uma chave, com participação e valor somado.
 *
 * `ordem` fixa a sequência quando ela significa algo (dias da semana); sem
 * ela, maior quantidade primeiro. Chaves da ordem sem nenhuma ocorrência
 * aparecem com zero — um sábado vazio é informação.
 */
export function distribuir<T>(
  itens: readonly T[],
  chave: (item: T) => string,
  valor: (item: T) => number = () => 0,
  ordem?: readonly string[],
): FatiaDaDistribuicao[] {
  const contagem = new Map<string, { quantidade: number; centavos: number }>();
  for (const k of ordem ?? []) contagem.set(k, { quantidade: 0, centavos: 0 });
  for (const item of itens) {
    const k = chave(item);
    const atual = contagem.get(k) ?? { quantidade: 0, centavos: 0 };
    atual.quantidade += 1;
    atual.centavos += toCentsInt(valor(item));
    contagem.set(k, atual);
  }
  const total = itens.length;
  const fatias = [...contagem.entries()].map(([k, v]) => ({
    chave: k,
    quantidade: v.quantidade,
    participacao: total > 0 ? v.quantidade / total : 0,
    valor: fromCentsInt(v.centavos),
  }));
  if (ordem) return fatias;
  return fatias.sort((a, b) => b.quantidade - a.quantidade || a.chave.localeCompare(b.chave));
}

// ---------------------------------------------------------------- taxas

/** Abaixo disto a taxa aparece como "X de Y", sem percentual. É regra de apresentação. */
export const BASE_MINIMA_PARA_TAXA = 10;

export type Taxa = {
  numerador: number;
  denominador: number;
  /** Nulo quando a base é pequena demais para o percentual dizer alguma coisa. */
  percentual: number | null;
  baseSuficiente: boolean;
};

export function taxa(numerador: number, denominador: number, minimo = BASE_MINIMA_PARA_TAXA): Taxa {
  const baseSuficiente = denominador >= minimo;
  return {
    numerador,
    denominador,
    percentual: baseSuficiente && denominador > 0 ? numerador / denominador : null,
    baseSuficiente,
  };
}

// ---------------------------------------------------------------- funil de propostas

export type PropostaDoFunil = {
  id: string;
  createdAt: Date;
  primeiroEnvioEm: Date | null;
  enviadoEm: Date | null;
  status: StatusDoOrcamento;
  validoAte: Date;
  reservationId: string | null;
  total: number;
  totalCalculado: number;
  valorFinalManual: boolean;
};

export type FunilDePropostas = {
  /** Criadas no período — conjunto próprio, fora da coorte. */
  criadas: number;
  /** A coorte: primeiro envio dentro do período. */
  enviadas: number;
  aprovadas: number;
  convertidas: number;
  perdidasDeclaradas: number;
  expiradas: number;
  emAberto: number;
  /** Propostas do período que saíram antes de o primeiro envio ser registrado. */
  semPrimeiroEnvio: number;
  aprovacao: Taxa;
  conversao: Taxa;
  idsDaCoorte: string[];
};

/**
 * O funil por coorte.
 *
 * A base é o conjunto de propostas cujo PRIMEIRO envio caiu no período, e
 * todos os passos seguintes são contados dentro dessa mesma base — aprovadas
 * delas, convertidas delas. "Aprovadas no mês ÷ enviadas no mês" dividiria
 * conjuntos diferentes: uma proposta enviada em agosto e aprovada em setembro
 * entraria no numerador de setembro sem nunca ter estado no denominador.
 *
 * Proposta sem `primeiroEnvioEm` não entra na taxa: é de antes de o campo
 * existir, e a data do primeiro envio dela não está em lugar nenhum. Ela é
 * contada à parte, para a tela dizer quantas ficaram de fora.
 *
 * Os estados da coorte fecham a conta: enviadas = aprovadas + perdidas
 * declaradas + expiradas + em aberto. Expirada não é perdida — a cliente não
 * disse não, a validade venceu —, e as duas ficam separadas.
 */
export function funilDePropostas(
  propostas: readonly PropostaDoFunil[],
  meses: readonly string[],
  agora: Date,
): FunilDePropostas {
  const noPeriodo = (d: Date | null) => d !== null && meses.includes(mesEmChapeco(d));

  const criadas = propostas.filter((p) => noPeriodo(p.createdAt)).length;
  const coorte = propostas.filter((p) => noPeriodo(p.primeiroEnvioEm));

  const semPrimeiroEnvio = propostas.filter(
    (p) =>
      p.primeiroEnvioEm === null &&
      noPeriodo(p.createdAt) &&
      (p.enviadoEm !== null || p.status !== "RASCUNHO"),
  ).length;

  const situacao = (p: PropostaDoFunil) => situacaoDoOrcamento(p.status, p.validoAte, agora);
  const aprovadas = coorte.filter((p) => p.status === "APROVADO");
  const convertidas = aprovadas.filter((p) => p.reservationId !== null);
  const perdidas = coorte.filter((p) => p.status === "RECUSADO");
  const expiradas = coorte.filter((p) => situacao(p) === "EXPIRADO");

  return {
    criadas,
    enviadas: coorte.length,
    aprovadas: aprovadas.length,
    convertidas: convertidas.length,
    perdidasDeclaradas: perdidas.length,
    expiradas: expiradas.length,
    emAberto: coorte.length - aprovadas.length - perdidas.length - expiradas.length,
    semPrimeiroEnvio,
    aprovacao: taxa(aprovadas.length, coorte.length),
    conversao: taxa(convertidas.length, aprovadas.length),
    idsDaCoorte: coorte.map((p) => p.id),
  };
}

// ---------------------------------------------------------------- negociação

export type AjustesComerciais = {
  /** Propostas da coorte com valor final diferente da composição. */
  negociadas: number;
  base: number;
  /** Soma das diferenças para baixo, em valor positivo. */
  paraBaixo: number;
  paraCima: number;
};

/**
 * O quanto as propostas do período foram negociadas.
 *
 * Só a diferença entre a composição e o valor final — nada de margem, perda
 * ou ganho: é ajuste comercial, para os dois lados, e ajuste para baixo não
 * é "desconto". A base é a mesma coorte do funil (primeiro envio no
 * período), para os dois blocos falarem das mesmas propostas.
 */
export function ajustesComerciais(coorte: readonly PropostaDoFunil[]): AjustesComerciais {
  let negociadas = 0;
  let baixo = 0;
  let cima = 0;
  for (const p of coorte) {
    const diferenca = toCentsInt(p.total) - toCentsInt(p.totalCalculado);
    if (!p.valorFinalManual || diferenca === 0) continue;
    negociadas += 1;
    if (diferenca < 0) baixo += -diferenca;
    else cima += diferenca;
  }
  return {
    negociadas,
    base: coorte.length,
    paraBaixo: fromCentsInt(baixo),
    paraCima: fromCentsInt(cima),
  };
}
