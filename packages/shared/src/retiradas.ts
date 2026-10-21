/**
 * Retiradas dos sócios e o fluxo de caixa que as mostra.
 *
 * Retirada é dinheiro que sai da Festaê para um sócio. Não é despesa da
 * operação: não entra em consumo nem custeio, e por isso não mexe no
 * Resultado Operacional — que mede a festa, não o que os sócios decidem tirar
 * dela. Aparece onde é dinheiro saindo: no fluxo de caixa, como saída
 * classificada pela sua natureza.
 *
 * Nada aqui altera as fórmulas de `financeiro.ts`. O fluxo de caixa é uma
 * leitura nova, ao lado das que já existem, montada com as mesmas funções.
 */

import { fromCentsInt, toCentsInt } from "./pricing";
import {
  acervoDoMes,
  despesaDoMes,
  entradasNoCaixa,
  mesesDoAno,
  reembolsosNoMes,
  type ContratoApurado,
  type GastoApurado,
} from "./financeiro";

export const CATEGORIAS_DA_RETIRADA = ["DISTRIBUICAO_DE_LUCROS", "PRO_LABORE", "DEVOLUCAO_DE_APORTE"] as const;
export type CategoriaDaRetirada = (typeof CATEGORIAS_DA_RETIRADA)[number];

export const CATEGORIA_DA_RETIRADA_LABEL: Record<CategoriaDaRetirada, string> = {
  DISTRIBUICAO_DE_LUCROS: "Distribuição de lucros",
  PRO_LABORE: "Pró-labore",
  DEVOLUCAO_DE_APORTE: "Devolução de aporte",
};

/** O que cada categoria é, e o que ela não é. A tela mostra ao escolher. */
export const CATEGORIA_DA_RETIRADA_NOTA: Record<CategoriaDaRetirada, string> = {
  DISTRIBUICAO_DE_LUCROS:
    "Parte do resultado entregue ao sócio. Sai do caixa; não é despesa e não reduz o Resultado Operacional.",
  PRO_LABORE:
    "Remuneração pelo trabalho do sócio. Fica fora do Resultado Operacional (que por definição não inclui pró-labore) e aparece em linha própria. Não lance também em Despesas.",
  DEVOLUCAO_DE_APORTE:
    "Devolução de dinheiro que o sócio colocou na empresa. Sai do caixa; não é lucro nem despesa. Não confundir com a aba Aportes / Acervo, que é compra de acervo.",
};

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
    PRO_LABORE: 0,
    DEVOLUCAO_DE_APORTE: 0,
  };
  for (const r of retiradas) if (!r.estornada) centavos[r.categoria] += toCentsInt(r.valor);
  const total = Object.values(centavos).reduce((t, v) => t + v, 0);
  return {
    DISTRIBUICAO_DE_LUCROS: fromCentsInt(centavos.DISTRIBUICAO_DE_LUCROS),
    PRO_LABORE: fromCentsInt(centavos.PRO_LABORE),
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
 *   − acervo            compras de acervo pagas (investimento, não despesa)
 *   − retiradas         dos sócios, por categoria
 *   = movimento líquido
 *
 * Não é o saldo do banco: o sistema não tem o saldo inicial da conta, e o
 * recebido sem data (histórico importado) fica de fora, como no caixa.
 */
export type FluxoDeCaixa = {
  entradas: number;
  reembolsos: number;
  despesasOperacionais: number;
  acervo: number;
  retiradas: TotalPorCategoria;
  saidas: number;
  movimentoLiquido: number;
};

function montarFluxo(
  entradas: number,
  reembolsos: number,
  despesas: number,
  acervo: number,
  retiradas: TotalPorCategoria,
): FluxoDeCaixa {
  const saidas =
    toCentsInt(reembolsos) + toCentsInt(despesas) + toCentsInt(acervo) + toCentsInt(retiradas.total);
  return {
    entradas,
    reembolsos,
    despesasOperacionais: despesas,
    acervo,
    retiradas,
    saidas: fromCentsInt(saidas),
    movimentoLiquido: fromCentsInt(toCentsInt(entradas) - saidas),
  };
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
    soma((m) => acervoDoMes(gastos, m)),
    retiradasDoAno(retiradas, ano, ateMes),
  );
}
