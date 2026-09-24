import {
  DIAS_DA_PRESSAO,
  DIAS_SEM_USO,
  diaEmChapeco,
  fromCentsInt,
  janelaPassada,
  somarDias,
  toCentsInt,
  type OrigemNoPedido,
} from "@festae/shared";
import { STATUS_VIGENTES } from "../financeiro/contratos";
import { itensDoKitDoPedido, somarCompromisso, type PedidoComprometido } from "../availability/item-commitment";
import { STATUS_QUE_COMPROMETEM } from "../availability/selecao-do-pedido";

/**
 * A Performance do Acervo, como função pura.
 *
 * Duas perguntas diferentes, com duas regras diferentes — e a separação é o
 * ponto desta tela:
 *
 * - HISTÓRICO (o que trabalhou): só o que está registrado de forma que não
 *   muda depois. Item avulso (`OrderItem`) sempre; item de kit só pelo kit
 *   congelado (`OrderKitItem`). Pedido antigo com kit e sem congelamento não
 *   ganha a composição ATUAL do kit como passado: isso faria o histórico de
 *   um produto mudar toda vez que alguém edita um kit.
 *
 * - OPERAÇÃO (o que está comprometido): a mesma regra da disponibilidade,
 *   com o mesmo fallback para pedido antigo. Aqui a pergunta é "vai faltar
 *   peça?", e para ela o cadastro atual do kit é exatamente o que a agenda
 *   já usa para bloquear a data.
 *
 * Valor é sempre o do contrato inteiro. Nada aqui atribui receita a um item.
 */

export type ItemDoPedido = { productId: string; quantity: number };

export type ReservaDoAcervo = {
  id: string;
  numero: number;
  status: string;
  cancelada: boolean;
  /** Dia da festa, "AAAA-MM-DD" (calendário de Chapecó). */
  festaEm: string;
  cliente: string;
  total: number;
  kitId: string | null;
  kitNome: string | null;
  kitCongeladoEm: Date | null;
  /** `OrderKitItem`: o kit como foi vendido. Só vale com `kitCongeladoEm`. */
  itensDoKitCongelado: ItemDoPedido[];
  /** A composição de hoje do kit do pedido. Só para a conta operacional. */
  itensDoKitAtual: ItemDoPedido[];
  /** `OrderItem`: os avulsos. */
  extras: ItemDoPedido[];
  temaId: string | null;
  temaNome: string | null;
};

export type ProdutoDoAcervo = { id: string; nome: string; estoque: number; ativo: boolean };

export type ConflitoRegistrado = {
  id: string;
  registradoEm: Date;
  productId: string | null;
  dataDaFesta: string | null;
  solicitado: number | null;
  disponivel: number | null;
  contexto: string | null;
};

// ---------------------------------------------------------------- regras

/** Festa que conta: não cancelada e num estado de contrato vigente. */
export function ehFestaVigente(r: ReservaDoAcervo): boolean {
  return !r.cancelada && (STATUS_VIGENTES as readonly string[]).includes(r.status);
}

/** Pedido com kit que nasceu antes do congelamento: a composição da época não existe. */
export function kitSemSnapshot(r: ReservaDoAcervo): boolean {
  return r.kitId !== null && r.kitCongeladoEm === null;
}

/**
 * A festa cuja composição não se conhece: kit sem congelamento, ou pedido
 * anterior ao congelamento sem item nenhum registrado (o histórico migrado
 * do painel antigo chega assim). Dela não se pode dizer quais produtos
 * usou — nem quais NÃO usou.
 */
export function composicaoDesconhecida(r: ReservaDoAcervo): boolean {
  if (r.kitCongeladoEm !== null) return false;
  return r.kitId !== null || r.extras.length === 0;
}

/**
 * O que a festa usou de cada produto, pelo que está registrado para sempre.
 *
 * Kit e avulso do mesmo produto somam na quantidade e ficam marcados como
 * as duas origens; a festa continua sendo uma só para aquele produto.
 */
export function usoRastreavel(r: ReservaDoAcervo): Map<string, { kit: number; extra: number }> {
  const uso = new Map<string, { kit: number; extra: number }>();
  if (r.kitCongeladoEm !== null) {
    for (const i of r.itensDoKitCongelado) {
      const atual = uso.get(i.productId) ?? { kit: 0, extra: 0 };
      atual.kit += i.quantity;
      uso.set(i.productId, atual);
    }
  }
  for (const i of r.extras) {
    const atual = uso.get(i.productId) ?? { kit: 0, extra: 0 };
    atual.extra += i.quantity;
    uso.set(i.productId, atual);
  }
  return uso;
}

