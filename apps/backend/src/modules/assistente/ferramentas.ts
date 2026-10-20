import { z } from "zod";
import {
  diaEmChapeco,
  formatarReais,
  fromCentsInt,
  mesEmChapeco,
  numeroDoContrato,
  receitaPorCompetencia,
  SITUACAO_DE_PAGAMENTO_LABEL,
  SITUACOES_EM_ABERTO,
  toCentsInt,
  totalAReceber,
  type SituacaoDePagamento,
} from "@festae/shared";
import type { FinanceiroService } from "../financeiro/financeiro.service";
import type { ComercialService } from "../comercial/comercial.service";
import type { PanoramaDeOrcamentosService } from "../orcamentos/panorama.service";
import type { OrcamentosService } from "../orcamentos/orcamentos.service";
import type { AcervoService } from "../acervo/acervo.service";
import type { AvailabilityService } from "../availability/availability.service";
import type { ProductsService } from "../products/products.service";
import type { LinhaDaCarteira } from "../financeiro/contratos";
import {
  MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA,
  type FonteDaResposta,
  type PapelAutorizado,
} from "./contrato";
import { interpretarPeriodo, normalizar, rotuloDoDia, situacaoDoPeriodo, type Periodo } from "./periodo";

/**
 * O catálogo de ferramentas do Assistente IA.
 *
 * A IA não toca no banco: ela escolhe uma ferramenta desta lista e preenche
 * os parâmetros; o servidor valida os parâmetros, confere o papel de quem
 * pergunta e chama o MESMO serviço que a tela correspondente chama. Nenhuma
 * fórmula financeira mora aqui — só a escolha de qual número devolver e com
 * qual critério explicá-lo.
 *
 * O papel de cada ferramenta é o do endpoint que já mostra aquele dado: o
 * assistente nunca abre para OPS o que a tela não abre.
 */

/** Os serviços de que as ferramentas dependem — só leitura. Uma interface, para os testes trocarem. */
export type ServicosDoAssistente = {
  financeiro: Pick<FinanceiroService, "panorama" | "despesasPorNatureza">;
  comercial: Pick<ComercialService, "visaoGeral">;
  panoramaDeOrcamentos: Pick<PanoramaDeOrcamentosService, "panorama">;
  orcamentos: Pick<OrcamentosService, "seguradoPorAprovadas">;
  acervo: Pick<AcervoService, "performance">;
  disponibilidade: Pick<AvailabilityService, "conflitosDeItens">;
  produtos: Pick<ProductsService, "findAll">;
  /** A carteira de contratos, a mesma que Financeiro e Comercial leem. */
  carteira(agora: Date): Promise<{ linha: LinhaDaCarteira; canceladaEm: Date | null }[]>;
};

export type ContextoDaFerramenta = {
  papel: PapelAutorizado;
  agora: Date;
  servicos: ServicosDoAssistente;
};

export type ResultadoDaFerramenta = {
  /** O que vai para o modelo. Dados já calculados e formatados; nunca linhas cruas do banco. */
  dados: Record<string, unknown>;
  fontes: FonteDaResposta[];
  /** LIMITACAO quando faltou informação para responder; RECUSA quando é pedido de operação. */
  tipo?: "LIMITACAO" | "RECUSA";
};

export type Ferramenta<P extends z.ZodType = z.ZodType> = {
  nome: string;
  descricao: string;
  /** Nesta fase só existe LEITURA. Um teste garante que nenhuma ESCRITA entra no catálogo. */
  natureza: "LEITURA" | "ESCRITA";
  papeis: readonly PapelAutorizado[];
  parametros: P;
  executar(args: z.infer<P>, ctx: ContextoDaFerramenta): Promise<ResultadoDaFerramenta>;
};

/** Quantas festas uma lista leva para o modelo. O resto vira contagem e link. */
export const LIMITE_DA_LISTA = 25;

// ---------------------------------------------------------------- utilidades

const brl = (valor: number) => formatarReais(valor);

function percentual(valor: number | null): string | null {
  return valor === null ? null : `${(valor * 100).toFixed(1).replace(".", ",")}%`;
}

function somaDe(valores: readonly number[]): number {
  return fromCentsInt(valores.reduce((s, v) => s + toCentsInt(v), 0));
}

/**
 * Só o primeiro nome da cliente vai para a IA externa.
 *
 * É o suficiente para a gestora reconhecer a festa ("a da Renata, sábado") e
 * é o mínimo de dado pessoal fora de casa. Telefone, e-mail e endereço nunca
 * saem.
 */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

const ETAPA_LABEL: Record<string, string> = {
  PENDING: "Solicitação",
  CONFIRMED: "Confirmada",
  PREPARING: "Em preparação",
  READY: "Pronta para retirada/entrega",
  AGUARDANDO_DEVOLUCAO: "Aguardando devolução",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  REJECTED: "Recusada",
};

function dataCurta(dia: string): string {
  return rotuloDoDia(dia);
}

