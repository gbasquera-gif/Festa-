import { z } from "zod";
import {
  AGRUPAMENTOS_DA_DESPESA,
  NATUREZAS_DO_GASTO,
  SITUACOES_DA_DESPESA,
  analisarDespesas,
  ateRealizado,
  diaEmChapeco,
  formatarReais,
  grafiaMaisUsada,
  normalizarParaBusca,
  variacao,
  type AnaliseDeDespesas,
  type DespesaAnalisada,
  type DespesaParaAnalise,
  type NaturezaDoGasto,
  type SituacaoDaDespesa,
} from "@festae/shared";
import type { FonteDaResposta } from "./contrato";
import { citaNaDescricao, resolverNome, type NomeCadastrado, type Resolucao } from "./correspondencia";
import type { Ferramenta, ResultadoDaFerramenta, ServicosDoAssistente } from "./ferramentas";
import { dataCurta, interpretarComparacao, interpretarPeriodoDeAnalise, type PeriodoDeAnalise } from "./periodo-analitico";

/**
 * consultarDespesas: despesas lançamento a lançamento, com filtros e contas
 * feitas no servidor.
 *
 * A IA escolhe os filtros (parâmetros tipados, validados aqui); a consulta é
 * fixa e só lê; a seleção e as contas são as de `analise-de-despesas`, com as
 * regras do Financeiro. Para o modelo vão números já formatados, a contagem
 * de lançamentos, os filtros efetivamente aplicados e o critério — nunca
 * linhas cruas, observação ou forma de pagamento.
 *
 * Três garantias estruturais, que não dependem de o modelo obedecer:
 * - ambiguidade de nome devolve as opções e NENHUM total;
 * - pergunta com fornecedor/categoria sem correspondência devolve a ausência
 *   e NENHUM total — não há total geral para o modelo usar no lugar;
 * - todo resultado traz um `resumo` montado aqui, que o núcleo usa se a
 *   resposta do modelo citar um valor que não veio da ferramenta.
 */

export const NATUREZA_LABEL: Record<NaturezaDoGasto, string> = {
  CONSUMO: "consumo",
  CUSTEIO: "custeio",
  ACERVO: "acervo (investimento)",
  PRO_LABORE: "pró-labore",
};

const SITUACAO_CRITERIO: Record<SituacaoDaDespesa, string> = {
  PAGO: "pagos, pela data do pagamento (o que efetivamente saiu do caixa)",
  A_PAGAR: "a pagar, pelo vencimento (compromissos ainda não pagos)",
  VENCIDO: "a pagar com vencimento antes de hoje",
  TODOS: "registrados: pagos (pela data do pagamento) e a pagar (pelo vencimento), separados",
};

const SITUACAO_CURTA: Record<SituacaoDaDespesa, string> = {
  PAGO: "pagos",
  A_PAGAR: "a pagar",
  VENCIDO: "vencidos",
  TODOS: "pagos e a pagar",
};

const brl = (centavos: number) => formatarReais(centavos / 100);
const lancamentos = (n: number) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const curta = (t: string, max = 60) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

const parametros = z.object({
  periodo: z
    .string()
    .min(1)
    .max(60)
    .describe(
      'Período como a pessoa disse: "outubro", "este mês", "mês passado", "últimos 3 meses", "últimos 3 meses completos", "últimos 90 dias", "este trimestre", "de 01/09 a 15/10", "este mês até agora", "até hoje". O servidor resolve no fuso de Chapecó.',
    ),
  compararCom: z
    .string()
    .min(1)
    .max(60)
    .nullish()
    .describe('Segundo período para comparar, com os mesmos filtros: "mês passado", "setembro", "mês anterior", "período anterior", "mesmo período do ano anterior".'),
  fornecedor: z.string().min(2).max(60).nullish().describe('Fornecedor como a pessoa disse (ex.: "Meta Ads"). O servidor procura no cadastro e, se não achar, na descrição.'),
  fornecedoresConfirmados: z
    .array(z.string().min(1).max(120))
    .max(10)
    .nullish()
    .describe("Só depois de precisaConfirmar: os nomes exatos, das opções, que a pessoa escolheu."),
  categoria: z.string().min(2).max(60).nullish().describe("Categoria como a pessoa disse."),
  categoriasConfirmadas: z.array(z.string().min(1).max(120)).max(10).nullish().describe("Só depois de precisaConfirmar de categoria."),
  natureza: z
    .array(z.enum(NATUREZAS_DO_GASTO))
    .min(1)
    .max(4)
    .nullish()
    .describe("SÓ se a pessoa disser a natureza: CONSUMO, CUSTEIO, ACERVO (investimento), PRO_LABORE. Sem natureza: todas, separadas."),
  situacao: z
    .enum(SITUACOES_DA_DESPESA)
    .nullish()
    .describe("PAGO (padrão: quanto gastamos/pagamos), A_PAGAR (quanto temos a pagar), VENCIDO (quanto está vencido), TODOS (quanto registramos/lançamos, ou quanto disso já foi pago)."),
  agruparPor: z.enum(AGRUPAMENTOS_DA_DESPESA).nullish().describe("Para rankings e quebras: FORNECEDOR, CATEGORIA, NATUREZA ou MES."),
  limite: z.number().int().min(1).max(10).nullish().describe("Quantos grupos mostrar no ranking (padrão 5)."),
  listarLancamentos: z.boolean().nullish().describe("true para listar até 10 lançamentos considerados."),
});