export function origemDoUso(uso: { kit: number; extra: number }): OrigemNoPedido {
  if (uso.kit > 0 && uso.extra > 0) return "KIT_EXTRA";
  return uso.kit > 0 ? "KIT" : "EXTRA";
}

/** Reserva que segura material na agenda — o mesmo critério da disponibilidade. */
export function comprometeMaterial(r: ReservaDoAcervo): boolean {
  return (STATUS_QUE_COMPROMETEM as readonly string[]).includes(r.status);
}

/** O compromisso operacional do pedido, pela regra da disponibilidade (com fallback). */
export function compromissoOperacional(r: ReservaDoAcervo): PedidoComprometido {
  return {
    itensDoKit: itensDoKitDoPedido({
      kitCongeladoEm: r.kitCongeladoEm,
      kitItems: r.itensDoKitCongelado,
      kit: r.kitId ? { products: r.itensDoKitAtual } : null,
    }),
    itensAvulsos: r.extras,
  };
}

const somaCentavos = (valores: readonly number[]) =>
  fromCentsInt(valores.reduce((s, v) => s + toCentsInt(v), 0));

// ---------------------------------------------------------------- resultado

export type LinhaDoProduto = {
  productId: string;
  nome: string;
  ativo: boolean;
  estoque: number;
  festas: number;
  quantidade: number;
  /** Soma do total dos contratos das festas distintas deste produto no período. */
  contratos: number;
  ultimaUtilizacao: string | null;
  proximaUtilizacao: string | null;
  conflitos: number;
  semUsoRecente: boolean;
  nuncaUtilizado: boolean;
};

export type PressaoDoProduto = {
  productId: string;
  nome: string;
  estoque: number;
  pico: number;
  dataDoPico: string;
  /** Pico ÷ estoque. Nulo quando o estoque é zero. */
  percentual: number | null;
  acimaDoEstoque: boolean;
  proximas: { data: string; quantidade: number }[];
};

export type PerformanceDoAcervo = {
  hoje: string;
  periodo: { dias: number; de: string; ate: string };
  kpis: {
    produtosAtivos: number;
    produtosUtilizados: number;
    semUsoRecente: {
      total: number;
      nunca: number;
      dias: number;
      /**
       * Se dá para afirmar que um produto ficou parado. Falso quando alguma
       * festa dos últimos 90 dias tem composição desconhecida: ela pode ter
       * usado qualquer peça, e "sem uso" viraria acusação sem prova.
       */
      determinavel: boolean;
      festasSemComposicao: number;
    };
    contratos: { valor: number; festas: number };
    conflitos: number;
  };
  produtos: LinhaDoProduto[];
  /** Festas do período com kit e sem congelamento: fora da análise por produto. */
  festasSemComposicaoHistorica: number;
  pressao: { de: string; ate: string; dias: number; produtos: PressaoDoProduto[] };
  conflitos: {
    total: number;
    porProduto: {
      productId: string | null;
      nome: string;
      total: number;
      registros: {
        registradoEm: string;
        dataDaFesta: string | null;
        solicitado: number | null;
        disponivel: number | null;
        contexto: string | null;
      }[];
    }[];
  };
  kits: { kitId: string; nome: string; festas: number; contratos: number }[];
  festasSemKit: number;
  temas: { temaId: string | null; nome: string; festas: number; contratos: number }[];
  cobertura: {
    festas: number;
    rastreaveis: number;
    kitSemSnapshot: number;
    /** Pedido anterior ao congelamento, sem kit e sem item (histórico migrado). */
    semItensRegistrados: number;
  };
};

type Contexto = {
  hoje: string;
  janela: { de: string; ate: string };
  vigentes: ReservaDoAcervo[];
  doPeriodo: ReservaDoAcervo[];
  conflitosDoPeriodo: ConflitoRegistrado[];
};