/**
 * Os períodos que cada ferramenta realmente consulta, ditos para a pessoa.
 *
 * Vão junto de toda limitação de período: o modelo oferece só o que está
 * aqui, em vez de inventar um formato que o servidor também não entende.
 */
const ALTERNATIVAS_MES_OU_ANO = ['um mês inteiro (ex.: "outubro", "mês passado")', 'um ano (ex.: "2026", "este ano")'];
const ALTERNATIVAS_DE_DATAS = [
  'um dia (ex.: "14/11", "amanhã")',
  'uma semana (ex.: "esta semana", "próxima semana")',
  'um mês inteiro (ex.: "novembro")',
  'um ano (ex.: "2026")',
];
const ALTERNATIVAS_DE_DIA = ['um dia (ex.: "14/11", "próximo sábado")'];

function periodoOuErro(expressao: string, agora: Date, alternativas: readonly string[]): { periodo: Periodo } | { erro: ResultadoDaFerramenta } {
  const r = interpretarPeriodo(expressao, agora);
  if (r.ok) return { periodo: r.periodo };
  return { erro: limitacao(r.erro, [], alternativas) };
}

function limitacao(motivo: string, fontes: FonteDaResposta[] = [], alternativas?: readonly string[]): ResultadoDaFerramenta {
  return { tipo: "LIMITACAO", dados: { limitacao: motivo, ...(alternativas ? { alternativasDisponiveis: alternativas } : {}) }, fontes };
}

function descreverPeriodo(p: Periodo, agora: Date) {
  return {
    rotulo: p.rotulo,
    de: p.de,
    ate: p.ate,
    situacao: situacaoDoPeriodo(p, agora),
    ...(p.observacao ? { observacao: p.observacao } : {}),
  };
}

function linkDaReserva(numero: number): FonteDaResposta {
  return { rotulo: numeroDoContrato(numero), caminho: `/reservas?aba=TODAS&busca=${numero}` };
}

/** Uma festa como a IA a recebe: o mínimo para reconhecer e responder. */
function festaParaIA(l: LinhaDaCarteira) {
  const c = l.comercial;
  return {
    contrato: numeroDoContrato(c.numero),
    data: dataCurta(c.festaEm),
    cliente: primeiroNome(c.cliente.nome),
    etapa: ETAPA_LABEL[c.status] ?? c.status,
    pagamento: SITUACAO_DE_PAGAMENTO_LABEL[c.situacao],
    valor: brl(c.valor),
    saldo: brl(c.saldo),
  };
}

function contar<T>(itens: readonly T[], chave: (item: T) => string): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const item of itens) contagem[chave(item)] = (contagem[chave(item)] ?? 0) + 1;
  return contagem;
}

const periodoParam = z
  .string()
  .min(1)
  .max(60)
  .describe(
    'Expressão de período como a pessoa disse ou ISO: "hoje", "amanhã", "próximo sábado", "este mês", "mês passado", "novembro", "novembro de 2027", "14/11", "2026-11", "2026". O servidor resolve no fuso de Chapecó.',
  );

// ---------------------------------------------------------------- financeiro

const CRITERIOS_FINANCEIROS = [
  "Faturamento por competência: festas vigentes com data no período; canceladas e recusadas não entram.",
  "Retenção por cancelamento é receita separada do faturamento das festas.",
  "Resultado Operacional = faturamento + retenção − despesas de consumo e custeio. Não é lucro líquido: não considera impostos, pró-labore nem depreciação. Acervo é investimento e não entra.",
  "Caixa: pagamentos confirmados (PAID) no período menos reembolsos efetivamente realizados no período. Reembolso a realizar ainda não saiu do caixa. Crédito Festaê não é entrada de caixa nem desconto.",
  "A receber e crédito em aberto das clientes são a posição de hoje, não do período.",
];

function avisoDeSituacao(situacao: ReturnType<typeof situacaoDoPeriodo>): string | null {
  if (situacao === "FUTURO") return "Período futuro: o faturamento é CONTRATADO (previsão), ainda não realizado.";
  if (situacao === "EM_ANDAMENTO") {
    return "Período em andamento: o faturamento por competência soma as festas já realizadas e as ainda agendadas (contratadas, não realizadas). Não é \"até agora\".";
  }
  return null;
}

/**
 * O faturamento por competência do mês em andamento, separado em festas já
 * realizadas (antes de hoje) e ainda agendadas (de hoje até o fim do mês).
 *
 * É a mesma `receitaPorCompetencia` do Financeiro aplicada às duas metades da
 * carteira — nenhuma fórmula nova. Se as metades não fecharem com o total do
 * Financeiro, a divisão não vai: um número que não bate com a tela é pior que
 * nenhum.
 */
