import { MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA } from "./contrato";
import { encontrarPeriodoNoTexto, normalizar } from "./periodo";
import type {
  ChamadaDeFerramenta,
  EsquemaDeFerramenta,
  MensagemDoModelo,
  PassoDoModelo,
  ProvedorDeIA,
} from "./provedor";

/**
 * Provedor de demonstração: regras no lugar do modelo.
 *
 * Existe para o desenvolvimento e os testes sem chave de API — e só para
 * isso. Ele escolhe a ferramenta por palavras-chave e escreve a resposta a
 * partir do resultado da ferramenta, então os NÚMEROS são os reais do
 * sistema; o que ele não tem é a compreensão de linguagem de um modelo. A
 * tela avisa "modo de demonstração" sempre que é ele que responde.
 */

/** Prefixo da nota de contexto que o núcleo põe nas conversas com histórico. */
export const PREFIXO_DO_CONTEXTO = "Consultas anteriores desta conversa (JSON):";

const VERBOS_DE_ESCRITA =
  /\b(registr[ae]r?|registre|cadastr[ae]r?|cadastre|confirm[ae]r?|confirme|convert[ae]r?|converta|apliqu?e|aplicar|atualiz[ae]r?|atualize|lanc[ae]r?|lance|marqu?e|marcar|cancel[ae]r?|cancele|exclu[ai]r?|exclua|apag[ae]r?|apague|cri[ae]r?|crie|alter[ae]r?|altere|mud[ae]r?|mude|estorn[ae]r?|estorne)\b/;

/** Pedido de operação: verbo de escrita no imperativo ou "pode/quero ... <verbo>". */
export function pareceOperacao(texto: string): boolean {
  const t = normalizar(texto);
  if (/^(quant|qual|quais|quanto|como|quando|onde|existe|tem |temos)/.test(t)) return false;
  return VERBOS_DE_ESCRITA.test(t);
}

let sequencia = 0;
function chamada(nome: string, args: Record<string, unknown>): ChamadaDeFerramenta {
  sequencia += 1;
  return { id: `sim_${sequencia}`, nome, argumentos: JSON.stringify(args) };
}

type Consulta = { nome: string; args: Record<string, unknown> };

