/**
 * Retiradas dos sócios e o fluxo de caixa que as mostra.
 *
 * Retirada é dinheiro que sai da Festaê para um sócio como movimento de
 * capital: distribuição do lucro ou devolução do que ele aportou. Não é
 * despesa e não mexe no Resultado Operacional. Aparece onde é dinheiro
 * saindo: no fluxo de caixa e no saldo disponível.
 *
 * Pró-labore NÃO é retirada: é remuneração pelo trabalho, uma despesa. Mora
 * em Despesas, com natureza própria (`PRO_LABORE`), e é o único lugar onde se
 * lança — assim a mesma saída não tem como ser lançada duas vezes.
 *
 * Nada aqui altera as fórmulas de `financeiro.ts`. O fluxo de caixa é uma
 * leitura nova, ao lado das que já existem, montada com as mesmas funções.
 */

import { fromCentsInt, toCentsInt } from "./pricing";
import {
  acervoDoMes,
  acervoEntre,
  acumuladoNoAno,
  despesaDoMes,
  despesaEntre,
  entradasEntre,
  entradasNoCaixa,
  mesesDoAno,
  proLaboreDoMes,
  proLaboreEntre,
  reembolsosEntre,
  reembolsosNoMes,
  resultadoOperacionalDoMes,
  type ContratoApurado,
  type GastoApurado,
} from "./financeiro";

export const CATEGORIAS_DA_RETIRADA = ["DISTRIBUICAO_DE_LUCROS", "DEVOLUCAO_DE_APORTE"] as const;
export type CategoriaDaRetirada = (typeof CATEGORIAS_DA_RETIRADA)[number];

export const CATEGORIA_DA_RETIRADA_LABEL: Record<CategoriaDaRetirada, string> = {
  DISTRIBUICAO_DE_LUCROS: "Distribuição de lucros",
  DEVOLUCAO_DE_APORTE: "Devolução de aporte",
};

/** O que cada categoria é, e o que ela não é. A tela mostra ao escolher. */
export const CATEGORIA_DA_RETIRADA_NOTA: Record<CategoriaDaRetirada, string> = {
  DISTRIBUICAO_DE_LUCROS:
    "Parte do lucro já apurado entregue ao sócio. Reduz o saldo disponível; não é despesa e não muda faturamento, despesas nem o Resultado Operacional.",
  DEVOLUCAO_DE_APORTE:
    "Devolução de dinheiro que o sócio colocou na empresa. Reduz o saldo disponível; não é lucro nem despesa. Não confundir com a aba Aportes / Acervo, que é compra de acervo.",
};

/**
 * Texto que parece pró-labore.
 *
 * Pró-labore se lança só em Despesas, com a natureza Pró-labore. Uma retirada
 * que diz "pró-labore" na descrição, ou uma despesa de consumo/custeio que diz
 * "pró-labore", é lançamento no lugar errado — e é recusado com a orientação.
 */