async function divisaoDoMesEmAndamento(mes: string, faturamento: number, agora: Date, servicos: ServicosDoAssistente) {
  const hoje = diaEmChapeco(agora);
  const doMes = (await servicos.carteira(agora))
    .map((x) => x.linha.apurado)
    .filter((c) => !c.cancelado && mesEmChapeco(c.festaEm) === mes);
  const realizadas = doMes.filter((c) => diaEmChapeco(c.festaEm) < hoje);
  const agendadas = doMes.filter((c) => diaEmChapeco(c.festaEm) >= hoje);
  const valorRealizadas = receitaPorCompetencia(realizadas, mes);
  const valorAgendadas = receitaPorCompetencia(agendadas, mes);
  if (toCentsInt(valorRealizadas) + toCentsInt(valorAgendadas) !== toCentsInt(faturamento)) return null;
  return {
    festasJaRealizadas: { festas: realizadas.length, valor: brl(valorRealizadas), criterio: "Festas com data antes de hoje." },
    festasAindaAgendadas: {
      festas: agendadas.length,
      valor: brl(valorAgendadas),
      criterio: "Festas de hoje até o fim do mês: valor contratado, ainda não realizado.",
    },
  };
}

const consultarFinanceiro: Ferramenta<z.ZodObject<{ periodo: typeof periodoParam }>> = {
  nome: "consultarFinanceiro",
  descricao:
    "Indicadores financeiros de um MÊS-CALENDÁRIO ou ANO, iguais aos do Financeiro: faturamento por competência (realizado ou contratado), retenção por cancelamento, despesas (consumo, custeio), Resultado Operacional e margem, caixa (entradas PAID, reembolsos realizados), investimento em acervo, festas e ticket médio do mês, e a posição de hoje (a receber, crédito Festaê em aberto das clientes). Use para faturamento, contratado de um mês (inclusive \"contratado para o mês que vem\" ou \"para novembro\": o mês inteiro), recebimentos, a receber, resultado, despesas, acervo investido e crédito das clientes.",
  natureza: "LEITURA",
  papeis: ["ADMIN"],
  parametros: z.object({ periodo: periodoParam }),
  async executar({ periodo: expressao }, { agora, servicos }) {
    const r = periodoOuErro(expressao, agora, ALTERNATIVAS_MES_OU_ANO);
    if ("erro" in r) return r.erro;
    const p = r.periodo;
    if (p.tipo === "INTERVALO") {
      return limitacao("O Financeiro é apurado por mês ou por ano; não por semana nem por intervalo de dias.", [], ALTERNATIVAS_MES_OU_ANO);
    }
    const mesAtual = diaEmChapeco(agora).slice(0, 7);

    if (p.tipo === "ANO") {
      const ano = Number(p.de.slice(0, 4));
      const ateMes = String(ano) === mesAtual.slice(0, 4) ? mesAtual : `${ano}-12`;
      const panorama = await servicos.financeiro.panorama(ano, ateMes);
      const situacao = situacaoDoPeriodo(p, agora);
      return {
        dados: {
          periodo: { ...descreverPeriodo(p, agora), acumuladoAte: ateMes },
          acumuladoDoAno: {
            faturamentoDasFestas: brl(panorama.ytd.faturamento),
            retencaoPorCancelamento: brl(panorama.ytd.retencao),
            despesas: brl(panorama.ytd.despesas),
            resultadoOperacional: brl(panorama.ytd.resultado),
            margemOperacional: percentual(panorama.ytd.margem),
            investimentoEmAcervo: brl(panorama.ytd.acervo),
          },
          posicaoDeHoje: {
            aReceber: brl(panorama.aReceber),
            creditoFestaeEmAbertoDasClientes: brl(panorama.creditoEmAberto),
          },
          criterios: [
            `Acumulado de janeiro até ${ateMes}.`,
            ...(avisoDeSituacao(situacao) ? [avisoDeSituacao(situacao)] : []),
            ...CRITERIOS_FINANCEIROS,
          ],
        },
        fontes: [{ rotulo: `Financeiro · ${ano}`, caminho: `/financeiro?aba=evolucao&ano=${ano}` }],
      };
    }

    const mes = p.meses[0];
    const ano = Number(mes.slice(0, 4));
    const [panorama, despesas] = await Promise.all([
      servicos.financeiro.panorama(ano, mes),
      servicos.financeiro.despesasPorNatureza(mes),
    ]);
    const periodoDoMes = interpretarPeriodo(mes, agora);
    const descricao = descreverPeriodo(periodoDoMes.ok ? periodoDoMes.periodo : p, agora);
    const aviso = avisoDeSituacao(descricao.situacao);
    const divisao =
      descricao.situacao === "EM_ANDAMENTO" ? await divisaoDoMesEmAndamento(mes, panorama.operacional.faturamento, agora, servicos) : null;
    return {
      dados: {
        periodo: {
          ...descricao,
          ...(p.tipo === "DIA" ? { observacao: `O Financeiro é mensal: usei o mês inteiro de ${descricao.rotulo}.` } : {}),
          ...(p.observacao ? { observacao: p.observacao } : {}),
        },
        competencia: {
          faturamentoDasFestas: brl(panorama.operacional.faturamento),
          ...(divisao ? { divisaoDoMesEmAndamento: divisao } : {}),
          retencaoPorCancelamento: brl(panorama.operacional.retencao),
          despesas: { total: brl(despesas.total), consumo: brl(despesas.consumo), custeio: brl(despesas.custeio) },
          resultadoOperacional: brl(panorama.operacional.resultado),
          margemOperacional: percentual(panorama.operacional.margem),
          festasNoMes: panorama.festasNoMes,
          ticketMedio: panorama.ticketMedio === null ? null : brl(panorama.ticketMedio),
        },
        caixaDoMes: {
          entradasConfirmadas: brl(panorama.caixa.entradas),
          reembolsosRealizados: brl(panorama.caixa.reembolsos),
          liquido: brl(panorama.caixa.liquido),
          reembolsosARealizar: brl(panorama.caixa.reembolsosARealizar),
        },
        investimentoEmAcervo: { noMes: brl(despesas.acervo), acumulado: brl(panorama.acervoAcumulado) },
        posicaoDeHoje: {
          aReceber: brl(panorama.aReceber),
          creditoFestaeEmAbertoDasClientes: brl(panorama.creditoEmAberto),
        },
        meta: panorama.meta ? { valor: brl(panorama.meta.valor), realizado: brl(panorama.meta.realizado) } : null,
        criterios: [...(aviso ? [aviso] : []), ...CRITERIOS_FINANCEIROS],
      },
      fontes: [{ rotulo: `Financeiro · ${descricao.rotulo}`, caminho: `/financeiro?ano=${ano}&mes=${mes.slice(5)}` }],
    };
  },
};

