/**
 * O núcleo das análises: somar, contar, tirar média, achar o maior e o
 * menor e agrupar — sempre em centavos inteiros. A comparação entre períodos
 * usa a `variacao` oficial do Financeiro, a mesma da Evolução.
 *
 * Não conhece despesa, festa nem proposta. Cada módulo (hoje, as despesas;
 * depois, receitas, reservas, propostas) escolhe os seus registros pelas
 * regras oficiais dele e passa por aqui só a parte aritmética. Assim a conta
 * é uma só, testada uma vez, e nenhum número sai de ponto flutuante.
 */

/**
 * Um nome como chave de busca: sem acento, minúsculo, pontuação e espaços
 * repetidos viram um espaço. "META  ADS", "Meta-Ads" e "meta ads" dão a mesma
 * chave. Serve só para procurar e agrupar: o nome gravado nunca é alterado.
 */
export function normalizarParaBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Um registro já reduzido ao que a conta precisa: o valor em centavos. */
export type ComValor = { centavos: number };

export type Agregado<T> = {
  totalCentavos: number;
  quantidade: number;
  /** Média por registro, arredondada ao centavo (meio centavo arredonda para longe do zero). Nula sem registros. */
  mediaCentavos: number | null;
  maior: T | null;
  menor: T | null;
};

/** Divisão em centavos com arredondamento comercial: 0,5 vai para longe do zero. */
export function dividirCentavos(centavos: number, por: number): number {
  if (por <= 0) throw new Error("divisor precisa ser positivo");
  const sinal = centavos < 0 ? -1 : 1;
  return sinal * Math.round(Math.abs(centavos) / por);
}

export function agregar<T extends ComValor>(itens: readonly T[]): Agregado<T> {
  let total = 0;
  let maior: T | null = null;
  let menor: T | null = null;
  for (const item of itens) {
    if (!Number.isInteger(item.centavos)) throw new Error("valor fora de centavos inteiros");
    total += item.centavos;
    if (!maior || item.centavos > maior.centavos) maior = item;
    if (!menor || item.centavos < menor.centavos) menor = item;
  }
  return {
    totalCentavos: total,
    quantidade: itens.length,
    mediaCentavos: itens.length ? dividirCentavos(total, itens.length) : null,
    maior,
    menor,
  };
}

export type Grupo = { chave: string; totalCentavos: number; quantidade: number };

/**
 * Agrupa e devolve os maiores grupos, mais um "outros" com o resto: a soma
 * dos grupos com o "outros" é sempre o total, para a resposta fechar.
 */
export function agrupar<T extends ComValor>(
  itens: readonly T[],
  chave: (item: T) => string,
  limite: number,
): { grupos: Grupo[]; outros: { totalCentavos: number; quantidade: number; grupos: number } | null } {
  const mapa = new Map<string, Grupo>();
  for (const item of itens) {
    const k = chave(item);
    const g = mapa.get(k) ?? { chave: k, totalCentavos: 0, quantidade: 0 };
    g.totalCentavos += item.centavos;
    g.quantidade += 1;
    mapa.set(k, g);
  }
  const ordenados = [...mapa.values()].sort(
    (a, b) => b.totalCentavos - a.totalCentavos || b.quantidade - a.quantidade || a.chave.localeCompare(b.chave),
  );
  const grupos = ordenados.slice(0, limite);
  const resto = ordenados.slice(limite);
  return {
    grupos,
    outros: resto.length
      ? {
          totalCentavos: resto.reduce((s, g) => s + g.totalCentavos, 0),
          quantidade: resto.reduce((s, g) => s + g.quantidade, 0),
          grupos: resto.length,
        }
      : null,
  };
}
