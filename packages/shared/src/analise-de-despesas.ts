import { agregar, agrupar, dividirCentavos, normalizarParaBusca, type Agregado, type Grupo } from "./analise";
import { diaDaDespesa, NATUREZAS_DE_DESPESA, type NaturezaDoGasto } from "./financeiro";
import { toCentsInt } from "./pricing";

/**
 * Análise de despesas: quais lançamentos entram, por qual data, e as contas
 * sobre eles.
 *
 * As regras são as do Financeiro, sem fórmula nova:
 *
 * - **Pago** é quem tem data de pagamento; o dia é o mesmo que o Resultado
 *   Operacional lê (`diaDaDespesa`). Não existe competência de despesa no
 *   ERP: a despesa pertence ao dia em que o dinheiro saiu.
 * - **A pagar** é quem não tem data de pagamento; o dia é o vencimento.
 *   Vencido é a pagar com vencimento antes de hoje.
 * - Valor **realizado nunca inclui o futuro**: um lançamento marcado como
 *   pago com data depois de hoje não entra no total do período e é contado à
 *   parte (o painel Financeiro o soma no mês dele; a diferença fica explícita).
 * - Natureza nunca se mistura sem aparecer: o resultado vem sempre separado
 *   por natureza, e "despesa operacional" é só consumo + custeio, como no
 *   Resultado Operacional.
 */

export type DespesaParaAnalise = {
  id: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  valor: number;
  pagoEm: Date | null;
  venceEm: Date | null;
  categoria: string | null;
  fornecedor: string | null;
};

export const SITUACOES_DA_DESPESA = ["PAGO", "A_PAGAR", "VENCIDO", "TODOS"] as const;
export type SituacaoDaDespesa = (typeof SITUACOES_DA_DESPESA)[number];

export const AGRUPAMENTOS_DA_DESPESA = ["FORNECEDOR", "CATEGORIA", "NATUREZA", "MES"] as const;
export type AgrupamentoDaDespesa = (typeof AGRUPAMENTOS_DA_DESPESA)[number];

export type RecorteDeDespesas = {
  /** Dias do calendário "AAAA-MM-DD", inclusive nas duas pontas. */
  de: string;
  ate: string;
  /** Hoje em Chapecó. */
  hoje: string;
  situacao: SituacaoDaDespesa;
  /** Nula: todas as naturezas, separadas no resultado. */
  naturezas: readonly NaturezaDoGasto[] | null;
  /** Os demais filtros (fornecedor, categoria, descrição), já resolvidos por quem chama. */
  incluir?: (d: DespesaParaAnalise) => boolean;
};

export type DespesaAnalisada = DespesaParaAnalise & {
  centavos: number;
  /** Pagamento, se paga; vencimento, se a pagar; nulo se a pagar sem vencimento. */
  dia: string | null;
  paga: boolean;
  vencida: boolean;
};

/** O vencimento é um dia do calendário gravado como data; lido como o dia gravado, igual ao pagamento. */
export function diaDoVencimento(venceEm: Date): string {
  return venceEm.toISOString().slice(0, 10);
}

export function analisarLancamento(d: DespesaParaAnalise, hoje: string): DespesaAnalisada {
  const paga = d.pagoEm !== null;
  const dia = d.pagoEm ? diaDaDespesa(d.pagoEm) : d.venceEm ? diaDoVencimento(d.venceEm) : null;
  return { ...d, centavos: toCentsInt(d.valor), dia, paga, vencida: !paga && dia !== null && dia < hoje };
}

/** O último dia que conta como realizado: o fim do período, ou hoje, o que vier antes. */
export function ateRealizado(recorte: Pick<RecorteDeDespesas, "ate" | "hoje">): string {
  return recorte.ate < recorte.hoje ? recorte.ate : recorte.hoje;
}

export type SelecaoDeDespesas = {
  /** O que responde à pergunta, conforme a situação pedida. */
  principais: DespesaAnalisada[];
  /** Fora do total, mas dito na resposta para a conta fechar com a tela. */
  pagasComDataFutura: DespesaAnalisada[];
  aPagarSemVencimento: DespesaAnalisada[];
};

export function selecionarDespesas(despesas: readonly DespesaParaAnalise[], recorte: RecorteDeDespesas): SelecaoDeDespesas {
  const fimRealizado = ateRealizado(recorte);
  const naturezaOk = (d: DespesaParaAnalise) => !recorte.naturezas || recorte.naturezas.includes(d.natureza);
  const linhas = despesas
    .filter((d) => naturezaOk(d) && (recorte.incluir ? recorte.incluir(d) : true))
    .map((d) => analisarLancamento(d, recorte.hoje));

  const pagas = linhas.filter((l) => l.paga && l.dia! >= recorte.de && l.dia! <= fimRealizado);
  const pagasComDataFutura = linhas.filter((l) => l.paga && l.dia! > fimRealizado && l.dia! >= recorte.de && l.dia! <= recorte.ate);
  // A pagar olha o período inteiro: o que vence até o fim dele, inclusive depois de hoje.
  const aPagar = linhas.filter((l) => !l.paga && l.dia !== null && l.dia >= recorte.de && l.dia <= recorte.ate);
  const aPagarSemVencimento = linhas.filter((l) => !l.paga && l.dia === null);

  const principais =
    recorte.situacao === "PAGO"
      ? pagas
      : recorte.situacao === "A_PAGAR"
        ? aPagar
        : recorte.situacao === "VENCIDO"
          ? aPagar.filter((l) => l.vencida)
          : [...pagas, ...aPagar];

  const pedeAPagar = recorte.situacao !== "PAGO";
  const pedePago = recorte.situacao === "PAGO" || recorte.situacao === "TODOS";
  return {
    principais: principais.sort((a, b) => (b.dia ?? "").localeCompare(a.dia ?? "") || b.centavos - a.centavos),
    pagasComDataFutura: pedePago ? pagasComDataFutura : [],
    aPagarSemVencimento: pedeAPagar ? aPagarSemVencimento : [],
  };
}