function contexto(
  reservas: readonly ReservaDoAcervo[],
  conflitos: readonly ConflitoRegistrado[],
  dias: number,
  agora: Date,
): Contexto {
  const hoje = diaEmChapeco(agora);
  const janela = janelaPassada(agora, dias);
  const vigentes = reservas.filter(ehFestaVigente);
  const doPeriodo = vigentes
    .filter((r) => r.festaEm >= janela.de && r.festaEm <= janela.ate)
    .sort((a, b) => b.festaEm.localeCompare(a.festaEm) || a.numero - b.numero);
  // Conflito pertence ao dia em que foi registrado (em Chapecó), não à
  // data da festa pretendida: é "o que aconteceu nestes dias".
  const conflitosDoPeriodo = conflitos.filter((c) => {
    const dia = diaEmChapeco(c.registradoEm);
    return dia >= janela.de && dia <= janela.ate;
  });
  return { hoje, janela, vigentes, doPeriodo, conflitosDoPeriodo };
}

/** As linhas da tabela por produto. Exportado para o detalhe conferir contra a mesma conta. */
function linhasDosProdutos(
  produtos: readonly ProdutoDoAcervo[],
  reservas: readonly ReservaDoAcervo[],
  ctx: Contexto,
): LinhaDoProduto[] {
  const janela90 = { de: somarDias(ctx.hoje, -(DIAS_SEM_USO - 1)), ate: ctx.hoje };
  const noPeriodo = new Map<string, { festas: number; quantidade: number; centavos: number }>();
  const ultima = new Map<string, string>();
  const usado90 = new Set<string>();

  for (const r of ctx.doPeriodo) {
    for (const [pid, uso] of usoRastreavel(r)) {
      const atual = noPeriodo.get(pid) ?? { festas: 0, quantidade: 0, centavos: 0 };
      atual.festas += 1;
      atual.quantidade += uso.kit + uso.extra;
      atual.centavos += toCentsInt(r.total);
      noPeriodo.set(pid, atual);
    }
  }
  for (const r of ctx.vigentes) {
    if (r.festaEm > ctx.hoje) continue;
    for (const pid of usoRastreavel(r).keys()) {
      if ((ultima.get(pid) ?? "") < r.festaEm) ultima.set(pid, r.festaEm);
      if (r.festaEm >= janela90.de) usado90.add(pid);
    }
  }

  // Próxima utilização é compromisso: vem da regra operacional, a mesma que
  // bloqueia a agenda — inclusive o pedido antigo pelo kit de hoje.
  const proxima = new Map<string, string>();
  for (const r of reservas) {
    if (!comprometeMaterial(r) || r.festaEm <= ctx.hoje) continue;
    for (const pid of somarCompromisso([compromissoOperacional(r)]).keys()) {
      const atual = proxima.get(pid);
      if (!atual || r.festaEm < atual) proxima.set(pid, r.festaEm);
    }
  }

  const conflitosPorProduto = new Map<string, number>();
  for (const c of ctx.conflitosDoPeriodo) {
    if (c.productId) conflitosPorProduto.set(c.productId, (conflitosPorProduto.get(c.productId) ?? 0) + 1);
  }

  return produtos
    .filter((p) => p.ativo || noPeriodo.has(p.id))
    .map((p) => {
      const uso = noPeriodo.get(p.id);
      return {
        productId: p.id,
        nome: p.nome,
        ativo: p.ativo,
        estoque: p.estoque,
        festas: uso?.festas ?? 0,
        quantidade: uso?.quantidade ?? 0,
        contratos: fromCentsInt(uso?.centavos ?? 0),
        ultimaUtilizacao: ultima.get(p.id) ?? null,
        proximaUtilizacao: proxima.get(p.id) ?? null,
        conflitos: conflitosPorProduto.get(p.id) ?? 0,
        semUsoRecente: !usado90.has(p.id),
        nuncaUtilizado: !ultima.has(p.id),
      };
    })
    .sort((a, b) => b.festas - a.festas || a.nome.localeCompare(b.nome, "pt-BR"));
}