const consultarCarteiraFutura: Ferramenta<z.ZodObject<Record<string, never>>> = {
  nome: "consultarCarteiraFutura",
  descricao:
    "A carteira futura da Visão Geral Comercial: festas vigentes de hoje até o fim de uma janela móvel de dias (NÃO é um mês-calendário), com valor contratado, já recebido e a receber. Use SÓ para \"quanto temos contratado daqui para frente\", sem mês nem período citado. Se a pessoa citar um mês ou período (\"mês que vem\", \"próximo mês\", \"novembro\", \"este mês\"), não use esta: use consultarFinanceiro com esse período.",
  natureza: "LEITURA",
  papeis: ["ADMIN"],
  parametros: z.object({}),
  async executar(_args, { agora, servicos }) {
    const mes = diaEmChapeco(agora).slice(0, 7);
    const visao = await servicos.comercial.visaoGeral(Number(mes.slice(0, 4)), mes);
    const c = visao.carteiraFutura;
    return {
      dados: {
        janela: { de: c.de, ate: c.ate, dias: c.dias },
        festas: c.festas,
        contratado: brl(c.contratado),
        jaRecebido: brl(c.recebido),
        aReceber: brl(c.aReceber),
        criterios: [
          "Festas vigentes com data a partir de hoje, dentro da janela informada.",
          "Carteira futura é valor CONTRATADO: não é faturamento realizado.",
        ],
      },
      fontes: [{ rotulo: "Visão Geral Comercial", caminho: "/comercial" }],
    };
  },
};

// ---------------------------------------------------------------- reservas

const SITUACOES_FILTRAVEIS = ["QUITADO", "PARCIAL", "AGUARDANDO", "VENCIDO", "EM_ABERTO"] as const;

const consultarFestas: Ferramenta<
  z.ZodObject<{ periodo: typeof periodoParam; situacaoDePagamento: z.ZodOptional<z.ZodEnum<{ [K in (typeof SITUACOES_FILTRAVEIS)[number]]: K }>> }>