export type Subtotal = { totalCentavos: number; quantidade: number };

const subtotal = (linhas: readonly DespesaAnalisada[]): Subtotal => ({
  totalCentavos: linhas.reduce((s, l) => s + l.centavos, 0),
  quantidade: linhas.length,
});

/** Meses do calendário entre dois dias, contando os dois: 01/08 a 21/10 são 3. */
export function mesesNoIntervalo(de: string, ate: string): number {
  if (ate < de) return 0;
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

export type AnaliseDeDespesas = {
  agregado: Agregado<DespesaAnalisada>;
  porNatureza: Grupo[];
  /** Consumo + custeio: o que compõe a despesa do Resultado Operacional. */
  despesaOperacional: Subtotal;
  porSituacao: { pago: Subtotal; vencido: Subtotal; aVencer: Subtotal };
  agrupado: ReturnType<typeof agrupar<DespesaAnalisada>> | null;
  /** Meses do período com valor realizado possível (o mês em andamento conta). */
  meses: number;
  mediaMensalCentavos: number | null;
  foraDoTotal: { pagasComDataFutura: Subtotal; aPagarSemVencimento: Subtotal };
  linhas: DespesaAnalisada[];
};

/**
 * Agrupa pelo nome normalizado (maiúsculas, acentos e espaços não separam o
 * mesmo nome) e mostra a grafia mais usada.
 */
function chaveDoAgrupamento(por: AgrupamentoDaDespesa): (l: DespesaAnalisada) => string {
  switch (por) {
    case "FORNECEDOR":
      return (l) => (l.fornecedor?.trim() ? normalizarParaBusca(l.fornecedor) : "");
    case "CATEGORIA":
      return (l) => (l.categoria?.trim() ? normalizarParaBusca(l.categoria) : "");
    case "NATUREZA":
      return (l) => l.natureza;
    case "MES":
      return (l) => (l.dia ? l.dia.slice(0, 7) : "");
  }
}

/** A grafia mais frequente de cada chave normalizada, para mostrar. */
export function grafiaMaisUsada(linhas: readonly DespesaAnalisada[], por: "FORNECEDOR" | "CATEGORIA"): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const bruto = (por === "FORNECEDOR" ? l.fornecedor : l.categoria)?.trim();
    if (!bruto) continue;
    const k = normalizarParaBusca(bruto);
    const m = contagem.get(k) ?? new Map<string, number>();
    m.set(bruto, (m.get(bruto) ?? 0) + 1);
    contagem.set(k, m);
  }
  const saida = new Map<string, string>();
  for (const [k, m] of contagem) saida.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  return saida;
}

export function analisarDespesas(
  despesas: readonly DespesaParaAnalise[],
  recorte: RecorteDeDespesas,
  opcoes: { agruparPor?: AgrupamentoDaDespesa | null; limite?: number } = {},
): AnaliseDeDespesas {
  const selecao = selecionarDespesas(despesas, recorte);
  const linhas = selecao.principais;
  const agregado = agregar(linhas);
  const porNatureza = agrupar(linhas, (l) => l.natureza, 10).grupos;
  const operacionais = linhas.filter((l) => NATUREZAS_DE_DESPESA.includes(l.natureza));

  const fimDasContas = recorte.situacao === "PAGO" ? ateRealizado(recorte) : recorte.ate;
  const meses = mesesNoIntervalo(recorte.de, fimDasContas);

  return {
    agregado,
    porNatureza,
    despesaOperacional: subtotal(operacionais),
    porSituacao: {
      pago: subtotal(linhas.filter((l) => l.paga)),
      vencido: subtotal(linhas.filter((l) => l.vencida)),
      aVencer: subtotal(linhas.filter((l) => !l.paga && !l.vencida)),
    },
    agrupado: opcoes.agruparPor ? agrupar(linhas, chaveDoAgrupamento(opcoes.agruparPor), opcoes.limite ?? 5) : null,
    meses,
    mediaMensalCentavos: meses > 0 && linhas.length ? dividirCentavos(agregado.totalCentavos, meses) : null,
    foraDoTotal: {
      pagasComDataFutura: subtotal(selecao.pagasComDataFutura),
      aPagarSemVencimento: subtotal(selecao.aPagarSemVencimento),
    },
    linhas,
  };
}