type Parametros = z.infer<typeof parametros>;

const EXEMPLOS_DE_PERIODO = ['"outubro"', '"este mês"', '"mês passado"', '"últimos 3 meses"', '"este trimestre"', '"de 01/09 a 15/10"'];

function limitacao(motivo: string, extra: Record<string, unknown> = {}): ResultadoDaFerramenta {
  return { tipo: "LIMITACAO", dados: { limitacao: motivo, ...extra, resumo: motivo }, fontes: [] };
}

/** O filtro de nome (fornecedor ou categoria) já resolvido. */
type FiltroDeNome =
  | { campo: "fornecedor" | "categoria"; criterio: string; chaves: Set<string>; grafias: string[] }
  | { campo: "descricao"; criterio: string; termo: string };

function descreverCriterio(r: Extract<Resolucao, { tipo: "ENCONTRADO" }>, termo: string | null | undefined): string {
  if (r.criterio === "CONFIRMADO") return "nomes confirmados na conversa";
  if (r.criterio === "IGUAL") return "nome igual ao cadastrado (sem diferença de maiúsculas, acentos e espaços)";
  return `único nome cadastrado que contém "${termo}"`;
}

function opcoesParaConfirmar(campo: "fornecedor" | "categoria", termo: string, r: Extract<Resolucao, { tipo: "AMBIGUO" }>): ResultadoDaFerramenta {
  const lista = r.opcoes.map((o) => `${o.nome} (${lancamentos(o.lancamentos)})`).join("; ");
  const resumo = `Encontrei mais de ${campo === "fornecedor" ? "um fornecedor" : "uma categoria"} para "${termo}": ${lista}. Quais devo considerar?`;
  return {
    tipo: "LIMITACAO",
    dados: {
      precisaConfirmar: {
        campo,
        termo,
        opcoes: r.opcoes.map((o) => ({ nome: o.nome, lancamentosNoHistorico: o.lancamentos, correspondencia: o.criterio.toLowerCase() })),
        instrucao: `Mostre as opções e pergunte quais incluir. Não some nada antes. Depois chame de novo com ${campo === "fornecedor" ? "fornecedoresConfirmados" : "categoriasConfirmadas"}.`,
      },
      resumo,
    },
    fontes: [],
  };
}

function resolverFiltro(
  campo: "fornecedor" | "categoria",
  termo: string | null | undefined,
  confirmados: readonly string[] | null | undefined,
  cadastrados: readonly NomeCadastrado[],
): FiltroDeNome | ResultadoDaFerramenta | null {
  if (!termo && !confirmados?.length) return null;
  const r = resolverNome(termo, confirmados, cadastrados);
  if (r.tipo === "AMBIGUO") return opcoesParaConfirmar(campo, termo ?? "", r);
  if (r.tipo === "ENCONTRADO") return { campo, criterio: descreverCriterio(r, termo), chaves: new Set(r.chaves), grafias: [...new Set(r.grafias)] };
  // Fornecedor fora do cadastro: procura na descrição dos lançamentos sem fornecedor.
  if (campo === "fornecedor" && termo && !confirmados?.length) {
    return { campo: "descricao", criterio: `"${termo}" encontrado na descrição de lançamentos sem fornecedor preenchido`, termo };
  }
  return { campo, criterio: "nenhum nome cadastrado corresponde", chaves: new Set(), grafias: [] };
}

