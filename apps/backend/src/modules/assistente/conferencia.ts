import { normalizarParaBusca } from "@festae/shared";

/**
 * Conferência dos números de uma resposta contra o que as ferramentas devolveram.
 *
 * A resposta que a IA escreve não é confiável por si: ela pode somar, arredondar,
 * trocar um total filtrado pelo geral ou inverter "a mais" e "a menos". Então,
 * antes de a resposta sair, cada número com significado financeiro é lido como
 * um VALOR TIPADO — dinheiro em centavos, percentual em centésimos de ponto,
 * quantidade de lançamentos — com a direção que o texto lhe dá (sinal, "a mais",
 * "queda"...). Os resultados das ferramentas passam pela mesma leitura e viram
 * os FATOS do turno, cada um com a ferramenta de origem. A resposta só sai se
 * cada valor dela for igual a um fato do mesmo tipo, da origem certa, e não
 * contradisser a direção dele. A comparação é exata, em inteiros:
 * "R$ 1.234,50", "R$1234,5" e "1.234,50 reais" são o mesmo valor; "cerca de
 * R$ 1,2 mil" não é R$ 1.234,50.
 *
 * Datas, anos e "3 meses" não são lidos: não são valores financeiros e o
 * período é dito pelo servidor em "periodo".
 */

export type TipoDeValor = "MOEDA" | "PERCENTUAL" | "LANCAMENTOS";
export type Direcao = "MAIS" | "MENOS";

export type Valor = {
  tipo: TipoDeValor;
  /** Centavos (MOEDA), centésimos de ponto percentual (PERCENTUAL) ou unidades. -1: valor que nunca confere (mais casas do que a moeda tem). */
  absoluto: number;
  direcao: Direcao | null;
  trecho: string;
  /** A frase do texto onde o valor está (para os valores de uma resposta). */
  frase?: string;
  /** Onde o valor começa e termina dentro de `frase`. */
  naFrase?: [number, number];
  /** Fato que é só o tamanho de uma amostra ("os 10 lançamentos mais recentes"): vale numa frase que fale da amostra. */
  amostra?: boolean;
  /** De onde o fato veio: o nome da ferramenta, ou "servidor" para as frases que o servidor acrescentou. */
  origem?: string;
};

/** Uma palavra (ou expressão) inteira, com fronteira que entende acento: `\b` do JavaScript só conhece ASCII. */
const inteira = (alternativas: string) => `(?<![\\p{L}\\d])(?:${alternativas})(?![\\p{L}\\d])`;