function pressaoFutura(
  reservas: readonly ReservaDoAcervo[],
  produtos: readonly ProdutoDoAcervo[],
  hoje: string,
): PerformanceDoAcervo["pressao"] {
  const ate = somarDias(hoje, DIAS_DA_PRESSAO);
  const porDia = new Map<string, PedidoComprometido[]>();
  for (const r of reservas) {
    if (!comprometeMaterial(r) || r.festaEm < hoje || r.festaEm >= ate) continue;
    porDia.set(r.festaEm, [...(porDia.get(r.festaEm) ?? []), compromissoOperacional(r)]);
  }

  const catalogo = new Map(produtos.map((p) => [p.id, p]));
  const porProduto = new Map<string, { data: string; quantidade: number }[]>();
  for (const dia of [...porDia.keys()].sort()) {
    for (const [pid, quantidade] of somarCompromisso(porDia.get(dia)!)) {
      if (quantidade <= 0) continue;
      porProduto.set(pid, [...(porProduto.get(pid) ?? []), { data: dia, quantidade }]);
    }
  }

  const linhas: PressaoDoProduto[] = [...porProduto.entries()].map(([pid, dias]) => {
    const produto = catalogo.get(pid);
    const estoque = produto?.estoque ?? 0;
    // O primeiro dia com o maior número: é o que chega antes.
    const pico = dias.reduce((max, d) => (d.quantidade > max.quantidade ? d : max), dias[0]);
    return {
      productId: pid,
      nome: produto?.nome ?? "Produto removido do cadastro",
      estoque,
      pico: pico.quantidade,
      dataDoPico: pico.data,
      percentual: estoque > 0 ? pico.quantidade / estoque : null,
      acimaDoEstoque: pico.quantidade > estoque,
      proximas: dias.slice(0, 3),
    };
  });

  const peso = (l: PressaoDoProduto) => (l.percentual ?? Number.POSITIVE_INFINITY);
  linhas.sort((a, b) => peso(b) - peso(a) || b.pico - a.pico || a.nome.localeCompare(b.nome, "pt-BR"));
  return { de: hoje, ate, dias: DIAS_DA_PRESSAO, produtos: linhas };
}

export function montarPerformance(
  reservas: readonly ReservaDoAcervo[],
  produtos: readonly ProdutoDoAcervo[],
  conflitos: readonly ConflitoRegistrado[],
  dias: number,
  agora: Date,
): PerformanceDoAcervo {
  const ctx = contexto(reservas, conflitos, dias, agora);
  const linhas = linhasDosProdutos(produtos, reservas, ctx);
  const ativas = linhas.filter((l) => l.ativo);
  const catalogo = new Map(produtos.map((p) => [p.id, p]));

  // Contratos com acervo rastreável: cada contrato UMA vez, por mais
  // produtos que tenha. Somar as linhas da tabela contaria a mesma festa
  // uma vez por produto.
  const comAcervo = ctx.doPeriodo.filter((r) => usoRastreavel(r).size > 0);

  // Conflitos agrupados por produto, mais recentes primeiro.
  const grupos = new Map<string, ConflitoRegistrado[]>();
  for (const c of [...ctx.conflitosDoPeriodo].sort((a, b) => b.registradoEm.getTime() - a.registradoEm.getTime())) {
    const chave = c.productId ?? "";
    grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
  }

  const kits = new Map<string, { kitId: string; nome: string; festas: number; centavos: number }>();
  const temas = new Map<string, { temaId: string | null; nome: string; festas: number; centavos: number }>();
  for (const r of ctx.doPeriodo) {
    if (r.kitId) {
      const k = kits.get(r.kitId) ?? { kitId: r.kitId, nome: r.kitNome ?? "Kit removido", festas: 0, centavos: 0 };
      k.festas += 1;
      k.centavos += toCentsInt(r.total);
      kits.set(r.kitId, k);
    }
    const chave = r.temaId ?? "";
    const t = temas.get(chave) ?? {
      temaId: r.temaId,
      nome: r.temaId ? (r.temaNome ?? "Tema removido") : "Sem tema definido",
      festas: 0,
      centavos: 0,
    };
    t.festas += 1;
    t.centavos += toCentsInt(r.total);
    temas.set(chave, t);
  }
  const porFestas = <T extends { festas: number; nome: string }>(a: T, b: T) =>
    b.festas - a.festas || a.nome.localeCompare(b.nome, "pt-BR");

  const kitSemCongelar = ctx.doPeriodo.filter(kitSemSnapshot).length;
  const semItens = ctx.doPeriodo.filter((r) => composicaoDesconhecida(r) && !kitSemSnapshot(r)).length;
  const inicio90 = somarDias(ctx.hoje, -(DIAS_SEM_USO - 1));
  const desconhecidas90 = ctx.vigentes.filter(
    (r) => r.festaEm >= inicio90 && r.festaEm <= ctx.hoje && composicaoDesconhecida(r),
  ).length;

  return {
    hoje: ctx.hoje,
    periodo: { dias, de: ctx.janela.de, ate: ctx.janela.ate },
    kpis: {
      produtosAtivos: ativas.length,
      produtosUtilizados: ativas.filter((l) => l.festas > 0).length,
      semUsoRecente: {
        total: ativas.filter((l) => l.semUsoRecente).length,
        nunca: ativas.filter((l) => l.nuncaUtilizado).length,
        dias: DIAS_SEM_USO,
        determinavel: desconhecidas90 === 0,
        festasSemComposicao: desconhecidas90,
      },
      contratos: { valor: somaCentavos(comAcervo.map((r) => r.total)), festas: comAcervo.length },
      conflitos: ctx.conflitosDoPeriodo.length,
    },
    produtos: linhas,
    festasSemComposicaoHistorica: kitSemCongelar,
    pressao: pressaoFutura(reservas, produtos, ctx.hoje),
    conflitos: {
      total: ctx.conflitosDoPeriodo.length,
      porProduto: [...grupos.entries()]
        .map(([pid, lista]) => ({
          productId: pid || null,
          nome: pid ? (catalogo.get(pid)?.nome ?? "Produto removido do cadastro") : "Produto não identificado",
          total: lista.length,
          registros: lista.map((c) => ({
            registradoEm: c.registradoEm.toISOString(),
            dataDaFesta: c.dataDaFesta,
            solicitado: c.solicitado,
            disponivel: c.disponivel,
            contexto: c.contexto,
          })),
        }))
        .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR")),
    },
    kits: [...kits.values()].sort(porFestas).map(({ centavos, ...k }) => ({ ...k, contratos: fromCentsInt(centavos) })),
    festasSemKit: ctx.doPeriodo.filter((r) => !r.kitId).length,
    temas: [...temas.values()].sort(porFestas).map(({ centavos, ...t }) => ({ ...t, contratos: fromCentsInt(centavos) })),
    cobertura: {
      festas: ctx.doPeriodo.length,
      rastreaveis: ctx.doPeriodo.length - kitSemCongelar - semItens,
      kitSemSnapshot: kitSemCongelar,
      semItensRegistrados: semItens,
    },
  };
}

