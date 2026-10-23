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
  type AnaliseDeDespesas,
  type DespesaAnalisada,
  type DespesaParaAnalise,
  type NaturezaDoGasto,
  type SituacaoDaDespesa,
} from "@festae/shared";
import type { FonteDaResposta } from "./contrato";
import { citaNaDescricao, resolverNome, type NomeCadastrado, type Resolucao } from "./correspondencia";
import type { ContextoDaFerramenta, Ferramenta, ResultadoDaFerramenta, ServicosDoAssistente } from "./ferramentas";
import { dataCurta, interpretarComparacao, interpretarPeriodoDeAnalise, type PeriodoDeAnalise } from "./periodo-analitico";
import { tabelaDeCodigos } from "./pseudonimos";

/**
 * consultarDespesas: despesas lançamento a lançamento, com filtros e contas
 * feitas no servidor.
 *
 * A IA escolhe os filtros (parâmetros tipados, validados aqui); a consulta é
 * fixa e só lê; a seleção e as contas são as de `analise-de-despesas`, com as
 * regras do Financeiro. Para o modelo vão números já formatados, a contagem
 * de lançamentos, os filtros efetivamente aplicados e o critério — nunca
 * linhas cruas, descrição, observação ou forma de pagamento. Fornecedor vai
 * como código ("[F1]"): o servidor troca pelo nome antes de mostrar.
 *
 * Três garantias estruturais, que não dependem de o modelo obedecer:
 * - ambiguidade de nome devolve as opções e NENHUM total;
 * - pergunta com fornecedor/categoria sem correspondência devolve a ausência
 *   e NENHUM total geral — só o que é do mesmo filtro (fora do total,
 *   comparação);
 * - todo resultado traz um `resumo` montado aqui, que o núcleo usa se a
 *   resposta do modelo citar um valor que não veio das ferramentas.
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

/** Quantos lançamentos a lista leva para o modelo. */
const LANCAMENTOS_NA_LISTA = 10;

const brl = (centavos: number) => formatarReais(centavos / 100);
const lancamentos = (n: number) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Meses equivalentes com duas casas e a unidade junto ("2,68 meses"), para não serem lidos como dinheiro. */
const emMeses = (meses: number) => `${meses.toFixed(2).replace(".", ",")} meses`;

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
    .describe('Segundo período para comparar, com os mesmos filtros: "mês passado", "setembro", "mês anterior", "período anterior", "mesmo período do ano anterior", "mesmo período de 2024".'),
  fornecedor: z
    .string()
    .min(1)
    // O código "[F1]" volta a ser o nome antes da validação: o nome cadastrado tem de 1 a 120 caracteres.
    .max(120)
    .nullish()
    .describe('Fornecedor como a pessoa disse (ex.: "Meta Ads") ou o código que veio numa resposta anterior (ex.: "[F2]"). O servidor procura no cadastro e, se não achar, na descrição.'),
  fornecedoresConfirmados: z
    .array(z.string().min(1).max(120))
    .max(10)
    .nullish()
    .describe('Só depois de precisaConfirmar: os códigos das opções que a pessoa escolheu (ex.: ["[F1]"]).'),
  categoria: z.string().min(1).max(120).nullish().describe('Categoria como a pessoa disse, ou o código que veio numa resposta anterior (ex.: "[K1]").'),
  categoriasConfirmadas: z.array(z.string().min(1).max(120)).max(10).nullish().describe('Só depois de precisaConfirmar de categoria: os códigos escolhidos (ex.: ["[K1]"]).'),
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
  agruparPor: z.enum(AGRUPAMENTOS_DA_DESPESA).nullish().describe("Para rankings e quebras: FORNECEDOR, CATEGORIA, NATUREZA ou MES (mês a mês, em ordem)."),
  limite: z.number().int().min(1).max(10).nullish().describe("Quantos grupos mostrar no ranking (padrão 5). Não vale para MES."),
  listarLancamentos: z.boolean().nullish().describe(`true para listar até ${LANCAMENTOS_NA_LISTA} lançamentos considerados.`),
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

/** Como um nome vai para o modelo: fornecedor vira [F#], categoria vira [K#] (texto livre do ERP, pode ter nome de pessoa). */
type Nomear = (nome: string) => string;