> = {
  nome: "consultarFestas",
  descricao:
    "Festas (reservas vigentes) com data num período: quantidade, quantas estão quitadas, com sinal, aguardando pagamento ou vencidas, as etapas, e a lista com contrato, data, primeiro nome da cliente, etapa e situação de pagamento. Use para \"quantas festas em novembro\", \"temos festa dia 14/11\", \"festas de amanhã\", \"quantas já estão pagas\". Canceladas não entram (para elas use consultarCancelamentos).",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({
    periodo: periodoParam,
    situacaoDePagamento: z
      .enum(SITUACOES_FILTRAVEIS)
      .optional()
      .describe("Filtra a lista: QUITADO (pagas), PARCIAL (sinal recebido), AGUARDANDO (nada pago), VENCIDO, EM_ABERTO (qualquer saldo)."),
  }),
  async executar({ periodo: expressao, situacaoDePagamento }, { agora, papel, servicos }) {
    const r = periodoOuErro(expressao, agora, ALTERNATIVAS_DE_DATAS);
    if ("erro" in r) return r.erro;
    const p = r.periodo;
    const carteira = await servicos.carteira(agora);
    const doPeriodo = carteira
      .map((x) => x.linha)
      .filter((l) => l.comercial.vigente && l.comercial.festaEm >= p.de && l.comercial.festaEm <= p.ate)
      .sort((a, b) => a.comercial.festaEm.localeCompare(b.comercial.festaEm) || a.comercial.numero - b.comercial.numero);

    const filtrada = situacaoDePagamento
      ? doPeriodo.filter((l) =>
          situacaoDePagamento === "EM_ABERTO"
            ? SITUACOES_EM_ABERTO.includes(l.comercial.situacao)
            : l.comercial.situacao === situacaoDePagamento,
        )
      : doPeriodo;

    const porSituacao = contar(doPeriodo, (l) => SITUACAO_DE_PAGAMENTO_LABEL[l.comercial.situacao]);
    const fontes: FonteDaResposta[] =
      papel === "ADMIN" && p.tipo === "MES"
        ? [{ rotulo: `Contratos · ${p.rotulo}`, caminho: `/financeiro?aba=contratos&ano=${p.de.slice(0, 4)}&mes=${p.de.slice(5, 7)}` }]
        : [{ rotulo: "Reservas", caminho: "/reservas?aba=TODAS" }];
    if (filtrada.length > 0 && filtrada.length <= 5) fontes.push(...filtrada.map((l) => linkDaReserva(l.comercial.numero)));

    return {
      dados: {
        periodo: descreverPeriodo(p, agora),
        festas: doPeriodo.length,
        porSituacaoDePagamento: porSituacao,
        porEtapa: contar(doPeriodo, (l) => ETAPA_LABEL[l.comercial.status] ?? l.comercial.status),
        ...(papel === "ADMIN" ? { valorContratadoDasFestas: brl(somaDe(doPeriodo.map((l) => l.comercial.valor))) } : {}),
        ...(situacaoDePagamento ? { filtro: situacaoDePagamento, festasNoFiltro: filtrada.length } : {}),
        lista: filtrada.slice(0, LIMITE_DA_LISTA).map(festaParaIA),
        ...(filtrada.length > LIMITE_DA_LISTA ? { listaCortada: `Mostrando ${LIMITE_DA_LISTA} de ${filtrada.length}.` } : {}),
        criterios: [
          "Festas vigentes: solicitação, confirmada, em preparação, pronta, aguardando devolução e concluída. Canceladas e recusadas não entram.",
          "Pagamento como na carteira: Quitado; Sinal recebido (parcial); Aguardando (nada pago); Vencido (a festa passou com saldo). Crédito Festaê aplicado conta como parte coberta, não como pagamento.",
        ],
      },
      fontes,
    };
  },
};

const consultarCancelamentos: Ferramenta<z.ZodObject<{ periodo: typeof periodoParam }>> = {
  nome: "consultarCancelamentos",
  descricao:
    "Reservas canceladas ou recusadas cujo cancelamento foi registrado no período, e quantas delas tinham a festa no próprio período. Use para \"quantas festas foram canceladas no mês\".",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({ periodo: periodoParam }),
  async executar({ periodo: expressao }, { agora, servicos }) {
    const r = periodoOuErro(expressao, agora, ALTERNATIVAS_DE_DATAS);
    if ("erro" in r) return r.erro;
    const p = r.periodo;
    const carteira = await servicos.carteira(agora);
    const mortas = carteira.filter((x) => x.linha.comercial.status === "CANCELLED" || x.linha.comercial.status === "REJECTED");
    const noPeriodo = mortas.filter((x) => {
      if (!x.canceladaEm) return false;
      const dia = diaEmChapeco(x.canceladaEm);
      return dia >= p.de && dia <= p.ate;
    });
    const comFestaNoPeriodo = noPeriodo.filter((x) => x.linha.comercial.festaEm >= p.de && x.linha.comercial.festaEm <= p.ate);
    return {
      dados: {
        periodo: descreverPeriodo(p, agora),
        cancelamentosRegistrados: noPeriodo.length,
        canceladas: noPeriodo.filter((x) => x.linha.comercial.status === "CANCELLED").length,
        recusadas: noPeriodo.filter((x) => x.linha.comercial.status === "REJECTED").length,
        comFestaNoProprioPeriodo: comFestaNoPeriodo.length,
        lista: noPeriodo.slice(0, LIMITE_DA_LISTA).map((x) => ({
          contrato: numeroDoContrato(x.linha.comercial.numero),
          cliente: primeiroNome(x.linha.comercial.cliente.nome),
          dataDaFesta: dataCurta(x.linha.comercial.festaEm),
          canceladaEm: x.canceladaEm ? dataCurta(diaEmChapeco(x.canceladaEm)) : null,
          etapa: ETAPA_LABEL[x.linha.comercial.status],
        })),
        criterios: [
          "Contado pela data em que o cancelamento foi registrado, não pela data da festa.",
          "Canceladas ficam fora do faturamento das festas; o que foi retido aparece como retenção por cancelamento no Financeiro.",
        ],
      },
      fontes: [{ rotulo: "Reservas canceladas", caminho: "/reservas?aba=CANCELADAS" }],
    };
  },
};