function atende(filtro: FiltroDeNome | null, d: DespesaParaAnalise): boolean {
  if (!filtro) return true;
  if (filtro.campo === "descricao") return !d.fornecedor?.trim() && citaNaDescricao(d.descricao, filtro.termo);
  const valor = filtro.campo === "fornecedor" ? d.fornecedor : d.categoria;
  return Boolean(valor?.trim()) && filtro.chaves.has(normalizarParaBusca(valor!));
}

function descreverFiltro(f: FiltroDeNome) {
  return f.campo === "descricao"
    ? { campoUsado: "descrição (o campo fornecedor desses lançamentos está vazio)", termo: f.termo, criterio: f.criterio }
    : { campoUsado: f.campo, nomesConsiderados: f.grafias, criterio: f.criterio };
}

function lancamentoParaIA(l: DespesaAnalisada) {
  return {
    dia: l.dia ? dataCurta(l.dia) : "sem vencimento",
    valor: brl(l.centavos),
    natureza: NATUREZA_LABEL[l.natureza],
    situacao: l.paga ? "pago" : l.vencida ? "vencido" : "a vencer",
    fornecedor: l.fornecedor?.trim() || null,
    descricao: curta(l.descricao),
  };
}

function totais(a: AnaliseDeDespesas) {
  return { total: brl(a.agregado.totalCentavos), lancamentos: a.agregado.quantidade };
}

export function fonteDeDespesas(p: PeriodoDeAnalise): FonteDaResposta {
  return p.de.slice(0, 7) === p.ate.slice(0, 7)
    ? { rotulo: `Despesas · ${p.de.slice(5, 7)}/${p.de.slice(0, 4)}`, caminho: `/financeiro?aba=despesas&ano=${p.de.slice(0, 4)}&mes=${p.de.slice(5, 7)}` }
    : { rotulo: "Despesas", caminho: "/financeiro?aba=despesas" };
}

/**
 * Como o período foi considerado. O pago para em hoje; o a pagar vai até o
 * fim do período pelo vencimento. Em TODOS, as duas pontas são ditas.
 */
function periodoConsiderado(p: PeriodoDeAnalise, situacao: SituacaoDaDespesa, hoje: string) {
  const emAndamento = p.ate > hoje && p.de <= hoje;
  const corta = situacao === "PAGO" && emAndamento;
  const nota =
    situacao === "PAGO" && emAndamento
      ? "Pagos só até hoje: lançamento com data de pagamento futura não entra."
      : situacao === "TODOS" && emAndamento
        ? `Pagos até hoje (${dataCurta(hoje)}); a pagar pelo vencimento até ${dataCurta(p.ate)}.`
        : (situacao === "A_PAGAR" || situacao === "VENCIDO") && p.ate > hoje
          ? `A pagar pelo vencimento, até ${dataCurta(p.ate)}${situacao === "VENCIDO" ? " (vencido: antes de hoje)" : ""}.`
          : null;
  return {
    rotulo: corta ? `${p.rotulo}, até ${dataCurta(hoje)}` : p.rotulo,
    de: p.de,
    ate: p.ate,
    ...(corta ? { consideradoAte: dataCurta(hoje) } : {}),
    ...(emAndamento ? { emAndamento: true } : {}),
    ...(nota ? { notaDoCorte: nota } : {}),
    ...(p.de > hoje ? { futuro: "Período futuro: nada pago ainda." } : {}),
    ...(p.observacao ? { observacao: p.observacao } : {}),
  };
}

async function analisar(
  servicos: ServicosDoAssistente,
  p: PeriodoDeAnalise,
  hoje: string,
  args: Parametros,
  situacao: SituacaoDaDespesa,
  filtros: (FiltroDeNome | null)[],
  naturezas: readonly NaturezaDoGasto[] | null,
) {
  const despesas = await servicos.financeiro.despesasParaAnalise(p.de, p.ate);
  const incluir = (d: DespesaParaAnalise) => filtros.every((f) => atende(f, d));
  const analise = analisarDespesas(
    despesas,
    { de: p.de, ate: p.ate, hoje, situacao, naturezas, incluir },
    { agruparPor: args.agruparPor ?? null, limite: args.limite ?? 5 },
  );
  return { despesas, analise, incluir };
}