function descreverCriterio(r: Extract<Resolucao, { tipo: "ENCONTRADO" }>, termo: string): string {
  if (r.criterio === "CONFIRMADO") return "nomes confirmados na conversa";
  if (r.criterio === "IGUAL") return "nome igual ao cadastrado (sem diferença de maiúsculas, acentos e espaços)";
  return `único nome cadastrado que contém ${termo}`;
}

function opcoesParaConfirmar(campo: "fornecedor" | "categoria", termo: string, r: Extract<Resolucao, { tipo: "AMBIGUO" }>, nomear: Nomear): ResultadoDaFerramenta {
  const lista = r.opcoes.map((o) => `${nomear(o.nome)} (${lancamentos(o.lancamentos)})`).join("; ");
  const resumo = `Encontrei mais de ${campo === "fornecedor" ? "um fornecedor" : "uma categoria"} para ${termo}: ${lista}. Quais devo considerar?`;
  return {
    tipo: "LIMITACAO",
    dados: {
      precisaConfirmar: {
        campo,
        termo,
        opcoes: r.opcoes.map((o) => ({ nome: nomear(o.nome), lancamentosNoHistorico: o.lancamentos, correspondencia: o.criterio.toLowerCase() })),
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
  nomear: Nomear,
  nomearTermo: Nomear,
): FiltroDeNome | ResultadoDaFerramenta | null {
  if (!termo && !confirmados?.length) return null;
  const r = resolverNome(termo, confirmados, cadastrados);
  const termoParaIA = termo ? `"${nomearTermo(termo)}"` : "";
  if (r.tipo === "AMBIGUO") return opcoesParaConfirmar(campo, termoParaIA, r, nomear);
  if (r.tipo === "ENCONTRADO") return { campo, criterio: descreverCriterio(r, termoParaIA), chaves: new Set(r.chaves), grafias: [...new Set(r.grafias)] };
  // Fornecedor fora do cadastro: procura na descrição dos lançamentos sem fornecedor.
  if (campo === "fornecedor" && termo && !confirmados?.length) {
    return { campo: "descricao", criterio: `${termoParaIA} encontrado na descrição de lançamentos sem fornecedor preenchido`, termo };
  }
  return { campo, criterio: "nenhum nome cadastrado corresponde", chaves: new Set(), grafias: [] };
}

function atende(filtro: FiltroDeNome | null, d: DespesaParaAnalise): boolean {
  if (!filtro) return true;
  if (filtro.campo === "descricao") return !d.fornecedor?.trim() && citaNaDescricao(d.descricao, filtro.termo);
  const valor = filtro.campo === "fornecedor" ? d.fornecedor : d.categoria;
  return Boolean(valor?.trim()) && filtro.chaves.has(normalizarParaBusca(valor!));
}

/** Os nomes de um filtro como vão para o modelo: um código por fornecedor (as grafias do mesmo nome dão um só). */
function nomesDoFiltro(f: Extract<FiltroDeNome, { campo: "fornecedor" | "categoria" }>, nomear: Nomear): string[] {
  return [...new Set(f.grafias.map(nomear))];
}

function descreverFiltro(f: FiltroDeNome, nomear: Nomear, nomearTermo: Nomear) {
  return f.campo === "descricao"
    ? { campoUsado: "descrição (o campo fornecedor desses lançamentos está vazio)", termo: nomearTermo(f.termo), criterio: f.criterio }
    : { campoUsado: f.campo, nomesConsiderados: nomesDoFiltro(f, nomear), criterio: f.criterio };
}

/** Um lançamento para o modelo: sem descrição (texto livre pode ter nome de cliente), fornecedor como código. */
function lancamentoParaIA(l: DespesaAnalisada, nomear: Nomear) {
  return {
    dia: l.dia ? dataCurta(l.dia) : "sem vencimento",
    valor: brl(l.centavos),
    natureza: NATUREZA_LABEL[l.natureza],
    situacao: l.paga ? "pago" : l.vencida ? "vencido" : "a vencer",
    fornecedor: l.fornecedor?.trim() ? nomear(l.fornecedor) : null,
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
 *
 * Em andamento é o período que contém hoje — inclusive o que já termina hoje
 * ("outubro até agora"): o dia de hoje ainda não acabou, e comparar com um
 * período inteiro precisa do aviso.
 */
function periodoConsiderado(p: PeriodoDeAnalise, situacao: SituacaoDaDespesa, hoje: string) {
  const emAndamento = p.de <= hoje && p.ate >= hoje;
  /** Começou e ainda não acabou depois de hoje: o pago é cortado em hoje. */
  const cortaEmHoje = p.de <= hoje && p.ate > hoje;
  const corta = situacao === "PAGO" && cortaEmHoje;
  const nota =
    corta
      ? "Pagos só até hoje: lançamento com data de pagamento futura não entra."
      : situacao === "TODOS" && cortaEmHoje
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
    "Despesas lançamento a lançamento, com filtros e contas feitas pelo servidor: fornecedor (procura no cadastro e na descrição), categoria, natureza, situação (pago, a pagar, vencido), qualquer período (\"últimos 3 meses\", \"este trimestre\", \"até agora\", intervalos), soma, quantidade, média, maior, menor, ranking/agrupamento (fornecedor, categoria, natureza, mês) e comparação entre períodos com variação. Use para TODA pergunta de despesa com recorte — fornecedor, categoria, situação, média, maior/menor, ranking, comparação. Devolve os filtros aplicados e a quantidade de lançamentos. Fornecedores vêm como códigos ([F1]).",
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

type Comparacao = { dados: Record<string, unknown>; frase: string };
type ContextoDaComparacao = {
  agora: Date;
  hoje: string;
  servicos: ServicosDoAssistente;
  situacao: SituacaoDaDespesa;
  filtros: (FiltroDeNome | null)[];
  naturezas: readonly NaturezaDoGasto[] | null;
};

/**
 * O outro período, com os mesmos filtros e a mesma situação, já lido — ou a
 * limitação. Não depende do período principal estar calculado: roda junto com ele.
 */
async function lerComparacao(args: Parametros, p: PeriodoDeAnalise, ctx: ContextoDaComparacao) {
  if (!args.compararCom) return null;
  const { agora, hoje, servicos, situacao, filtros, naturezas } = ctx;
  // O pago para em hoje: "mesmo período do ano anterior" e "período anterior"
  // partem do que já pôde ser pago. Período que ainda não começou não tem pago.
  const efetivo = situacao === "PAGO" ? { ...p, ate: ateRealizado({ ate: p.ate, hoje }) } : p;
  if (efetivo.ate < efetivo.de) return { limitacao: `${maiuscula(p.rotulo)} ainda não começou: não há valor pago para comparar.`, prefixo: "" };
  const rc = interpretarComparacao(args.compararCom, efetivo, agora, p.ate);
  if (!rc.ok) return { limitacao: rc.erro, prefixo: "Comparação não feita: " };
  const outro = (await analisar(servicos, rc.periodo, hoje, { ...args, agruparPor: null }, situacao, filtros, naturezas)).analise;
  return { pc: rc.periodo, outro };
}

/** A comparação montada: diferença, variação e o aviso de período parcial. */
function comparar(
  lida: Awaited<ReturnType<typeof lerComparacao>>,
  periodo: ReturnType<typeof periodoConsiderado>,
  a: AnaliseDeDespesas,
  situacao: SituacaoDaDespesa,
  hoje: string,
): Comparacao | null {
  if (!lida) return null;
  if ("limitacao" in lida) return { dados: { limitacao: lida.limitacao }, frase: ` ${lida.prefixo}${lida.limitacao}` };
  const { pc, outro } = lida;
  // A variação do Financeiro (diferença ÷ base); o percentual é arredondado a
  // uma casa a partir dos centavos, sem ponto flutuante na casa decimal.
  const diferenca = a.agregado.totalCentavos - outro.agregado.totalCentavos;
  const base = outro.agregado.totalCentavos;
  const periodoComparado = periodoConsiderado(pc, situacao, hoje);
  const decimos = base !== 0 ? Math.round((Math.abs(diferenca) * 1000) / Math.abs(base)) : null;
  const percentual = decimos === null ? null : `${diferenca > 0 ? "+" : diferenca < 0 ? "−" : ""}${Math.floor(decimos / 10)},${decimos % 10}%`;
  // O aviso vale quando um período está em andamento e os dois têm tamanhos
  // diferentes (21 dias de outubro × setembro inteiro). Janelas cortadas do
  // mesmo jeito ("últimos 90 dias" × os 90 anteriores) comparam igual com igual.
  const parciais = [periodo, periodoComparado].filter((x) => "emAndamento" in x).map((x) => x.rotulo);
  const diasPrincipal = diasConsiderados(periodo, situacao, hoje);
  const diasComparado = diasConsiderados(periodoComparado, situacao, hoje);
  // Fora de PAGO o período em andamento é sempre parcial: o pago dele para em
  // hoje e o a pagar ainda pode mudar, mesmo com o mesmo número de dias.
  const atencao =
    parciais.length && (situacao !== "PAGO" || diasPrincipal !== diasComparado)
      ? diasPrincipal !== diasComparado
        ? `Período em andamento (${parciais.join("; ")}): a comparação é entre períodos de tamanhos diferentes (${diasPrincipal} e ${diasComparado} dias).`
        : `Período em andamento (${parciais.join("; ")}): ${
            situacao === "A_PAGAR" ? "o a pagar ainda pode mudar até o fim do período" : situacao === "VENCIDO" ? "o vencido conta só até ontem" : "o pago vai só até hoje e o a pagar ainda pode mudar"
          }; a comparação é com um período parcial.`
      : null;
  return {
    dados: {
      periodo: periodoComparado,
      ...totais(outro),
      diferenca: diferenca === 0 ? "igual" : `${brl(Math.abs(diferenca))} ${diferenca > 0 ? "a mais" : "a menos"} em ${periodo.rotulo}`,
      variacaoPercentual: percentual,
      ...(decimos === null ? { semPercentual: base === 0 && a.agregado.totalCentavos === 0 ? "sem valores nos dois períodos" : "sem valor no período de comparação (base zero): não há percentual" } : {}),
      ...(atencao ? { atencao } : {}),
    },
    frase:
      ` ${periodoComparado.rotulo.startsWith("os ") ? `Nos ${periodoComparado.rotulo.slice(3)}` : `Em ${periodoComparado.rotulo}`}: ${outro.agregado.quantidade ? `${brl(base)} (${lancamentos(outro.agregado.quantidade)})` : "nenhum lançamento"}` +
      (percentual ? `; variação de ${percentual}.` : diferenca === 0 ? "." : "; sem base para percentual.") +
      (atencao ? ` Atenção: ${atencao}` : ""),
  };
}

/** Quantos dias o período cobre de fato: o pago para em hoje; o resto vai até o fim. */
function diasConsiderados(p: { de: string; ate: string }, situacao: SituacaoDaDespesa, hoje: string): number {
  // O pago para em hoje; o vencido, em ontem (vence antes de hoje); o a pagar vai até o fim.
  const ontem = new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const fim = situacao === "PAGO" && p.ate > hoje ? hoje : situacao === "VENCIDO" && p.ate >= hoje ? ontem : p.ate;
  return Math.max(0, Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${p.de}T12:00:00Z`)) / 86_400_000) + 1);
}

/** O que fica fora do total, com os mesmos filtros: dito à parte, nunca somado. */
function foraDoTotal(a: AnaliseDeDespesas, p: PeriodoDeAnalise) {
  const dados: Record<string, unknown> = {};
  let frase = "";
  const f = a.foraDoTotal;
  if (f.pagasComDataFutura.quantidade) {
    dados.pagosComDataFutura = {
      total: brl(f.pagasComDataFutura.totalCentavos),
      lancamentos: f.pagasComDataFutura.quantidade,
      nota: "Marcados como pagos com data depois de hoje: ainda não saíram do caixa. O painel Financeiro os soma no mês da data.",
    };
    frase += ` À parte, marcados como pagos com data depois de hoje: ${brl(f.pagasComDataFutura.totalCentavos)} (${lancamentos(f.pagasComDataFutura.quantidade)}).`;
  }
  if (f.vencidasAntesDoPeriodo.quantidade) {
    dados.vencidosAntesDoPeriodo = {
      total: brl(f.vencidasAntesDoPeriodo.totalCentavos),
      lancamentos: f.vencidasAntesDoPeriodo.quantidade,
      nota: `A pagar que venceram antes de ${dataCurta(p.de)} e continuam vencidos: dívida de períodos anteriores, fora do total do período.`,
    };
    frase += ` À parte, vencidos antes de ${dataCurta(p.de)}: ${brl(f.vencidasAntesDoPeriodo.totalCentavos)} (${lancamentos(f.vencidasAntesDoPeriodo.quantidade)}).`;
  }
  if (f.aPagarSemVencimento.quantidade) {
    dados.aPagarSemVencimento = {
      total: brl(f.aPagarSemVencimento.totalCentavos),
      lancamentos: f.aPagarSemVencimento.quantidade,
      nota: "A pagar sem vencimento: não pertencem a período nenhum.",
    };
    frase += ` À parte, a pagar sem vencimento: ${brl(f.aPagarSemVencimento.totalCentavos)} (${lancamentos(f.aPagarSemVencimento.quantidade)}).`;
  }
  return { dados, frase };
}

async function executarConsulta(args: Parametros, ctx: ContextoDaFerramenta): Promise<ResultadoDaFerramenta> {
  const { agora, servicos } = ctx;
  const hoje = diaEmChapeco(agora);
  const situacao = args.situacao ?? "PAGO";
  const naturezas = args.natureza?.length ? [...new Set(args.natureza)] : null;
  // Sem a tabela da conversa (testes, chamada isolada), uma tabela só desta consulta: nome nunca sai em claro.
  const tabela = tabelaDeCodigos(ctx);
  const nomear: Nomear = (nome) => tabela.codigo(nome);
  const nomearTermo: Nomear = (termo) => tabela.codigo(termo, { doCadastro: false });
  const nomearCategoria: Nomear = (nome) => tabela.codigo(nome, { tipo: "K" });
  const nomearTermoDeCategoria: Nomear = (termo) => tabela.codigo(termo, { tipo: "K", doCadastro: false });

  const rp = interpretarPeriodoDeAnalise(args.periodo, agora);
  if (!rp.ok) return limitacao(rp.erro, { exemplosDePeriodo: EXEMPLOS_DE_PERIODO });
  const p = rp.periodo;

  // Nomes: resolvidos antes de qualquer conta. Ambíguo para aqui, sem total.
  const precisaNomes = Boolean(args.fornecedor || args.fornecedoresConfirmados?.length || args.categoria || args.categoriasConfirmadas?.length);
  const nomes = precisaNomes ? await servicos.financeiro.nomesNasDespesas() : { fornecedores: [], categorias: [] };
  const filtroFornecedor = resolverFiltro("fornecedor", args.fornecedor, args.fornecedoresConfirmados, nomes.fornecedores, nomear, nomearTermo);
  if (filtroFornecedor && "dados" in filtroFornecedor) return filtroFornecedor;
  const filtroCategoria = resolverFiltro("categoria", args.categoria, args.categoriasConfirmadas, nomes.categorias, nomearCategoria, nomearTermoDeCategoria);
  if (filtroCategoria && "dados" in filtroCategoria) return filtroCategoria;
  const filtros = [filtroFornecedor as FiltroDeNome | null, filtroCategoria as FiltroDeNome | null];
  const filtrosDeNome = filtros.filter((f): f is FiltroDeNome => f !== null);

  // O período principal e o de comparação são lidos ao mesmo tempo.
  const lidaDaComparacao = lerComparacao(args, p, { agora, hoje, servicos, situacao, filtros, naturezas });
  // Se a leitura principal falhar antes de esperar a comparação, a falha desta não fica solta.
  lidaDaComparacao.catch(() => undefined);
  const { despesas, analise: a } = await analisar(servicos, p, hoje, args, situacao, filtros, naturezas);
  const periodo = periodoConsiderado(p, situacao, hoje);
  const fontes = [fonteDeDespesas(p)];
  const filtrosAplicados = {
    situacao: SITUACAO_CRITERIO[situacao],
    naturezas: naturezas ? naturezas.map((n) => NATUREZA_LABEL[n]) : "todas, separadas por natureza",
    ...(filtroFornecedor ? { fornecedor: descreverFiltro(filtroFornecedor as FiltroDeNome, nomear, nomearTermo) } : {}),
    ...(filtroCategoria ? { categoria: descreverFiltro(filtroCategoria as FiltroDeNome, nomearCategoria, nomearTermoDeCategoria) } : {}),
  };
  const criterios = [
    "Valores somados pelo servidor, em centavos, com as regras do Financeiro; a contagem é dos lançamentos considerados.",
    "O ERP não tem competência de despesa: pago conta no dia em que o dinheiro saiu; a pagar, no vencimento.",
    "Consumo e custeio compõem a despesa do Resultado Operacional; acervo é investimento e pró-labore fica fora do resultado.",
  ];

  // Com o mesmo filtro, o que fica fora do total e a comparação: entram
  // também quando o total do período é zero — "nada pago em outubro" não pode
  // esconder o pago com data futura, a dívida vencida antes ou o outro período.
  const fora = foraDoTotal(a, p);
  const comparacao = comparar(await lidaDaComparacao, periodo, a, situacao, hoje);

  // Filtro de nome sem nenhum lançamento no período: a ausência, sem total geral.
  if (filtrosDeNome.length && a.agregado.quantidade === 0) {
    const semNatureza = naturezas
      ? analisarDespesas(despesas, { de: p.de, ate: p.ate, hoje, situacao, naturezas: null, incluir: (d) => filtros.every((f) => atende(f, d)) })
      : null;
    const emOutrasNaturezas = semNatureza?.porNatureza.map((g) => ({ natureza: NATUREZA_LABEL[g.chave as NaturezaDoGasto], lancamentos: g.quantidade })) ?? [];
    const emOutraSituacao =
      situacao === "PAGO"
        ? analisarDespesas(despesas, { de: p.de, ate: p.ate, hoje, situacao: "A_PAGAR", naturezas, incluir: (d) => filtros.every((f) => atende(f, d)) }).agregado.quantidade
        : 0;
    const quem = [
      filtroFornecedor ? `do fornecedor ${args.fornecedor ? nomearTermo(args.fornecedor) : (args.fornecedoresConfirmados ?? []).map(nomear).join(", ")}` : null,
      filtroCategoria ? `da categoria ${args.categoria ? nomearTermoDeCategoria(args.categoria) : (args.categoriasConfirmadas ?? []).map(nomearCategoria).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" e ");
    const recorte = naturezas ? ` em ${naturezas.map((n) => NATUREZA_LABEL[n]).join(" ou ")}` : "";
    const ondeProcurou =
      filtroFornecedor && (filtroFornecedor as FiltroDeNome).campo === "descricao" ? " (nem no cadastro de fornecedores, nem na descrição)" : "";
    let mensagem = `Não encontrei lançamentos ${SITUACAO_CURTA[situacao]} ${quem}${ondeProcurou}${recorte} em ${periodo.rotulo}.`;
    if (emOutrasNaturezas.length) {
      mensagem += ` Há ${emOutrasNaturezas.map((o) => `${lancamentos(o.lancamentos)} em ${o.natureza}`).join(" e ")} — posso somar esses, se quiser.`;
    }
    if (emOutraSituacao) mensagem += ` Há ${lancamentos(emOutraSituacao)} ainda a pagar nesse período.`;
    const resumo = mensagem + fora.frase + (comparacao?.frase ?? "") + (periodo.observacao ? ` Obs.: ${periodo.observacao}` : "");
    return {
      dados: {
        periodo,
        filtrosAplicados,
        semCorrespondencia: {
          mensagem,
          ...(emOutrasNaturezas.length ? { emOutrasNaturezas } : {}),
          ...(emOutraSituacao ? { aPagarNoPeriodo: emOutraSituacao } : {}),
          instrucao:
            "Diga que não há lançamentos com esses filtros no período. Não cite total geral: só podem ser ditos os valores de foraDoTotal e comparacao, que têm os mesmos filtros. Ofereça só o que vier em emOutrasNaturezas ou aPagarNoPeriodo.",
        },
        ...(Object.keys(fora.dados).length ? { foraDoTotal: fora.dados } : {}),
        ...(comparacao ? { comparacao: comparacao.dados } : {}),
        resumo,
        criterios,
      },
      fontes,
    };
  }

  const resultado: Record<string, unknown> = {
    ...totais(a),
    mediaPorLancamento: a.agregado.mediaCentavos === null ? null : brl(a.agregado.mediaCentavos),
    ...(a.agregado.maior ? { maior: lancamentoParaIA(a.agregado.maior, nomear) } : {}),
    ...(a.agregado.menor && a.agregado.quantidade > 1 ? { menor: lancamentoParaIA(a.agregado.menor, nomear) } : {}),
    porNatureza: a.porNatureza.map((g) => ({ natureza: NATUREZA_LABEL[g.chave as NaturezaDoGasto], total: brl(g.totalCentavos), lancamentos: g.quantidade })),
    ...(!naturezas || naturezas.length > 1
      ? { despesaOperacional: { criterio: "consumo + custeio", total: brl(a.despesaOperacional.totalCentavos), lancamentos: a.despesaOperacional.quantidade } }
      : {}),
    ...(a.mediaMensalCentavos !== null && a.mesesEquivalentes > 1
      ? {
          mediaMensal: {
            valor: brl(a.mediaMensalCentavos),
            meses: emMeses(a.mesesEquivalentes),
            criterio: "Total pago ÷ meses do período, cada mês contado pela fração de dias considerados (o mês em andamento, até hoje).",
          },
        }
      : {}),
  };
  if (situacao !== "PAGO") {
    resultado.porSituacao = {
      pago: { total: brl(a.porSituacao.pago.totalCentavos), lancamentos: a.porSituacao.pago.quantidade },
      vencido: { total: brl(a.porSituacao.vencido.totalCentavos), lancamentos: a.porSituacao.vencido.quantidade },
      aVencer: { total: brl(a.porSituacao.aVencer.totalCentavos), lancamentos: a.porSituacao.aVencer.quantidade },
    };
  }
  let fraseDosGrupos = "";
  if (a.agrupado) {
    const grafias = args.agruparPor === "FORNECEDOR" || args.agruparPor === "CATEGORIA" ? grafiaMaisUsada(a.linhas, args.agruparPor) : null;
    const nomeDoGrupo = (chave: string) => {
      if (args.agruparPor === "NATUREZA") return NATUREZA_LABEL[chave as NaturezaDoGasto];
      if (args.agruparPor === "MES") return `${chave.slice(5, 7)}/${chave.slice(0, 4)}`;
      if (!chave) return args.agruparPor === "FORNECEDOR" ? "(sem fornecedor preenchido)" : "(sem categoria)";
      const nome = grafias?.get(chave) ?? chave;
      return args.agruparPor === "FORNECEDOR" ? nomear(nome) : nomearCategoria(nome);
    };
    const grupos = a.agrupado.grupos.map((g) => ({ nome: nomeDoGrupo(g.chave), total: brl(g.totalCentavos), lancamentos: g.quantidade }));
    resultado.grupos = grupos;
    const outros = a.agrupado.outros;
    if (outros) {
      resultado.outros = {
        ...(args.agruparPor === "MES" ? { criterio: `meses anteriores a ${grupos[0]?.nome}` } : {}),
        grupos: outros.grupos,
        total: brl(outros.totalCentavos),
        lancamentos: outros.quantidade,
      };
    }
    const porQue = { FORNECEDOR: "fornecedor", CATEGORIA: "categoria", NATUREZA: "natureza", MES: "mês" }[args.agruparPor!];
    if (grupos.length) {
      fraseDosGrupos =
        ` Por ${porQue}: ${grupos.map((g) => `${g.nome} ${g.total}`).join("; ")}` +
        (outros ? `; ${args.agruparPor === "MES" ? "meses anteriores" : `outros (${outros.grupos})`} ${brl(outros.totalCentavos)}` : "") +
        ".";
    }
  }
  if (args.listarLancamentos) {
    // A contagem continua em `lancamentos`; a lista é outro campo.
    resultado.listaDeLancamentos = a.linhas.slice(0, LANCAMENTOS_NA_LISTA).map((l) => lancamentoParaIA(l, nomear));
    if (a.linhas.length > LANCAMENTOS_NA_LISTA) {
      // A quantidade é a do total; o tamanho da amostra só confere numa frase que fale da amostra (ver conferencia.ts).
      resultado.listaCortada = `Amostra com os ${lancamentos(LANCAMENTOS_NA_LISTA)} mais recentes, de ${lancamentos(a.linhas.length)} no total.`;
    }
  }

  // Lançamentos sem fornecedor que citam o termo na descrição, quando o cadastro achou o fornecedor.
  let tambemNaDescricao: Record<string, unknown> | null = null;
  let fraseDaDescricao = "";
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
        nota: `Lançamentos SEM fornecedor preenchido que citam ${nomearTermo(args.fornecedor)} na descrição. Não estão no total acima; diga que existem e pergunte se devem ser somados.`,
      };
      fraseDaDescricao = ` Há também ${lancamentos(extra.agregado.quantidade)} sem fornecedor que citam ${nomearTermo(args.fornecedor)} na descrição (${brl(extra.agregado.totalCentavos)}), fora do total.`;
    }
  }

  const quem = filtrosDeNome
    .map((f) =>
      f.campo === "descricao"
        ? ` citando ${nomearTermo(f.termo)} na descrição`
        : f.campo === "fornecedor"
          ? ` do fornecedor ${nomesDoFiltro(f, nomear).join(" / ")}`
          : ` da categoria ${nomesDoFiltro(f, nomearCategoria).join(" / ")}`,
    )
    .join("");
  const deNatureza = naturezas ? ` de ${naturezas.map((n) => NATUREZA_LABEL[n]).join(" e ")}` : "";
  const separacao =
    !naturezas && a.porNatureza.length > 1 ? ` Por natureza: ${a.porNatureza.map((g) => `${NATUREZA_LABEL[g.chave as NaturezaDoGasto]} ${brl(g.totalCentavos)}`).join(", ")}.` : "";
  const situacoes =
    situacao !== "PAGO" && a.agregado.quantidade
      ? ` Pago: ${brl(a.porSituacao.pago.totalCentavos)}; vencido: ${brl(a.porSituacao.vencido.totalCentavos)}; a vencer: ${brl(a.porSituacao.aVencer.totalCentavos)}.`
      : "";
  const media = a.mediaMensalCentavos !== null && a.mesesEquivalentes > 1 ? ` Média mensal: ${brl(a.mediaMensalCentavos)} (${emMeses(a.mesesEquivalentes)}).` : "";
  const extremos =
    a.agregado.quantidade > 1 && a.agregado.maior?.dia && a.agregado.menor?.dia
      ? ` Maior: ${brl(a.agregado.maior.centavos)} (${dataCurta(a.agregado.maior.dia)}); menor: ${brl(a.agregado.menor.centavos)} (${dataCurta(a.agregado.menor.dia)}).`
      : "";
  const resumo =
    `${maiuscula(periodo.rotulo)}: ${lancamentos(a.agregado.quantidade)}${deNatureza}${quem}, total ${brl(a.agregado.totalCentavos)} (${SITUACAO_CURTA[situacao]}).` +
    separacao +
    situacoes +
    (situacao !== "PAGO" && periodo.notaDoCorte ? ` ${periodo.notaDoCorte}` : "") +
    media +
    fraseDosGrupos +
    extremos +
    fora.frase +
    fraseDaDescricao +
    (comparacao?.frase ?? "") +
    (periodo.observacao ? ` Obs.: ${periodo.observacao}` : "");

  return {
    dados: {
      periodo,
      filtrosAplicados,
      resultado,
      ...(Object.keys(fora.dados).length ? { foraDoTotal: fora.dados } : {}),
      ...(tambemNaDescricao ? { tambemNaDescricao } : {}),
      ...(comparacao ? { comparacao: comparacao.dados } : {}),
      resumo,
      criterios,
    },
    fontes,
  };
}