function ultimaConsulta(mensagens: MensagemDoModelo[]): Consulta | null {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.papel === "sistema" && m.texto.startsWith(PREFIXO_DO_CONTEXTO)) {
      try {
        const lista = JSON.parse(m.texto.slice(PREFIXO_DO_CONTEXTO.length)) as Consulta[];
        return lista[lista.length - 1] ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function situacaoPedida(t: string): string | undefined {
  if (/\b(pagas|quitadas|quitada|paga|pagos|quitados)\b/.test(t)) return "QUITADO";
  if (/\bvencid/.test(t)) return "VENCIDO";
  if (/\b(com sinal|so o sinal|sinal pago)\b/.test(t)) return "PARCIAL";
  if (/\b(em aberto|devendo|saldo)\b/.test(t)) return "EM_ABERTO";
  if (/\b(sem pagamento|nada pago|aguardando pagamento)\b/.test(t)) return "AGUARDANDO";
  return undefined;
}

function produtoDaPergunta(t: string): string | null {
  const m = t.match(/\b(?:do|da|de|o|a)\s+(.+?)\s+(?:no dia|na data|dia|para|pra|em|no|na)\s+\S/);
  if (!m) return null;
  const nome = m[1].replace(/^(produto|item)\s+/, "").trim();
  return nome.length >= 2 ? nome : null;
}

/** Decide a ferramenta para uma pergunta. Nula quando a pergunta não é suportada. */
function decidir(texto: string, mensagens: MensagemDoModelo[]): Consulta | { esclarecer: string } | null {
  const t = normalizar(texto);
  if (pareceOperacao(texto)) return { nome: "solicitarOperacao", args: { operacao: texto.slice(0, 200) } };

  const periodo = encontrarPeriodoNoTexto(texto);
  const anterior = ultimaConsulta(mensagens);
  const continuacao = !periodo && (/\b(delas|dessas|deles|desses|destas|nelas|nesse periodo)\b/.test(t) || /^e /.test(t));
  if (continuacao && anterior) {
    const situacao = situacaoPedida(t);
    if (anterior.nome === "consultarFestas") {
      return { nome: "consultarFestas", args: { periodo: anterior.args.periodo, ...(situacao ? { situacaoDePagamento: situacao } : {}) } };
    }
    if (/cancelad/.test(t) && anterior.args.periodo) return { nome: "consultarCancelamentos", args: { periodo: anterior.args.periodo } };
    return { nome: anterior.nome, args: anterior.args };
  }

  if (/aguardando devolu|\bdevolucao\b/.test(t)) return { nome: "consultarPendencias", args: { tipo: "AGUARDANDO_DEVOLUCAO" } };
  if (/saldo (pendente|em aberto|a receber)|com saldo|devendo|inadimpl/.test(t)) {
    return { nome: "consultarPendencias", args: { tipo: "SALDO_EM_ABERTO" } };
  }
  if (/cancelad|cancelamento/.test(t)) return { nome: "consultarCancelamentos", args: { periodo: periodo ?? "este mes" } };
  if (/orcamento|proposta|conversao|aprovamos|aprovad|negociacao/.test(t)) {
    return { nome: "consultarPropostas", args: { periodo: periodo ?? "este mes" } };
  }
  // "Crédito disponível das clientes" é financeiro, não disponibilidade de produto.
  if (/credito/.test(t)) return { nome: "consultarFinanceiro", args: { periodo: periodo ?? "este mes" } };
  if (/disponib|disponivel/.test(t)) {
    const produto = produtoDaPergunta(t);
    if (!produto || !periodo) return { esclarecer: "Para conferir disponibilidade, diga o produto e a data. Exemplo: \"Tem o Arco Dourado disponível no dia 14/11?\"" };
    return { nome: "consultarDisponibilidadeDeProduto", args: { produto, data: periodo } };
  }
  if (/carteira futura|daqui (pra|para) frente/.test(t)) return { nome: "consultarCarteiraFutura", args: {} };
  if (/sem utiliza|sem uso|parad/.test(t)) return { nome: "consultarUsoDoAcervo", args: {} };
  if (/(produtos|itens) cadastrad|quantos produtos/.test(t)) return { nome: "contarProdutos", args: {} };
  if (/fatur|contratad|recebemos|recebid|pagamentos|caixa|a receber|resultado|lucro|margem|gast|despes|custeio|consumo|investi|acervo|credito/.test(t)) {
    return { nome: "consultarFinanceiro", args: { periodo: periodo ?? "este mes" } };
  }
  if (/\b(festa|festas|reserva|reservas|evento|eventos)\b/.test(t)) {
    if (!periodo) return { esclarecer: "Para qual período? Por exemplo: \"este mês\", \"novembro\", \"amanhã\" ou \"14/11\"." };
    const situacao = situacaoPedida(t);
    return { nome: "consultarFestas", args: { periodo, ...(situacao ? { situacaoDePagamento: situacao } : {}) } };
  }
  return null;
}

const NAO_SUPORTADA =
  "Ainda não sei responder essa pergunta. Posso consultar: faturamento, contratado, caixa, a receber, resultado operacional, despesas e acervo investido; festas por data e situação de pagamento; cancelamentos; reservas aguardando devolução ou com saldo; propostas enviadas, aprovadas, conversão e negociação; produtos cadastrados, sem uso e disponibilidade.";

export class ProvedorSimulado implements ProvedorDeIA {
  readonly modo = "SIMULADO" as const;

  constructor(private readonly transcricaoSimulada = "Quantas festas temos em novembro?") {}

  async conversar(mensagens: MensagemDoModelo[], ferramentas: EsquemaDeFerramenta[]): Promise<PassoDoModelo> {
    const uso = { entrada: 0, entradaEmCache: 0, saida: 0 };
    const ultima = mensagens[mensagens.length - 1];
    const pergunta = [...mensagens].reverse().find((m) => m.papel === "usuario");
    const textoDaPergunta = pergunta && pergunta.papel === "usuario" ? pergunta.texto : "";

    if (ultima?.papel === "ferramenta") {
      const resultados = mensagens
        .slice(mensagens.lastIndexOf(pergunta!) + 1)
        .filter((m): m is Extract<MensagemDoModelo, { papel: "ferramenta" }> => m.papel === "ferramenta");
      return { texto: redigir(textoDaPergunta, resultados), chamadas: [], uso };
    }

    const decisao = decidir(textoDaPergunta, mensagens);
    if (decisao === null) return { texto: NAO_SUPORTADA, chamadas: [], uso };
    if ("esclarecer" in decisao) return { texto: decisao.esclarecer, chamadas: [], uso };
    if (!ferramentas.some((f) => f.nome === decisao.nome)) {
      return { texto: "Essa consulta não está disponível para o seu perfil de acesso. Ela fica com a administração.", chamadas: [], uso };
    }
    return { texto: null, chamadas: [chamada(decisao.nome, decisao.args)], uso };
  }

  async transcrever(): Promise<string> {
    return this.transcricaoSimulada;
  }

  async falar(): Promise<{ audio: Buffer; mimeType: string }> {
    throw new Error("O modo de demonstração não sintetiza voz: a tela usa a voz do navegador.");
  }
}

// ---------------------------------------------------------------- redação

type Dados = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

function obs(d: Dados): string {
  const o = d.periodo?.observacao ?? d.observacao;
  return o ? `\nObs.: ${o}` : "";
}

function listaCurta(lista: Dados[] | undefined, max = 5): string {
  if (!lista?.length || lista.length > max) return "";
  return "\n" + lista.map((f) => `• ${f.contrato} · ${f.data ?? f.dataDaFesta} · ${f.cliente} · ${f.etapa}${f.pagamento ? ` · ${f.pagamento}` : ""}`).join("\n");
}

function redigir(pergunta: string, resultados: Extract<MensagemDoModelo, { papel: "ferramenta" }>[]): string {
  const t = normalizar(pergunta);
  const partes: string[] = [];
  for (const r of resultados) {
    let d: Dados;
    try {
      d = JSON.parse(r.conteudo);
    } catch {
      continue;
    }
    if (d.erro) {
      partes.push(d.erro);
      continue;
    }
    if (d.limitacao) {
      partes.push(`${d.limitacao}${d.opcoes ? ` Opções: ${d.opcoes.join(", ")}.` : ""}`);
      continue;
    }
    if (d.autorizado === false) {
      partes.push(MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA);
      continue;
    }
    partes.push(redigirResultado(r.nome, d, t));
  }
  return partes.join("\n\n") || NAO_SUPORTADA;
}

function redigirResultado(nome: string, d: Dados, t: string): string {
  switch (nome) {
    case "consultarFinanceiro":
      return redigirFinanceiro(d, t);
    case "consultarCarteiraFutura":
      return `Carteira futura (${d.janela.de} a ${d.janela.ate}): ${plural(d.festas, "festa", "festas")}, ${d.contratado} contratados, ${d.jaRecebido} já recebidos e ${d.aReceber} a receber. É valor contratado, não faturamento realizado.`;
    case "consultarFestas": {
      const p = d.periodo;
      const futuro = p.situacao === "FUTURO" ? " (contratadas)" : "";
      if (d.filtro) {
        const um = d.festasNoFiltro === 1;
        const rotulos: Record<string, string> = {
          QUITADO: um ? "quitada" : "quitadas",
          PARCIAL: "com sinal recebido",
          AGUARDANDO: "sem pagamento",
          VENCIDO: um ? "vencida" : "vencidas",
          EM_ABERTO: "com saldo em aberto",
        };
        return `Das ${plural(d.festas, "festa", "festas")} de ${p.rotulo}, ${d.festasNoFiltro} ${um ? "está" : "estão"} ${rotulos[d.filtro]}.${listaCurta(d.lista)}${obs(d)}`;
      }
      if (d.festas === 0) return `Não há festas vigentes em ${p.rotulo}.${obs(d)}`;
      const s = d.porSituacaoDePagamento as Record<string, number>;
      const resumo = Object.entries(s).map(([k, v]) => `${k.toLowerCase()}: ${v}`).join("; ");
      const valor = d.valorContratadoDasFestas ? ` Valor contratado: ${d.valorContratadoDasFestas}.` : "";
      return `${p.rotulo[0].toUpperCase()}${p.rotulo.slice(1)}: ${plural(d.festas, "festa vigente", "festas vigentes")}${futuro}. Pagamento — ${resumo}.${valor}${listaCurta(d.lista)}${obs(d)}`;
    }
    case "consultarCancelamentos":
      return `${d.periodo.rotulo[0].toUpperCase()}${d.periodo.rotulo.slice(1)}: ${plural(d.cancelamentosRegistrados, "cancelamento registrado", "cancelamentos registrados")} (${d.canceladas} canceladas, ${d.recusadas} recusadas); ${d.comFestaNoProprioPeriodo} tinham a festa no próprio período. Critério: data em que o cancelamento foi registrado.${obs(d)}`;
    case "consultarPendencias":
      if ("aguardandoDevolucao" in d) {
        return `Hoje há ${plural(d.aguardandoDevolucao, "reserva aguardando", "reservas aguardando")} devolução do material.${listaCurta(d.lista)}`;
      }
      return `Hoje há ${plural(d.comSaldoEmAberto, "reserva", "reservas")} com saldo em aberto: ${d.vencidas} vencidas e ${d.aVencer} ainda no prazo.${d.valorAReceber ? ` Total a receber: ${d.valorAReceber} (vencido: ${d.valorVencido}).` : ""}${listaCurta(d.lista)}`;
    case "consultarPropostas": {
      const p = d.periodo.rotulo;
      if (/enviamos|enviad/.test(t)) return `Em ${p}, ${plural(d.enviadas, "proposta enviada", "propostas enviadas")} (primeiro envio no período).${obs(d)}`;
      if (/aprovamos|aprovad/.test(t)) return `Em ${p}, ${plural(d.aprovadas.quantidade, "proposta aprovada", "propostas aprovadas")}, somando ${d.aprovadas.valorAprovado} (só a opção escolhida de cada uma); ${d.aprovadas.convertidasEmReserva} já viraram reserva.${obs(d)}`;
      if (/conversao/.test(t)) return `Conversão enviada → aprovada em ${p}: ${d.conversaoEnviadaParaAprovada}.${obs(d)}`;
      if (/negociacao/.test(t)) return `Em ${p}, ${plural(d.emNegociacao.quantidade, "proposta", "propostas")} em negociação (${d.emNegociacao.valorDeReferencia} de valor de referência).${obs(d)}`;
      return `Em ${p}: ${d.enviadas} enviadas, ${d.aprovadas.quantidade} aprovadas (${d.aprovadas.valorAprovado}), ${d.emNegociacao.quantidade} em negociação. Conversão: ${d.conversaoEnviadaParaAprovada}.${obs(d)}`;
    }
    case "contarProdutos":
      return `Há ${plural(d.produtosAtivos, "produto ativo cadastrado", "produtos ativos cadastrados")} no acervo.`;
    case "consultarUsoDoAcervo": {
      const s = d.semUtilizacaoRegistrada;
      if (s.emConsolidacao) {
        return `Ainda não dá para afirmar quais produtos ficaram sem uso: ${plural(s.festasSemComposicaoRastreavel, "festa recente não tem", "festas recentes não têm")} composição rastreável. O uso recente está em consolidação.`;
      }
      return `${plural(s.total, "produto ativo está", "produtos ativos estão")} sem utilização registrada nos últimos ${d.periodo.dias} dias${s.produtos.length ? `: ${s.produtos.slice(0, 10).join(", ")}${s.total > 10 ? "…" : ""}` : ""}.`;
    }
    case "consultarDisponibilidadeDeProduto":
      return `${d.produto} em ${d.dia}: ${d.disponivel} disponível(is) de ${d.estoque} (reservas usam ${d.comprometidoEmReservas}; propostas aprovadas seguram ${d.seguradoPorPropostasAprovadas}).${d.pedido ? ` Para ${d.pedido}: ${d.cabe ? "cabe" : "não cabe"}.` : ""}${obs(d)}`;
    default:
      return NAO_SUPORTADA;
  }
}

function redigirFinanceiro(d: Dados, t: string): string {
  if (d.acumuladoDoAno) {
    const a = d.acumuladoDoAno;
    return `Acumulado de ${d.periodo.rotulo} (até ${d.periodo.acumuladoAte}): faturamento das festas ${a.faturamentoDasFestas}, Resultado Operacional ${a.resultadoOperacional}${a.margemOperacional ? ` (margem ${a.margemOperacional})` : ""}. Resultado Operacional não é lucro líquido.`;
  }
  const p = d.periodo;
  const c = d.competencia;
  const caixa = d.caixaDoMes;
  const aviso =
    p.situacao === "FUTURO" ? " É valor contratado: ainda não é faturamento realizado." : p.situacao === "EM_ANDAMENTO" ? " O mês está em andamento: inclui festas contratadas que ainda vão acontecer." : "";
  if (/a receber/.test(t)) return `Hoje há ${d.posicaoDeHoje.aReceber} a receber de contratos vigentes.`;
  if (/credito/.test(t)) return `Crédito Festaê em aberto das clientes hoje: ${d.posicaoDeHoje.creditoFestaeEmAbertoDasClientes}. Esse valor já entrou no caixa quando foi pago — não é receita nova nem desconto.`;
  if (/recebemos|recebid|pagamentos|caixa|entrou/.test(t)) {
    const reembolsos = caixa.reembolsosRealizados !== "R$ 0,00" ? `, com ${caixa.reembolsosRealizados} em reembolsos realizados (líquido ${caixa.liquido})` : "";
    return `Em ${p.rotulo}, entraram ${caixa.entradasConfirmadas} em pagamentos confirmados${reembolsos}. Critério: caixa (pagamentos PAID no período).${obs(d)}`;
  }
  if (/resultado|lucro|margem/.test(t)) {
    const lucro = /lucro/.test(t) ? " Observação: o painel mede Resultado Operacional, não lucro líquido." : "";
    return `Resultado Operacional de ${p.rotulo}: ${c.resultadoOperacional}${c.margemOperacional ? ` (margem ${c.margemOperacional})` : ""} — faturamento ${c.faturamentoDasFestas} + retenção ${c.retencaoPorCancelamento} − despesas ${c.despesas.total}.${aviso}${lucro}${obs(d)}`;
  }
  if (/investi|acervo/.test(t)) return `Investimento em acervo em ${p.rotulo}: ${d.investimentoEmAcervo.noMes} (acumulado: ${d.investimentoEmAcervo.acumulado}). Acervo é investimento: não entra nas despesas do resultado.${obs(d)}`;
  if (/gast|despes|custeio|consumo/.test(t)) return `Despesas de ${p.rotulo}: ${c.despesas.total} — consumo ${c.despesas.consumo} e custeio ${c.despesas.custeio}.${obs(d)}`;
  const rotulo = /contratad/.test(t) || p.situacao === "FUTURO" ? "Contratado" : "Faturamento das festas";
  const retencao = c.retencaoPorCancelamento !== "R$ 0,00" ? ` Retenção por cancelamento, à parte: ${c.retencaoPorCancelamento}.` : "";
  return `${rotulo} em ${p.rotulo} (por competência): ${c.faturamentoDasFestas}, em ${plural(c.festasNoMes, "festa", "festas")}.${aviso}${retencao}${obs(d)}`;
}