export const consultarDespesas: Ferramenta<typeof parametros> = {
  nome: "consultarDespesas",
  descricao:
    "Despesas lançamento a lançamento, com filtros e contas feitas pelo servidor: fornecedor (procura no cadastro e na descrição), categoria, natureza, situação (pago, a pagar, vencido), qualquer período (\"últimos 3 meses\", \"este trimestre\", \"até agora\", intervalos), soma, quantidade, média, maior, menor, ranking/agrupamento (fornecedor, categoria, natureza, mês) e comparação entre períodos com variação. Use para TODA pergunta de despesa com recorte — fornecedor, categoria, situação, média, maior/menor, ranking, comparação. Devolve os filtros aplicados e a quantidade de lançamentos.",
  natureza: "LEITURA",
  papeis: ["ADMIN"],
  parametros,
  async executar(args, contexto) {
    try {
      return await executarConsulta(args, contexto);
    } catch (e) {
      // O teto de linhas é limitação a explicar, não falha a esconder.
      if (e instanceof Error && /escolha um período menor/.test(e.message)) return limitacao(e.message);
      throw e;
    }
  },
};

async function executarConsulta(args: Parametros, { agora, servicos }: { agora: Date; servicos: ServicosDoAssistente }): Promise<ResultadoDaFerramenta> {
  const hoje = diaEmChapeco(agora);
  const situacao = args.situacao ?? "PAGO";
  const naturezas = args.natureza?.length ? [...new Set(args.natureza)] : null;

  const rp = interpretarPeriodoDeAnalise(args.periodo, agora);
  if (!rp.ok) return limitacao(rp.erro, { exemplosDePeriodo: EXEMPLOS_DE_PERIODO });
  const p = rp.periodo;

  // Nomes: resolvidos antes de qualquer conta. Ambíguo para aqui, sem total.
  const precisaNomes = Boolean(args.fornecedor || args.fornecedoresConfirmados?.length || args.categoria || args.categoriasConfirmadas?.length);
  const nomes = precisaNomes ? await servicos.financeiro.nomesNasDespesas() : { fornecedores: [], categorias: [] };
  const filtroFornecedor = resolverFiltro("fornecedor", args.fornecedor, args.fornecedoresConfirmados, nomes.fornecedores);
  if (filtroFornecedor && "dados" in filtroFornecedor) return filtroFornecedor;
  const filtroCategoria = resolverFiltro("categoria", args.categoria, args.categoriasConfirmadas, nomes.categorias);
  if (filtroCategoria && "dados" in filtroCategoria) return filtroCategoria;
  const filtros = [filtroFornecedor as FiltroDeNome | null, filtroCategoria as FiltroDeNome | null];
  const filtrosDeNome = filtros.filter((f): f is FiltroDeNome => f !== null);

  const { despesas, analise } = await analisar(servicos, p, hoje, args, situacao, filtros, naturezas);
  const periodo = periodoConsiderado(p, situacao, hoje);
  const fontes = [fonteDeDespesas(p)];
  const filtrosAplicados = {
    situacao: SITUACAO_CRITERIO[situacao],
    naturezas: naturezas ? naturezas.map((n) => NATUREZA_LABEL[n]) : "todas, separadas por natureza",
    ...(filtroFornecedor ? { fornecedor: descreverFiltro(filtroFornecedor as FiltroDeNome) } : {}),
    ...(filtroCategoria ? { categoria: descreverFiltro(filtroCategoria as FiltroDeNome) } : {}),
  };
  const criterios = [
    "Valores somados pelo servidor, em centavos, com as regras do Financeiro; a contagem é dos lançamentos considerados.",
    "O ERP não tem competência de despesa: pago conta no dia em que o dinheiro saiu; a pagar, no vencimento.",
    "Consumo e custeio compõem a despesa do Resultado Operacional; acervo é investimento e pró-labore fica fora do resultado.",
  ];

  // Filtro de nome sem nenhum lançamento: a ausência, sem total nenhum.
  if (filtrosDeNome.length && analise.agregado.quantidade === 0) {
    const semNatureza = naturezas
      ? analisarDespesas(despesas, { de: p.de, ate: p.ate, hoje, situacao, naturezas: null, incluir: (d) => filtros.every((f) => atende(f, d)) })
      : null;
    const emOutrasNaturezas = semNatureza?.porNatureza.map((g) => ({ natureza: NATUREZA_LABEL[g.chave as NaturezaDoGasto], lancamentos: g.quantidade })) ?? [];
    const emOutraSituacao =
      situacao === "PAGO"
        ? analisarDespesas(despesas, { de: p.de, ate: p.ate, hoje, situacao: "A_PAGAR", naturezas, incluir: (d) => filtros.every((f) => atende(f, d)) }).agregado.quantidade
        : 0;
    const quem = [
      filtroFornecedor ? `do fornecedor "${args.fornecedor ?? args.fornecedoresConfirmados?.join(", ")}"` : null,
      filtroCategoria ? `da categoria "${args.categoria ?? args.categoriasConfirmadas?.join(", ")}"` : null,
    ]
      .filter(Boolean)
      .join(" e ");
    const recorte = naturezas ? ` em ${naturezas.map((n) => NATUREZA_LABEL[n]).join(" ou ")}` : "";
    const ondeProcurou =
      filtroFornecedor && (filtroFornecedor as FiltroDeNome).campo === "descricao" ? " (nem no cadastro de fornecedores, nem na descrição)" : "";
    let resumo = `Não encontrei lançamentos ${SITUACAO_CURTA[situacao]} ${quem}${ondeProcurou}${recorte} em ${periodo.rotulo}.`;
    if (emOutrasNaturezas.length) {
      resumo += ` Há ${emOutrasNaturezas.map((o) => `${lancamentos(o.lancamentos)} em ${o.natureza}`).join(" e ")} — posso somar esses, se quiser.`;
    }
    if (emOutraSituacao) resumo += ` Há ${lancamentos(emOutraSituacao)} ainda a pagar nesse período.`;
    return {
      dados: {
        periodo,
        filtrosAplicados,
        semCorrespondencia: {
          mensagem: resumo,
          ...(emOutrasNaturezas.length ? { emOutrasNaturezas } : {}),
          ...(emOutraSituacao ? { aPagarNoPeriodo: emOutraSituacao } : {}),
          instrucao: "Diga que não há lançamentos com esses filtros. Não cite nenhum outro total. Ofereça só o que vier em emOutrasNaturezas ou aPagarNoPeriodo.",
        },
        resumo,
        criterios,
      },
      fontes,
    };
  }

  const a = analise;
  const resultado: Record<string, unknown> = {
    ...totais(a),
    mediaPorLancamento: a.agregado.mediaCentavos === null ? null : brl(a.agregado.mediaCentavos),
    ...(a.agregado.maior ? { maior: lancamentoParaIA(a.agregado.maior) } : {}),
    ...(a.agregado.menor && a.agregado.quantidade > 1 ? { menor: lancamentoParaIA(a.agregado.menor) } : {}),
    porNatureza: a.porNatureza.map((g) => ({ natureza: NATUREZA_LABEL[g.chave as NaturezaDoGasto], total: brl(g.totalCentavos), lancamentos: g.quantidade })),
    ...(!naturezas || naturezas.length > 1
      ? { despesaOperacional: { criterio: "consumo + custeio", total: brl(a.despesaOperacional.totalCentavos), lancamentos: a.despesaOperacional.quantidade } }
      : {}),
    ...(a.meses > 1 && a.mediaMensalCentavos !== null ? { mediaMensal: { valor: brl(a.mediaMensalCentavos), meses: a.meses } } : {}),
  };
  if (situacao !== "PAGO") {
    resultado.porSituacao = {
      pago: { total: brl(a.porSituacao.pago.totalCentavos), lancamentos: a.porSituacao.pago.quantidade },
      vencido: { total: brl(a.porSituacao.vencido.totalCentavos), lancamentos: a.porSituacao.vencido.quantidade },
      aVencer: { total: brl(a.porSituacao.aVencer.totalCentavos), lancamentos: a.porSituacao.aVencer.quantidade },
    };
  }
  if (a.agrupado) {
    const grafias = args.agruparPor === "FORNECEDOR" || args.agruparPor === "CATEGORIA" ? grafiaMaisUsada(a.linhas, args.agruparPor) : null;
    const nomeDoGrupo = (chave: string) => {
      if (args.agruparPor === "NATUREZA") return NATUREZA_LABEL[chave as NaturezaDoGasto];
      if (args.agruparPor === "MES") return chave ? `${chave.slice(5, 7)}/${chave.slice(0, 4)}` : "sem data";
      return chave ? (grafias?.get(chave) ?? chave) : args.agruparPor === "FORNECEDOR" ? "(sem fornecedor preenchido)" : "(sem categoria)";
    };
    resultado.grupos = a.agrupado.grupos.map((g) => ({ nome: nomeDoGrupo(g.chave), total: brl(g.totalCentavos), lancamentos: g.quantidade }));
    if (a.agrupado.outros) {
      resultado.outros = { grupos: a.agrupado.outros.grupos, total: brl(a.agrupado.outros.totalCentavos), lancamentos: a.agrupado.outros.quantidade };
    }
  }
  if (args.listarLancamentos) {
    resultado.lancamentos = a.linhas.slice(0, 10).map(lancamentoParaIA);
    if (a.linhas.length > 10) resultado.listaCortada = `Mostrando 10 de ${a.linhas.length}.`;
  }

  const foraDoTotal: Record<string, unknown> = {};
  if (a.foraDoTotal.pagasComDataFutura.quantidade) {
    foraDoTotal.pagosComDataFutura = {
      ...{ total: brl(a.foraDoTotal.pagasComDataFutura.totalCentavos), lancamentos: a.foraDoTotal.pagasComDataFutura.quantidade },
      nota: "Marcados como pagos com data depois de hoje: ainda não saíram do caixa. O painel Financeiro os soma no mês da data.",
    };
  }
  if (a.foraDoTotal.vencidasAntesDoPeriodo.quantidade) {
    foraDoTotal.vencidosAntesDoPeriodo = {
      total: brl(a.foraDoTotal.vencidasAntesDoPeriodo.totalCentavos),
      lancamentos: a.foraDoTotal.vencidasAntesDoPeriodo.quantidade,
      nota: `A pagar que venceram antes de ${dataCurta(p.de)}: dívida de períodos anteriores, fora do total do período.`,
    };
  }
  if (a.foraDoTotal.aPagarSemVencimento.quantidade) {
    foraDoTotal.aPagarSemVencimento = {
      total: brl(a.foraDoTotal.aPagarSemVencimento.totalCentavos),
      lancamentos: a.foraDoTotal.aPagarSemVencimento.quantidade,
      nota: "A pagar sem vencimento: não pertencem a período nenhum.",
    };
  }

  // Lançamentos sem fornecedor que citam o termo na descrição, quando o cadastro achou o fornecedor.
  let tambemNaDescricao: Record<string, unknown> | null = null;
  if (filtroFornecedor && (filtroFornecedor as FiltroDeNome).campo === "fornecedor" && args.fornecedor) {
    const extra = analisarDespesas(despesas, {
      de: p.de,
      ate: p.ate,
      hoje,
      situacao,
      naturezas,
      incluir: (d) => atende({ campo: "descricao", criterio: "", termo: args.fornecedor! }, d) && atende(filtroCategoria as FiltroDeNome | null, d),
    });
    if (extra.agregado.quantidade) {
      tambemNaDescricao = {
        ...totais(extra),
        nota: `Lançamentos SEM fornecedor preenchido que citam "${args.fornecedor}" na descrição. Não estão no total acima; diga que existem e pergunte se devem ser somados.`,
      };
    }
  }

  // Comparação: mesmos filtros, mesma situação, o outro período.
  let comparacao: Record<string, unknown> | null = null;
  let fraseDaComparacao = "";
  if (args.compararCom) {
    const efetivo = situacao === "PAGO" ? { ...p, ate: ateRealizado({ ate: p.ate, hoje }) } : p;
    const rc = interpretarComparacao(args.compararCom, efetivo, agora);
    if (!rc.ok) {
      comparacao = { limitacao: rc.erro };
    } else {
      const pc = rc.periodo;
      const outro = (await analisar(servicos, pc, hoje, { ...args, agruparPor: null }, situacao, filtros, naturezas)).analise;
      // A variação do Financeiro (diferença ÷ base); o percentual é arredondado
      // a uma casa a partir dos centavos, sem ponto flutuante na casa decimal.
      const v = variacao(a.agregado.totalCentavos / 100, outro.agregado.totalCentavos / 100);
      const diferenca = a.agregado.totalCentavos - outro.agregado.totalCentavos;
      const periodoComparado = periodoConsiderado(pc, situacao, hoje);
      const decimos = v.temBase ? Math.round((Math.abs(diferenca) * 1000) / Math.abs(outro.agregado.totalCentavos)) : null;
      const percentual =
        decimos === null ? null : `${diferenca > 0 ? "+" : diferenca < 0 ? "−" : ""}${Math.floor(decimos / 10)},${decimos % 10}%`;
      const parciais = [periodo, periodoComparado].filter((x) => "emAndamento" in x).map((x) => x.rotulo);
      comparacao = {
        periodo: periodoComparado,
        ...totais(outro),
        diferenca: diferenca === 0 ? "igual" : `${brl(Math.abs(diferenca))} ${diferenca > 0 ? "a mais" : "a menos"} em ${periodo.rotulo}`,
        variacaoPercentual: percentual,
        ...(decimos === null ? { semPercentual: outro.agregado.totalCentavos === 0 && a.agregado.totalCentavos === 0 ? "sem valores nos dois períodos" : "sem valor no período de comparação (base zero): não há percentual" } : {}),
        ...(parciais.length ? { atencao: `Período em andamento (${parciais.join("; ")}): a comparação é com um período parcial.` } : {}),
      };
      fraseDaComparacao =
        ` Em ${periodoComparado.rotulo}: ${outro.agregado.quantidade ? `${brl(outro.agregado.totalCentavos)} (${lancamentos(outro.agregado.quantidade)})` : "nenhum lançamento"}` +
        (percentual ? `; variação de ${percentual}.` : diferenca === 0 ? "." : "; sem base para percentual.");
    }
  }

  const quem = filtrosDeNome
    .map((f) => (f.campo === "descricao" ? ` citando "${f.termo}" na descrição` : f.campo === "fornecedor" ? ` do fornecedor ${f.grafias.join(" / ")}` : ` da categoria ${f.grafias.join(" / ")}`))
    .join("");
  const deNatureza = naturezas ? ` de ${naturezas.map((n) => NATUREZA_LABEL[n]).join(" e ")}` : "";
  const separacao =
    !naturezas && a.porNatureza.length > 1 ? ` Por natureza: ${a.porNatureza.map((g) => `${NATUREZA_LABEL[g.chave as NaturezaDoGasto]} ${brl(g.totalCentavos)}`).join(", ")}.` : "";
  const situacoes =
    situacao !== "PAGO" && a.agregado.quantidade
      ? ` Pago: ${brl(a.porSituacao.pago.totalCentavos)}; vencido: ${brl(a.porSituacao.vencido.totalCentavos)}; a vencer: ${brl(a.porSituacao.aVencer.totalCentavos)}.`
      : "";
  const resumo =
    `${maiuscula(periodo.rotulo)}: ${lancamentos(a.agregado.quantidade)}${deNatureza}${quem}, total ${brl(a.agregado.totalCentavos)} (${SITUACAO_CURTA[situacao]}).` +
    separacao +
    situacoes +
    (situacao !== "PAGO" && periodo.notaDoCorte ? ` ${periodo.notaDoCorte}` : "") +
    (a.foraDoTotal.vencidasAntesDoPeriodo.quantidade
      ? ` À parte, vencidos antes de ${dataCurta(p.de)}: ${brl(a.foraDoTotal.vencidasAntesDoPeriodo.totalCentavos)} (${lancamentos(a.foraDoTotal.vencidasAntesDoPeriodo.quantidade)}).`
      : "") +
    fraseDaComparacao;

  return {
    dados: {
      periodo,
      filtrosAplicados,
      resultado,
      ...(Object.keys(foraDoTotal).length ? { foraDoTotal } : {}),
      ...(tambemNaDescricao ? { tambemNaDescricao } : {}),
      ...(comparacao ? { comparacao } : {}),
      resumo,
      criterios,
    },
    fontes,
  };
}