export function pareceProLabore(...textos: (string | null | undefined)[]): boolean {
  return textos.some((t) => t && /pro[\s-]*labore/i.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

export const FORMAS_DA_RETIRADA = ["PIX", "TRANSFERENCIA", "DINHEIRO", "OUTRO"] as const;
export type FormaDaRetirada = (typeof FORMAS_DA_RETIRADA)[number];

export const FORMA_DA_RETIRADA_LABEL: Record<FormaDaRetirada, string> = {
  PIX: "Pix",
  TRANSFERENCIA: "Transferência",
  DINHEIRO: "Dinheiro",
  OUTRO: "Outro",
};

/** O que a apuração precisa de uma retirada. */
export type RetiradaApurada = {
  socioId: string;
  categoria: CategoriaDaRetirada;
  valor: number;
  /** O dia da retirada, gravado ao meio-dia UTC. */
  retiradaEm: Date;
  /** Estornada continua no histórico e sai de todos os totais. */
  estornada: boolean;
};

export type TotalPorCategoria = Record<CategoriaDaRetirada, number> & { total: number };

/** O mês da retirada: o dia gravado (meio-dia UTC), lido como dia de calendário. */
export function mesDaRetirada(retiradaEm: Date): string {
  return retiradaEm.toISOString().slice(0, 7);
}

function somarPorCategoria(retiradas: readonly RetiradaApurada[]): TotalPorCategoria {
  const centavos: Record<CategoriaDaRetirada, number> = {
    DISTRIBUICAO_DE_LUCROS: 0,
    DEVOLUCAO_DE_APORTE: 0,
  };
  for (const r of retiradas) if (!r.estornada) centavos[r.categoria] += toCentsInt(r.valor);
  const total = Object.values(centavos).reduce((t, v) => t + v, 0);
  return {
    DISTRIBUICAO_DE_LUCROS: fromCentsInt(centavos.DISTRIBUICAO_DE_LUCROS),
    DEVOLUCAO_DE_APORTE: fromCentsInt(centavos.DEVOLUCAO_DE_APORTE),
    total: fromCentsInt(total),
  };
}

/** Retiradas de um mês ("AAAA-MM"), por categoria. Estornadas não contam. */
export function retiradasDoMes(retiradas: readonly RetiradaApurada[], mes: string): TotalPorCategoria {
  return somarPorCategoria(retiradas.filter((r) => mesDaRetirada(r.retiradaEm) === mes));
}

/**
 * Retiradas do ano, de janeiro até `ateMes` inclusive (o ano inteiro quando
 * `ateMes` não vem). Mesmo recorte do acumulado do ano do Financeiro.
 */
export function retiradasDoAno(
  retiradas: readonly RetiradaApurada[],
  ano: number,
  ateMes?: string,
): TotalPorCategoria {
  const limite = ateMes ?? `${ano}-12`;
  return somarPorCategoria(
    retiradas.filter((r) => {
      const mes = mesDaRetirada(r.retiradaEm);
      return mes.startsWith(`${ano}-`) && mes <= limite;
    }),
  );
}

/** Tudo, desde o primeiro registro. */
export function retiradasNoHistorico(retiradas: readonly RetiradaApurada[]): TotalPorCategoria {
  return somarPorCategoria(retiradas);
}

/** Quanto cada sócio recebeu, por categoria, no recorte dado. Maior primeiro. */
export function retiradasPorSocio(
  retiradas: readonly RetiradaApurada[],
): { socioId: string; totais: TotalPorCategoria }[] {
  const porSocio = new Map<string, RetiradaApurada[]>();
  for (const r of retiradas) {
    if (r.estornada) continue;
    porSocio.set(r.socioId, [...(porSocio.get(r.socioId) ?? []), r]);
  }
  return [...porSocio.entries()]
    .map(([socioId, lista]) => ({ socioId, totais: somarPorCategoria(lista) }))
    .sort((a, b) => b.totais.total - a.totais.total);
}

/* ------------------------------------------------------------------ *
 * Fluxo de caixa
 * ------------------------------------------------------------------ */

/**
 * O dinheiro que entrou e saiu num período, por natureza.
 *
 * Tudo pelo regime de caixa — a data em que o dinheiro entrou ou saiu:
 *
 *   entradas            pagamentos recebidos (as mesmas do "Caixa do mês")
 *   − reembolsos        devolvidos a clientes
 *   − despesas          consumo e custeio pagos (as mesmas do Resultado)
 *   − pró-labore        remuneração dos sócios (despesa, fora do Resultado)
 *   − acervo            compras de acervo pagas (investimento, não despesa)
 *   − retiradas         distribuição de lucros e devolução de aporte
 *   = movimento líquido
 *
 * Não é o saldo do banco: para isso há o saldo disponível, que parte de um
 * saldo inicial informado. O recebido sem data (histórico importado) fica de
 * fora, como no caixa.
 */
export type FluxoDeCaixa = {
  entradas: number;
  reembolsos: number;
  despesasOperacionais: number;
  proLabore: number;
  acervo: number;
  retiradas: TotalPorCategoria;
  saidas: number;
  movimentoLiquido: number;
};

function montarFluxo(
  entradas: number,
  reembolsos: number,
  despesas: number,
  proLabore: number,
  acervo: number,
  retiradas: TotalPorCategoria,
): FluxoDeCaixa {
  const saidas =
    toCentsInt(reembolsos) + toCentsInt(despesas) + toCentsInt(proLabore) + toCentsInt(acervo) + toCentsInt(retiradas.total);
  return {
    entradas,
    reembolsos,
    despesasOperacionais: despesas,
    proLabore,
    acervo,
    retiradas,
    saidas: fromCentsInt(saidas),
    movimentoLiquido: fromCentsInt(toCentsInt(entradas) - saidas),
  };
}

/** Retiradas com data em (de, ate], por categoria. Estornadas não contam. */
export function retiradasEntre(retiradas: readonly RetiradaApurada[], de: string, ate: string): TotalPorCategoria {
  return somarPorCategoria(
    retiradas.filter((r) => {
      const dia = r.retiradaEm.toISOString().slice(0, 10);
      return dia > de && dia <= ate;
    }),
  );
}

export function fluxoDeCaixaDoMes(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  mes: string,
): FluxoDeCaixa {
  return montarFluxo(
    entradasNoCaixa(contratos, mes),
    reembolsosNoMes(contratos, mes),
    despesaDoMes(gastos, mes),
    proLaboreDoMes(gastos, mes),
    acervoDoMes(gastos, mes),
    retiradasDoMes(retiradas, mes),
  );
}

/** De janeiro até `ateMes`, inclusive: a soma dos meses. */
export function fluxoDeCaixaDoAno(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  ano: number,
  ateMes: string,
): FluxoDeCaixa {
  const meses = mesesDoAno(ano).filter((m) => m <= ateMes);
  const soma = (f: (mes: string) => number) => fromCentsInt(meses.reduce((t, m) => t + toCentsInt(f(m)), 0));
  return montarFluxo(
    soma((m) => entradasNoCaixa(contratos, m)),
    soma((m) => reembolsosNoMes(contratos, m)),
    soma((m) => despesaDoMes(gastos, m)),
    soma((m) => proLaboreDoMes(gastos, m)),
    soma((m) => acervoDoMes(gastos, m)),
    retiradasDoAno(retiradas, ano, ateMes),
  );
}

/* ------------------------------------------------------------------ *
 * Controle da distribuição de lucros
 * ------------------------------------------------------------------ */

/**
 * Quanto foi distribuído diante do resultado que havia para distribuir.
 *
 *   Resultado Operacional (a fórmula de sempre, sem mudança)
 *   − pró-labore do período
 *   = resultado após pró-labore
 *
 * É a referência para a distribuição de lucros: distribuir mais do que isso
 * é tirar da empresa dinheiro que o período não gerou. Não é lucro líquido —
 * não considera impostos nem depreciação, como o próprio Resultado
 * Operacional. Devolução de aporte não entra na comparação: é capital
 * devolvido, não lucro.
 */
export type ControleDaDistribuicao = {
  resultadoOperacional: number;
  proLabore: number;
  resultadoAposProLabore: number;
  distribuido: number;
  /** Distribuído acima do resultado após pró-labore (0 quando dentro). */
  distribuidoAcima: number;
};

function montarControle(resultadoOperacional: number, proLabore: number, distribuido: number): ControleDaDistribuicao {
  const apos = toCentsInt(resultadoOperacional) - toCentsInt(proLabore);
  return {
    resultadoOperacional,
    proLabore,
    resultadoAposProLabore: fromCentsInt(apos),
    distribuido,
    distribuidoAcima: fromCentsInt(Math.max(0, toCentsInt(distribuido) - Math.max(0, apos))),
  };
}

export function controleDaDistribuicaoDoMes(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  mes: string,
): ControleDaDistribuicao {
  return montarControle(
    resultadoOperacionalDoMes(contratos, gastos, mes).resultado,
    proLaboreDoMes(gastos, mes),
    retiradasDoMes(retiradas, mes).DISTRIBUICAO_DE_LUCROS,
  );
}

/** De janeiro até `ateMes`: o Resultado Operacional acumulado de sempre, menos o pró-labore do mesmo recorte. */
export function controleDaDistribuicaoDoAno(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  ano: number,
  ateMes: string,
): ControleDaDistribuicao {
  const meses = mesesDoAno(ano).filter((m) => m <= ateMes);
  return montarControle(
    acumuladoNoAno(contratos, gastos, ano, ateMes).resultado,
    fromCentsInt(meses.reduce((t, m) => t + toCentsInt(proLaboreDoMes(gastos, m)), 0)),
    retiradasDoAno(retiradas, ano, ateMes).DISTRIBUICAO_DE_LUCROS,
  );
}

/* ------------------------------------------------------------------ *
 * Saldo disponível
 * ------------------------------------------------------------------ */

/**
 * O saldo inicial da conta num dia, como a gestão o leu no extrato.
 *
 * É o ponto de partida: o sistema não lê o banco. Vale como o saldo no
 * COMEÇO do dia informado (o "saldo anterior" do extrato): tudo o que entrar
 * e sair a partir desse dia, inclusive nele, é somado ou descontado.
 */
export type SaldoDeReferencia = { dia: string; valor: number };

/** O dia anterior a "AAAA-MM-DD". */
function diaAnterior(dia: string): string {
  return new Date(Date.parse(`${dia}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}

/** O fluxo entre o saldo informado e a data pedida, e o saldo que resulta. */
export type SaldoDisponivel = FluxoDeCaixa & {
  referencia: SaldoDeReferencia;
  ate: string;
  saldo: number;
};

/** O movimento de caixa em (de, ate]: as mesmas naturezas do fluxo do mês. */
export function fluxoDeCaixaEntre(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  de: string,
  ate: string,
): FluxoDeCaixa {
  return montarFluxo(
    entradasEntre(contratos, de, ate),
    reembolsosEntre(contratos, de, ate),
    despesaEntre(gastos, de, ate),
    proLaboreEntre(gastos, de, ate),
    acervoEntre(gastos, de, ate),
    retiradasEntre(retiradas, de, ate),
  );
}

/**
 * Saldo disponível em `ate`: o saldo inicial informado mais o que entrou e
 * menos o que saiu do dia dele até `ate` — despesas, pró-labore, reembolsos,
 * acervo e retiradas dos sócios.
 *
 *   saldo inicial (começo do dia de referência)
 *   + entradas − reembolsos − despesas − pró-labore − acervo − retiradas,
 *     de lá até `ate`
 *   = saldo disponível
 *
 * É aqui que a retirada reduz o dinheiro disponível. Faturamento, despesas e
 * Resultado Operacional não leem nada disto. Nulo quando `ate` é anterior ao
 * saldo informado: o painel não reconstrói saldo para trás.
 */
export function saldoDisponivel(
  contratos: readonly ContratoApurado[],
  gastos: readonly GastoApurado[],
  retiradas: readonly RetiradaApurada[],
  referencia: SaldoDeReferencia,
  ate: string,
): SaldoDisponivel | null {
  if (ate < referencia.dia) return null;
  const fluxo = fluxoDeCaixaEntre(contratos, gastos, retiradas, diaAnterior(referencia.dia), ate);
  return {
    ...fluxo,
    referencia,
    ate,
    saldo: fromCentsInt(toCentsInt(referencia.valor) + toCentsInt(fluxo.movimentoLiquido)),
  };
}