const consultarPendencias: Ferramenta<z.ZodObject<{ tipo: z.ZodEnum<{ AGUARDANDO_DEVOLUCAO: "AGUARDANDO_DEVOLUCAO"; SALDO_EM_ABERTO: "SALDO_EM_ABERTO" }> }>> = {
  nome: "consultarPendencias",
  descricao:
    "Pendências de hoje: reservas aguardando devolução do material (AGUARDANDO_DEVOLUCAO) ou reservas vigentes com saldo a receber (SALDO_EM_ABERTO), separando vencidas (a festa já passou) das que ainda vão vencer.",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({ tipo: z.enum(["AGUARDANDO_DEVOLUCAO", "SALDO_EM_ABERTO"]) }),
  async executar({ tipo }, { agora, papel, servicos }) {
    const carteira = (await servicos.carteira(agora)).map((x) => x.linha).filter((l) => l.comercial.vigente);
    const porData = (a: LinhaDaCarteira, b: LinhaDaCarteira) => a.comercial.festaEm.localeCompare(b.comercial.festaEm);

    if (tipo === "AGUARDANDO_DEVOLUCAO") {
      const lista = carteira.filter((l) => l.comercial.status === "AGUARDANDO_DEVOLUCAO").sort(porData);
      return {
        dados: {
          posicaoEm: dataCurta(diaEmChapeco(agora)),
          aguardandoDevolucao: lista.length,
          lista: lista.slice(0, LIMITE_DA_LISTA).map(festaParaIA),
          criterios: ["Reservas na etapa \"Aguardando devolução\": a festa aconteceu e o material ainda não voltou."],
        },
        fontes: [{ rotulo: "Aguardando devolução", caminho: "/reservas?aba=DEVOLUCAO" }],
      };
    }

    const emAberto = carteira.filter((l) => SITUACOES_EM_ABERTO.includes(l.comercial.situacao)).sort(porData);
    const vencidas = emAberto.filter((l) => l.comercial.situacao === "VENCIDO");
    const aVencer = emAberto.filter((l) => l.comercial.situacao !== "VENCIDO");
    return {
      dados: {
        posicaoEm: dataCurta(diaEmChapeco(agora)),
        comSaldoEmAberto: emAberto.length,
        vencidas: vencidas.length,
        aVencer: aVencer.length,
        // O total em reais é o "A receber" do Financeiro: só para quem vê o Financeiro.
        ...(papel === "ADMIN"
          ? {
              valorAReceber: brl(totalAReceber(emAberto.map((l) => l.apurado))),
              valorVencido: brl(totalAReceber(vencidas.map((l) => l.apurado))),
            }
          : {}),
        lista: emAberto.slice(0, LIMITE_DA_LISTA).map(festaParaIA),
        ...(emAberto.length > LIMITE_DA_LISTA ? { listaCortada: `Mostrando ${LIMITE_DA_LISTA} de ${emAberto.length}.` } : {}),
        criterios: [
          "Saldo em aberto: reservas vigentes que ainda não estão quitadas. Vencida é a que já passou da data da festa; antes disso o saldo está no prazo.",
          "Crédito Festaê aplicado reduz o saldo, mas não é pagamento.",
        ],
      },
      fontes: [{ rotulo: "Reservas ativas", caminho: "/reservas?aba=ATIVAS" }],
    };
  },
};

// ---------------------------------------------------------------- comercial

const consultarPropostas: Ferramenta<z.ZodObject<{ periodo: typeof periodoParam }>> = {
  nome: "consultarPropostas",
  descricao:
    "Propostas comerciais (orçamentos) de um MÊS ou ANO, como no panorama da aba Orçamentos: enviadas, em negociação, aprovadas (quantidade e valor aprovado), convertidas em reserva, perdidas, sem resposta e a conversão enviada→aprovada. Use para \"quantos orçamentos enviamos\", \"quanto aprovamos\", \"conversão comercial\", \"propostas em negociação\".",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({ periodo: periodoParam }),
  async executar({ periodo: expressao }, { agora, servicos }) {
    const r = periodoOuErro(expressao, agora, ALTERNATIVAS_MES_OU_ANO);
    if ("erro" in r) return r.erro;
    const p = r.periodo;
    if (p.tipo !== "MES" && p.tipo !== "ANO") {
      return limitacao("As propostas são acompanhadas por mês ou por ano.", [], ALTERNATIVAS_MES_OU_ANO);
    }
    const ano = Number(p.de.slice(0, 4));
    const mes = p.tipo === "MES" ? p.meses[0] : null;
    const panorama = await servicos.panoramaDeOrcamentos.panorama({ ano, mes });
    const taxa = (t: { numerador: number; denominador: number; percentual: number | null; baseSuficiente: boolean }) =>
      t.baseSuficiente && t.percentual !== null
        ? `${percentual(t.percentual)} (${t.numerador} de ${t.denominador})`
        : `base pequena demais para percentual (${t.numerador} de ${t.denominador})`;
    return {
      dados: {
        periodo: descreverPeriodo(p, agora),
        propostasDoPeriodo: panorama.propostas,
        enviadas: panorama.funil.enviadas,
        emNegociacao: { quantidade: panorama.emNegociacao.quantidade, valorDeReferencia: brl(panorama.emNegociacao.valor) },
        aprovadas: {
          quantidade: panorama.aprovadas.quantidade,
          valorAprovado: brl(panorama.aprovadas.valor),
          convertidasEmReserva: panorama.aprovadas.convertidas,
        },
        perdidas: panorama.perdidas.quantidade,
        semResposta: panorama.semResposta.quantidade,
        rascunhos: panorama.rascunhos.quantidade,
        conversaoEnviadaParaAprovada: taxa(panorama.conversao),
        ticketMedioAprovado: panorama.ticketMedioAprovado === null ? null : brl(panorama.ticketMedioAprovado),
        criterios: [
          "Cada proposta conta no mês do PRIMEIRO ENVIO (rascunho: no mês em que foi criada) — o mesmo critério da aba Orçamentos e do funil.",
          "Uma proposta com várias opções continua sendo UMA proposta.",
          "Valor aprovado é só o da opção escolhida pela cliente. Em negociação usa o valor de referência da proposta (a 1ª opção), sem somar opções.",
          "Conversão = aprovadas ÷ enviadas da mesma coorte; com base pequena o percentual não é mostrado.",
        ],
      },
      fontes: [
        {
          rotulo: `Orçamentos · ${p.rotulo}`,
          caminho: mes ? `/comercial/orcamentos?ano=${ano}&mes=${mes.slice(5)}` : `/comercial/orcamentos?ano=${ano}`,
        },
      ],
    };
  },
};