// ---------------------------------------------------------------- detalhe

export type DetalheDoProduto = {
  produto: LinhaDoProduto;
  periodo: { dias: number; de: string; ate: string };
  festas: {
    reservaId: string;
    numero: number;
    data: string;
    cliente: string;
    quantidade: number;
    origem: OrigemNoPedido;
    valor: number;
  }[];
  totais: { festas: number; quantidade: number; contratos: number };
  conflitos: PerformanceDoAcervo["conflitos"]["porProduto"][number]["registros"];
  confere: boolean;
};

/**
 * As festas de um produto no período, do mesmo conjunto que gerou a linha
 * da tabela — e `confere` diz se as duas contas fecham.
 */
export function detalharProduto(
  reservas: readonly ReservaDoAcervo[],
  produtos: readonly ProdutoDoAcervo[],
  conflitos: readonly ConflitoRegistrado[],
  productId: string,
  dias: number,
  agora: Date,
): DetalheDoProduto | null {
  const produto = produtos.find((p) => p.id === productId);
  if (!produto) return null;
  const ctx = contexto(reservas, conflitos, dias, agora);
  const linha =
    linhasDosProdutos([{ ...produto, ativo: true }], reservas, ctx)[0];
  const linhaReal = { ...linha, ativo: produto.ativo };

  const festas = ctx.doPeriodo.flatMap((r) => {
    const uso = usoRastreavel(r).get(productId);
    if (!uso) return [];
    return [
      {
        reservaId: r.id,
        numero: r.numero,
        data: r.festaEm,
        cliente: r.cliente,
        quantidade: uso.kit + uso.extra,
        origem: origemDoUso(uso),
        valor: r.total,
      },
    ];
  });
  const totais = {
    festas: festas.length,
    quantidade: festas.reduce((s, f) => s + f.quantidade, 0),
    contratos: somaCentavos(festas.map((f) => f.valor)),
  };

  return {
    produto: linhaReal,
    periodo: { dias, de: ctx.janela.de, ate: ctx.janela.ate },
    festas,
    totais,
    conflitos: ctx.conflitosDoPeriodo
      .filter((c) => c.productId === productId)
      .sort((a, b) => b.registradoEm.getTime() - a.registradoEm.getTime())
      .map((c) => ({
        registradoEm: c.registradoEm.toISOString(),
        dataDaFesta: c.dataDaFesta,
        solicitado: c.solicitado,
        disponivel: c.disponivel,
        contexto: c.contexto,
      })),
    confere:
      totais.festas === linha.festas &&
      totais.quantidade === linha.quantidade &&
      toCentsInt(totais.contratos) === toCentsInt(linha.contratos),
  };
}