const NUMERO = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`;
const SINAL = "[+\\-−]";
const ESCALA = String.raw`mil|milh(?:ão|ao|ões|oes)|bilh(?:ão|ao|ões|oes)`;

/**
 * Uma única leitura, da esquerda para a direita; em cada posição vale a
 * primeira forma que casar: R$, "reais", percentual, lançamentos e, por fim,
 * número solto com duas casas decimais (dinheiro escrito sem R$).
 */
const VALORES = new RegExp(
  [
    `(?<sm>${SINAL})?R\\$\\s?(?<moeda>${NUMERO})(?:\\s?(?<em>${ESCALA})(?![\\p{L}\\d]))?`,
    `(?<sr>${SINAL})?(?<reais>${NUMERO})\\s?(?:(?<er>${ESCALA})\\s(?:de\\s)?)?(?:reais|real)(?![\\p{L}\\d])`,
    `(?<sp>${SINAL})?(?<pct>${NUMERO})\\s?(?:%|por\\s?cento(?![\\p{L}\\d]))`,
    `(?<lanc>\\d+)\\s(?:lançamentos?|lancamentos?)(?![\\p{L}\\d])`,
    `(?<ss>${SINAL})?(?<solto>\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})(?![\\d%])(?!\\s?(?:meses|mês|mes|dias|dia|vezes|anos|ano)(?![\\p{L}\\d]))`,
  ].join("|"),
  "giu",
);

const PALAVRAS_DE_MAIS = new RegExp(
  inteira("a mais|aumento|aumentou|aumentaram|alta|subiu|subiram|cresceu|cresceram|crescimento|acima|acréscimo|acrescimo|mais do que"),
  "iu",
);
const PALAVRAS_DE_MENOS = new RegExp(
  inteira("a menos|queda|caiu|caíram|cairam|redução|reducao|reduziu|reduziram|diminuiu|diminuíram|diminuiram|diminuição|diminuicao|abaixo|recuo|recuou|menos do que|economia"),
  "iu",
);

const ESCALAS: Record<string, number> = { mil: 1_000, milhao: 1_000_000, milhoes: 1_000_000, bilhao: 1_000_000_000, bilhoes: 1_000_000_000 };

/** "1.234,5" com `casas` casas de unidade: 1.234,5 em centavos (casas = 2) é 123450. -1 se o número tem mais casas do que a unidade. */
function emInteiro(bruto: string, casas: number, escala = 1): number {
  const [inteiro, decimal = ""] = bruto.replace(/\./g, "").split(",");
  const digitos = Number(`${inteiro}${decimal}`);
  const valor = (digitos * escala * 10 ** casas) / 10 ** decimal.length;
  return Number.isInteger(valor) ? valor : -1;
}

function escalaDe(texto: string | undefined): number {
  return texto ? (ESCALAS[normalizarParaBusca(texto)] ?? 1) : 1;
}

/** Onde cada frase do texto termina (uma passada só). O ponto de milhar ("1.234") não fecha frase. */
function finsDeFrase(texto: string): number[] {
  return [...texto.matchAll(/[;!?\n]|\.(?=\s|$)/g)].map((m) => m.index!);
}

/** A frase que contém [inicio, fim): do fim da frase anterior ao fim desta. */
function limitesDaFrase(fins: readonly number[], tamanho: number, inicio: number, fim: number): [number, number] {
  let antes = 0;
  for (const f of fins) {
    if (f >= fim) return [antes, f];
    if (f < inicio) antes = f + 1;
  }
  return [antes, tamanho];
}

function direcaoNasPalavras(trecho: string): Direcao | null {
  const mais = PALAVRAS_DE_MAIS.test(trecho);
  const menos = PALAVRAS_DE_MENOS.test(trecho);
  return mais === menos ? null : mais ? "MAIS" : "MENOS";
}

/** Separa a cláusula do valor: outro número (mesmo um que não é valor, como "2 mil"), vírgula ou parêntese. */
const FIM_DA_CLAUSULA = /[\d(),]/;

/** Os valores financeiros do texto, com a direção que o texto lhes dá. */
export function extrairValores(texto: string): Valor[] {
  const achados = [...texto.matchAll(VALORES)];
  const fins = achados.length ? finsDeFrase(texto) : [];
  return achados.map((m) => {
    const g = m.groups!;
    const inicio = m.index!;
    const fim = inicio + m[0].length;
    const sinal = g.sm ?? g.sr ?? g.sp ?? g.ss ?? null;
    let tipo: TipoDeValor;
    let absoluto: number;
    if (g.moeda !== undefined) [tipo, absoluto] = ["MOEDA", emInteiro(g.moeda, 2, escalaDe(g.em))];
    else if (g.reais !== undefined) [tipo, absoluto] = ["MOEDA", emInteiro(g.reais, 2, escalaDe(g.er))];
    else if (g.pct !== undefined) [tipo, absoluto] = ["PERCENTUAL", emInteiro(g.pct, 2)];
    else if (g.lanc !== undefined) [tipo, absoluto] = ["LANCAMENTOS", Number(g.lanc)];
    else [tipo, absoluto] = ["MOEDA", emInteiro(g.solto, 2)];

    // A direção: o sinal escrito; senão, a palavra mais próxima na mesma
    // cláusula — primeiro logo depois ("R$ 50,00 a menos"), depois logo antes
    // ("queda de 12,3%") —, sem atravessar outro número, vírgula ou parêntese.
    let direcao: Direcao | null = sinal === "+" ? "MAIS" : sinal === "-" || sinal === "−" ? "MENOS" : null;
    const [iniFrase, fimFrase] = limitesDaFrase(fins, texto.length, inicio, fim);
    if (!direcao && tipo !== "LANCAMENTOS") {
      const depoisBruto = texto.slice(fim, Math.min(fim + 30, fimFrase));
      const corteDepois = depoisBruto.search(FIM_DA_CLAUSULA);
      const depois = corteDepois === -1 ? depoisBruto : depoisBruto.slice(0, corteDepois);
      const antesBruto = texto.slice(Math.max(inicio - 40, iniFrase), inicio);
      let corteAntes = -1;
      for (let i = antesBruto.length - 1; i >= 0; i--) {
        if (FIM_DA_CLAUSULA.test(antesBruto[i])) {
          corteAntes = i;
          break;
        }
      }
      direcao = direcaoNasPalavras(depois) ?? direcaoNasPalavras(antesBruto.slice(corteAntes + 1));
    }
    return { tipo, absoluto, direcao, trecho: m[0].trim(), frase: texto.slice(iniFrase, fimFrase), naFrase: [inicio - iniFrase, fim - iniFrase] };
  });
}

/** Chaves numéricas dos resultados que são quantidade de lançamentos. */
const CHAVES_DE_LANCAMENTOS = new Set(["lancamentos", "lancamentosNoHistorico", "aPagarNoPeriodo"]);
/** Textos dos resultados que descrevem uma amostra, não a quantidade. */
const CHAVES_DE_AMOSTRA = new Set(["listaCortada"]);

/**
 * Esta ocorrência de "N lançamentos" é dita como amostra, colada às palavras
 * dela: "os 10 lançamentos mais recentes", "últimos 10 lançamentos", "amostra
 * com os 10 lançamentos". Conta a ocorrência, não a frase: em "foram 10
 * lançamentos, e abaixo estão os 10 lançamentos mais recentes" a primeira
 * continua sendo quantidade.
 */
function ditoComoAmostra(v: Valor): boolean {
  if (!v.frase || !v.naFrase) return false;
  const antes = v.frase.slice(0, v.naFrase[0]);
  const depois = v.frase.slice(v.naFrase[1]);
  return /^\s+mais\s+recentes(?![\p{L}\d])/iu.test(depois) || /(?<![\p{L}\d])(?:primeiros|últimos|ultimos|amostra\s+(?:com|de)(?:\s+os)?)\s+$/iu.test(antes);
}

/** Texto entre aspas: no que o servidor escreve, é sempre o que alguém digitou (termo, período), nunca um valor calculado. */
const ENTRE_ASPAS = /"[^"]*"|“[^”]*”|«[^»]*»/g;

/**
 * Os fatos de um turno: os valores de cada resultado, com a origem e o
 * índice do resultado.
 *
 * O texto que veio do modelo não pode virar fato. O servidor às vezes o
 * repete na resposta ("Não entendi o período …", "da categoria …"): sempre
 * entre aspas, e às vezes encurtado ou normalizado — por isso todo trecho
 * entre aspas é ignorado; e `ecos` (os argumentos das chamadas) são apagados
 * também onde aparecem sem aspas.
 */
export function fatosDoTurno(fontes: readonly { origem: string; dados: unknown }[], ecos: readonly string[] = []): (Valor & { fonte: number })[] {
  // O eco sai primeiro (e nunca do meio de um número: "234" não parte "R$ 1.234,50"); depois, o que está entre aspas.
  const apagar = [...new Set(ecos.map((e) => e.trim()).filter((e) => e.length >= 3))]
    .sort((a, b) => b.length - a.length)
    .map((e) => new RegExp(`(?<![\\d.,])${e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\d.,])`, "g"));
  const limpo = (texto: string) => apagar.reduce((t, e) => t.replace(e, " "), texto).replace(ENTRE_ASPAS, " ");
  const fatos: (Valor & { fonte: number })[] = [];
  fontes.forEach(({ origem, dados }, fonte) => {
    const visitar = (v: unknown, chave?: string) => {
      if (typeof v === "string") {
        for (const { frase: _frase, ...f } of extrairValores(limpo(v))) {
          fatos.push({ ...f, origem, fonte, ...(chave && CHAVES_DE_AMOSTRA.has(chave) && f.tipo === "LANCAMENTOS" ? { amostra: true } : {}) });
        }
      } else if (typeof v === "number" && Number.isInteger(v) && chave && CHAVES_DE_LANCAMENTOS.has(chave)) {
        fatos.push({ tipo: "LANCAMENTOS", absoluto: v, direcao: null, trecho: String(v), origem, fonte });
      } else if (Array.isArray(v)) for (const x of v) visitar(x);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) visitar(x, k);
    };
    visitar(dados);
  });
  return fatos;
}

/** Os fatos de resultados sem origem marcada (para conferências simples). */
export function fatosDosResultados(fontes: readonly unknown[]): Valor[] {
  return fatosDoTurno(fontes.map((dados) => ({ origem: "", dados })));
}

/**
 * Os valores do texto que não conferem com os fatos: ausentes, de outro tipo
 * ou com a direção trocada. Vazio quando a resposta pode sair como está.
 */
export function divergencias(texto: string, fatos: readonly Valor[]): Valor[] {
  return extrairValores(texto).filter((v) => {
    if (v.absoluto < 0) return true;
    const iguais = fatos.filter((f) => f.tipo === v.tipo && f.absoluto === v.absoluto);
    if (!iguais.length) return true;
    // Só o tamanho da amostra tem esse número: confere só dito como amostra, colado às palavras dela.
    if (iguais.every((f) => f.amostra) && !ditoComoAmostra(v)) return true;
    if (!v.direcao) return false;
    const comDirecao = iguais.filter((f) => f.direcao);
    return comDirecao.length > 0 && !comDirecao.some((f) => f.direcao === v.direcao);
  });
}

/** As frases de um texto, em ordem (o ponto de milhar e o decimal não quebram frase). */
export function frasesDoTexto(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/** Palavras que afirmam alta ou queda sem precisar de número ("os gastos caíram"). */
const ALTA_SEM_NUMERO = new RegExp(inteira("aumento|aumentou|aumentaram|subiu|subiram|cresceu|cresceram|crescimento|em alta|alta de"), "iu");
const QUEDA_SEM_NUMERO = new RegExp(
  inteira("queda|caiu|caíram|cairam|redução|reducao|reduziu|reduziram|diminuiu|diminuíram|diminuiram|diminuição|diminuicao|recuo|recuou|recuaram"),
  "iu",
);

/**
 * O texto afirma, com ou sem número, a direção contrária à das comparações:
 * elas deram alta (só alta) e o texto fala em queda, ou o contrário. Com
 * comparações das duas direções, não há o que afirmar e nada é bloqueado aqui.
 */
export function contradizDirecao(texto: string, direcoes: ReadonlySet<Direcao>): boolean {
  if (direcoes.size !== 1) return false;
  return direcoes.has("MAIS") ? QUEDA_SEM_NUMERO.test(texto) : ALTA_SEM_NUMERO.test(texto);
}

// ---------------------------------------------------------------- a conferência de uma resposta

/**
 * Um resultado do turno. `termos` e `termosDeCategoria`: o que a pessoa (ou o
 * modelo) usou como filtro de fornecedor e de categoria nessa chamada de
 * consultarDespesas, já com os nomes reais.
 */
export type ResultadoParaConferir = {
  nome: string;
  dados: Record<string, unknown>;
  termos?: readonly string[];
  termosDeCategoria?: readonly string[];
};

/** Código de nome na resposta: [F1] ou «F1» (fornecedor, categoria, cliente, sócio). */
const CODIGO = /\[([FKCS]\d{1,4})\]|«([FKCS]\d{1,4})»/g;
const CODIGO_DE_DESPESA = String.raw`\[[FK]\d{1,4}\]|«[FK]\d{1,4}»`;

/** Frase que fala de despesa, para a conferência de direção numa pergunta mista. */
const FALA_DE_DESPESA = new RegExp(`${CODIGO_DE_DESPESA}|${inteira("gast\\p{L}*|despesas?|fornecedor\\p{L}*|categoria\\p{L}*|pag(?:o|os|a|as|amos)|lan[çc]amentos?")}`, "iu");
const FALA_DE_FILTRO = new RegExp(`${CODIGO_DE_DESPESA}|${inteira("fornecedor\\p{L}*|categoria\\p{L}*")}`, "iu");

/** A direção da comparação de um resultado de despesas ("a mais" / "a menos"). */
function direcaoDaComparacao(r: ResultadoParaConferir): Direcao | null {
  if (r.nome !== "consultarDespesas") return null;
  const diferenca = (r.dados.comparacao as { diferenca?: unknown } | undefined)?.diferenca;
  if (typeof diferenca !== "string") return null;
  return / a mais /.test(` ${diferenca} `) ? "MAIS" : / a menos /.test(` ${diferenca} `) ? "MENOS" : null;
}

/** Os códigos de um texto, sem colchetes ("F1"). */
function codigosDe(texto: string): Set<string> {
  return new Set([...texto.matchAll(CODIGO)].map((m) => m[1] ?? m[2]));
}

/**
 * As marcas do filtro de nome de um resultado de despesas: os códigos dos
 * nomes considerados e do termo, e os termos que a pessoa usou. Uma frase que
 * cita uma dessas marcas fala daquele recorte.
 */
function marcasDoFiltro(r: ResultadoParaConferir): { codigos: Set<string>; termos: string[]; termosDeCategoria: string[] } {
  const codigos = new Set<string>();
  const normalizar = (lista?: readonly string[]) => (lista ?? []).map(normalizarParaBusca).filter((t) => t.length >= 2);
  const termos = normalizar(r.termos);
  const termosDeCategoria = normalizar(r.termosDeCategoria);
  if (r.nome !== "consultarDespesas") return { codigos, termos: [], termosDeCategoria: [] };
  // Os códigos do filtro inteiro: nomes considerados, o termo digitado (no critério,
  // inclusive quando não houve correspondência) e a mensagem de ausência.
  const filtros = r.dados.filtrosAplicados as Record<string, unknown> | undefined;
  for (const campo of ["fornecedor", "categoria"]) {
    if (filtros?.[campo]) for (const c of codigosDe(JSON.stringify(filtros[campo]))) codigos.add(c);
  }
  for (const c of codigosDe(JSON.stringify(r.dados.semCorrespondencia ?? ""))) codigos.add(c);
  return { codigos, termos, termosDeCategoria };
}

/**
 * Confere uma resposta, frase a frase.
 *
 * - Frase que cita o recorte de uma consulta de despesas (o código do
 *   fornecedor ou da categoria filtrados, ou o termo que a pessoa usou):
 *   seus valores têm de vir DAQUELA consulta. Nem o total de outra
 *   ferramenta, nem o total sem filtro de outra consulta de despesas, nem o
 *   de outro fornecedor passa por total desse recorte.
 * - Frase que fala de "fornecedor"/"categoria" sem citar um recorte, numa
 *   pergunta mista: valores das consultas de despesas.
 * - As outras frases: valores de qualquer ferramenta do turno ou das frases do servidor.
 * - Nenhuma frase sobre despesa pode afirmar a direção contrária à da comparação.
 *
 * `preservadas`: as frases que trazem resultado conferido de outra ferramenta
 * (o Financeiro numa pergunta mista) — elas ficam se o resto for trocado.
 */
export function conferirResposta(
  texto: string,
  resultados: readonly ResultadoParaConferir[],
  extras: { frasesDoServidor?: readonly string[]; ecos?: readonly string[] } = {},
): { confere: boolean; preservadas: string[] } {
  const fatos = fatosDoTurno(
    [...resultados.map((r) => ({ origem: r.nome, dados: r.dados })), ...(extras.frasesDoServidor ?? []).map((f) => ({ origem: "servidor", dados: f }))],
    extras.ecos,
  );
  const dasDespesas = fatos.filter((f) => f.origem === "consultarDespesas");
  const haOutras = resultados.some((r) => r.nome !== "consultarDespesas");
  const marcas = resultados.map(marcasDoFiltro);
  // O código marca a frase sempre; o nome de fornecedor digitado também. O
  // termo de categoria, que costuma ser palavra comum, só marca a frase que
  // fala de despesa ("a festa de sábado" não é a categoria "festa").
  const recortesCitados = (frase: string) => {
    const codigos = codigosDe(frase);
    const normalizada = ` ${normalizarParaBusca(frase)} `;
    const cita = (t: string) => normalizada.includes(` ${t} `);
    const falaDeDespesa = FALA_DE_DESPESA.test(frase);
    return marcas.flatMap((m, i) =>
      [...m.codigos].some((c) => codigos.has(c)) || m.termos.some(cita) || (falaDeDespesa && m.termosDeCategoria.some(cita)) ? [i] : [],
    );
  };

  let confere = true;
  const preservadas: string[] = [];
  // Itens de lista e linhas depois de um título com ":" falam do recorte do título.
  let doTitulo: number[] = [];
  for (const linha of frasesDoTexto(texto)) {
    const frase = linha;
    const proprios = recortesCitados(frase);
    const item = /^\s*(?:[•\-*–]|\d+[.)])\s/.test(frase);
    const citados = proprios.length ? proprios : item ? doTitulo : [];
    if (!item) doTitulo = /:\s*$/.test(frase) || proprios.length ? proprios : [];
    const doFiltro = citados.length > 0 || (haOutras && FALA_DE_FILTRO.test(frase));
    const conferivel = citados.length ? fatos.filter((f) => citados.includes(f.fonte)) : doFiltro ? dasDespesas : fatos;
    const direcoes = new Set((citados.length ? citados.map((i) => resultados[i]) : resultados).map(direcaoDaComparacao).filter((d): d is Direcao => d !== null));
    const direcaoTrocada = (!haOutras || FALA_DE_DESPESA.test(frase)) && contradizDirecao(frase, direcoes);
    if (divergencias(frase, conferivel).length || direcaoTrocada) {
      confere = false;
      continue;
    }
    const valores = extrairValores(frase);
    const deOutra = valores.some((v) => fatos.some((f) => f.origem !== "consultarDespesas" && f.tipo === v.tipo && f.absoluto === v.absoluto));
    if (haOutras && !doFiltro && valores.length && deOutra) preservadas.push(frase);
  }
  return { confere, preservadas };
}