// ---------------------------------------------------------------- acervo

const contarProdutos: Ferramenta<z.ZodObject<Record<string, never>>> = {
  nome: "contarProdutos",
  descricao: "Quantos produtos ativos estão cadastrados no acervo, por categoria.",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({}),
  async executar(_args, { servicos }) {
    const produtos = await servicos.produtos.findAll();
    return {
      dados: {
        produtosAtivos: produtos.length,
        porCategoria: contar(produtos, (p) => String(p.category)),
        criterios: ["Produtos ativos no cadastro. Inativos não entram."],
      },
      fontes: [{ rotulo: "Produtos", caminho: "/acervo/produtos" }],
    };
  },
};

const consultarUsoDoAcervo: Ferramenta<z.ZodObject<Record<string, never>>> = {
  nome: "consultarUsoDoAcervo",
  descricao:
    "Uso do acervo como na aba Performance: produtos ativos, quantos foram utilizados nos últimos 90 dias e quais estão sem utilização registrada nesse período — só quando o sistema consegue afirmar isso.",
  natureza: "LEITURA",
  papeis: ["ADMIN"],
  parametros: z.object({}),
  async executar(_args, { servicos }) {
    const perf = await servicos.acervo.performance(90);
    const semUso = perf.kpis.semUsoRecente;
    const lista = perf.produtos.filter((p) => p.ativo && p.semUsoRecente).map((p) => p.nome);
    return {
      dados: {
        periodo: { de: perf.periodo.de, ate: perf.periodo.ate, dias: perf.periodo.dias },
        produtosAtivos: perf.kpis.produtosAtivos,
        produtosUtilizadosNoPeriodo: perf.kpis.produtosUtilizados,
        semUtilizacaoRegistrada: semUso.determinavel
          ? { total: semUso.total, nuncaUtilizados: semUso.nunca, produtos: lista.slice(0, 30) }
          : {
              emConsolidacao: true,
              festasSemComposicaoRastreavel: semUso.festasSemComposicao,
            },
        criterios: [
          `Sem utilização registrada = sem festa vigente com o produto nos últimos ${semUso.dias} dias.`,
          "Quando alguma festa recente não tem composição rastreável, o sistema NÃO afirma quais produtos ficaram parados: o uso recente ainda está em consolidação.",
        ],
      },
      fontes: [{ rotulo: "Performance do acervo", caminho: "/acervo/performance" }],
    };
  },
};

const consultarDisponibilidadeDeProduto: Ferramenta<
  z.ZodObject<{ produto: z.ZodString; data: typeof periodoParam; quantidade: z.ZodOptional<z.ZodNumber> }>
