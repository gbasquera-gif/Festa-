import { normalizarParaBusca } from "@festae/shared";

/**
 * Qual fornecedor (ou categoria) a pessoa quis dizer.
 *
 * O ERP guarda esses nomes em texto livre, como foram digitados. Aqui eles
 * nunca são alterados: a normalização (maiúsculas, acentos, espaços,
 * pontuação) serve só para procurar. A regra é não juntar o que não tem
 * evidência de ser a mesma coisa:
 *
 * - **igual** depois de normalizar ("META ADS" e "Meta Ads ") é o mesmo nome:
 *   soma sem perguntar, se for a única correspondência;
 * - **contém** o termo como palavras inteiras ("meta" em "meta ads"): soma
 *   sem perguntar só se for a única grafia encontrada;
 * - **parecido** (erro de digitação): nunca soma sozinho;
 * - mais de uma correspondência distinta ("META" e "META ADS", ou "Meta Ads"
 *   e "Meta Imóveis"): devolve as opções para a pessoa escolher.
 *
 * "META" e "FACEBOOK ADS" não têm nada em comum no texto, então nunca se
 * encontram aqui: unir os dois exige a pessoa dizer.
 */

export type NomeCadastrado = { nome: string; lancamentos: number };

export type Opcao = { nome: string; lancamentos: number; criterio: "IGUAL" | "CONTEM" | "PARECIDO" };

export type Resolucao =
  | { tipo: "ENCONTRADO"; criterio: "IGUAL" | "CONTEM" | "CONFIRMADO"; chaves: string[]; grafias: string[] }
  | { tipo: "AMBIGUO"; opcoes: Opcao[] }
  | { tipo: "NAO_ENCONTRADO" };

/** Semelhança entre 0 e 1 pela distância de edição. */
export function semelhanca(a: string, b: string): number {
  if (a === b) return 1;
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const acima = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = acima;
    }
  }
  return 1 - linha[b.length] / Math.max(a.length, b.length);
}

/** O termo aparece como palavras inteiras dentro do nome. */
export function contemPalavras(nome: string, termo: string): boolean {
  return ` ${nome} `.includes(` ${termo} `);
}

const PARECIDO = 0.8;

/** Os nomes cadastrados agrupados pela chave normalizada: grafias e lançamentos de cada um. */
function porChave(cadastrados: readonly NomeCadastrado[]) {
  const mapa = new Map<string, { grafias: string[]; lancamentos: number }>();
  for (const c of cadastrados) {
    const chave = normalizarParaBusca(c.nome);
    if (!chave) continue;
    const item = mapa.get(chave) ?? { grafias: [], lancamentos: 0 };
    item.grafias.push(c.nome);
    item.lancamentos += c.lancamentos;
    mapa.set(chave, item);
  }
  return mapa;
}

/** A grafia que representa a chave: a mais usada. */
function grafiaPrincipal(item: { grafias: string[] }, cadastrados: readonly NomeCadastrado[]): string {
  return [...item.grafias].sort((a, b) => {
    const na = cadastrados.find((c) => c.nome === a)?.lancamentos ?? 0;
    const nb = cadastrados.find((c) => c.nome === b)?.lancamentos ?? 0;
    return nb - na || a.localeCompare(b);
  })[0].trim();
}

export function resolverNome(termo: string | null | undefined, confirmados: readonly string[] | null | undefined, cadastrados: readonly NomeCadastrado[]): Resolucao {
  const mapa = porChave(cadastrados);

  if (confirmados?.length) {
    // Só vale o que existe: nome confirmado que não está no ERP não vira filtro.
    const chaves = [...new Set(confirmados.map(normalizarParaBusca))].filter((k) => mapa.has(k));
    if (!chaves.length) return { tipo: "NAO_ENCONTRADO" };
    return { tipo: "ENCONTRADO", criterio: "CONFIRMADO", chaves, grafias: chaves.flatMap((k) => mapa.get(k)!.grafias.map((g) => g.trim())) };
  }

  const q = normalizarParaBusca(termo ?? "");
  if (!q) return { tipo: "NAO_ENCONTRADO" };

  const opcoes: (Opcao & { chave: string })[] = [];
  for (const [chave, item] of mapa) {
    const criterio: Opcao["criterio"] | null =
      chave === q
        ? "IGUAL"
        : contemPalavras(chave, q)
          ? "CONTEM"
          : q.length >= 4 && (semelhanca(chave, q) >= PARECIDO || contemPalavras(q, chave))
            ? "PARECIDO"
            : null;
    if (criterio) opcoes.push({ chave, nome: grafiaPrincipal(item, cadastrados), lancamentos: item.lancamentos, criterio });
  }
  if (!opcoes.length) return { tipo: "NAO_ENCONTRADO" };

  const unica = opcoes.length === 1 ? opcoes[0] : null;
  if (unica && unica.criterio !== "PARECIDO") {
    return { tipo: "ENCONTRADO", criterio: unica.criterio, chaves: [unica.chave], grafias: mapa.get(unica.chave)!.grafias.map((g) => g.trim()) };
  }
  const ordem = { IGUAL: 0, CONTEM: 1, PARECIDO: 2 };
  return {
    tipo: "AMBIGUO",
    opcoes: opcoes
      .sort((a, b) => ordem[a.criterio] - ordem[b.criterio] || b.lancamentos - a.lancamentos || a.nome.localeCompare(b.nome))
      .slice(0, 10)
      .map(({ chave: _chave, ...o }) => o),
  };
}

/** Lançamentos sem o campo preenchido que citam o termo na descrição, como palavras inteiras. */
export function citaNaDescricao(descricao: string, termo: string): boolean {
  const q = normalizarParaBusca(termo);
  return q.length >= 2 && contemPalavras(normalizarParaBusca(descricao), q);
}