> = {
  nome: "consultarDisponibilidadeDeProduto",
  descricao:
    "Disponibilidade de um produto do acervo numa data: estoque, o que reservas da data já comprometem, o que propostas aprovadas ainda sem reserva seguram, e quanto sobra.",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({
    produto: z.string().min(2).max(80).describe("Nome do produto como a pessoa disse."),
    data: periodoParam.describe("O dia: \"14/11\", \"próximo sábado\", \"amanhã\", \"2026-11-14\"."),
    quantidade: z.number().int().min(1).max(999).optional().describe("Quantas unidades a pessoa quer, se disse."),
  }),
  async executar({ produto, data, quantidade }, { agora, servicos }) {
    const r = periodoOuErro(data, agora, ALTERNATIVAS_DE_DIA);
    if ("erro" in r) return r.erro;
    const p = r.periodo;
    if (p.tipo !== "DIA") return limitacao("Disponibilidade é conferida por dia.", [], ALTERNATIVAS_DE_DIA);

    const produtos = await servicos.produtos.findAll();
    const busca = normalizar(produto);
    const exatos = produtos.filter((x) => normalizar(x.name) === busca);
    const parecidos = exatos.length > 0 ? exatos : produtos.filter((x) => normalizar(x.name).includes(busca));
    if (parecidos.length === 0) {
      return limitacao(`Não encontrei produto ativo com o nome "${produto}".`, [{ rotulo: "Produtos", caminho: "/acervo/produtos" }]);
    }
    if (parecidos.length > 1) {
      return {
        tipo: "LIMITACAO",
        dados: {
          limitacao: `Há ${parecidos.length} produtos com esse nome. Pergunte qual deles.`,
          opcoes: parecidos.slice(0, 8).map((x) => x.name),
        },
        fontes: [{ rotulo: "Produtos", caminho: "/acervo/produtos" }],
      };
    }
    const alvo = parecidos[0];
    const dia = new Date(`${p.de}T12:00:00.000Z`);
    // Pedir mais do que existe faz a conferência devolver estoque e compromisso
    // do dia — a mesma conta que barra a venda manual e a conversão.
    const [conflitos, segurado] = await Promise.all([
      servicos.disponibilidade.conflitosDeItens(dia, {
        itensDoKit: [],
        itensAvulsos: [{ productId: alvo.id, quantity: alvo.stockQuantity + 1 }],
      }),
      servicos.orcamentos.seguradoPorAprovadas(dia),
    ]);
    const c = conflitos.find((x) => x.productId === alvo.id);
    const estoque = c?.estoque ?? alvo.stockQuantity;
    const emReservas = c?.jaComprometido ?? 0;
    const emPropostasAprovadas = segurado.total.get(alvo.id) ?? 0;
    const disponivel = Math.max(0, estoque - emReservas - emPropostasAprovadas);
    return {
      dados: {
        produto: alvo.name,
        dia: p.rotulo,
        ...(p.observacao ? { observacao: p.observacao } : {}),
        estoque,
        comprometidoEmReservas: emReservas,
        seguradoPorPropostasAprovadas: emPropostasAprovadas,
        disponivel,
        ...(quantidade ? { pedido: quantidade, cabe: quantidade <= disponivel } : {}),
        criterios: [
          "Disponível = estoque − o que as reservas vigentes do dia usam − o que propostas aprovadas e ainda sem reserva seguram (só a opção escolhida).",
        ],
      },
      fontes: [{ rotulo: "Disponibilidade", caminho: "/disponibilidade" }],
    };
  },
};

// ---------------------------------------------------------------- operações

const solicitarOperacao: Ferramenta<z.ZodObject<{ operacao: z.ZodString }>> = {
  nome: "solicitarOperacao",
  descricao:
    "Só para pedidos de ESCRITA: use SEMPRE que a pessoa pedir para registrar, cadastrar, confirmar, converter, aplicar, cancelar, excluir, alterar ou atualizar qualquer coisa. Nunca para perguntas de consulta, nem para consultas fora do perfil de acesso. Nesta fase nenhuma operação é executada: a ferramenta devolve a recusa padrão.",
  natureza: "LEITURA",
  papeis: ["ADMIN", "OPS"],
  parametros: z.object({ operacao: z.string().min(1).max(200).describe("O que a pessoa pediu para fazer, resumido.") }),
  async executar() {
    return { tipo: "RECUSA", dados: { autorizado: false, mensagem: MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA }, fontes: [] };
  },
};

// ---------------------------------------------------------------- catálogo

export const CATALOGO: readonly Ferramenta[] = [
  consultarFinanceiro,
  consultarCarteiraFutura,
  consultarFestas,
  consultarCancelamentos,
  consultarPendencias,
  consultarPropostas,
  contarProdutos,
  consultarUsoDoAcervo,
  consultarDisponibilidadeDeProduto,
  solicitarOperacao,
] as unknown as readonly Ferramenta[];

/** As ferramentas que um papel pode usar. Escrita nunca entra nesta fase, para papel nenhum. */
export function ferramentasDoPapel(papel: PapelAutorizado): readonly Ferramenta[] {
  return CATALOGO.filter((f) => f.natureza === "LEITURA" && f.papeis.includes(papel));
}

/** O que o papel NÃO alcança, dito em palavras para o modelo explicar a limitação. */
export function areasForaDoPapel(papel: PapelAutorizado): string[] {
  return papel === "ADMIN"
    ? []
    : [
        "Financeiro (faturamento, contratado, caixa, recebimentos, a receber, despesas, Resultado Operacional, acervo investido, crédito total das clientes)",
        "carteira futura da Visão Geral Comercial",
        "desempenho e uso do acervo",
      ];
}

/** O esquema JSON de uma ferramenta, no formato de função que a IA recebe. */
export function esquemaDaFerramenta(f: Ferramenta) {
  const { $schema: _ignorado, ...parametros } = z.toJSONSchema(f.parametros) as Record<string, unknown>;
  return { nome: f.nome, descricao: f.descricao, parametros };
}

export type SituacaoFiltravel = (typeof SITUACOES_FILTRAVEIS)[number];
export type { SituacaoDePagamento };
