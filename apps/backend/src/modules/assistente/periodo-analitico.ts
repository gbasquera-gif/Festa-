import { diaEmChapeco } from "@festae/shared";
import { interpretarPeriodo, NOMES_DOS_MESES, normalizar } from "./periodo";

/**
 * Períodos das análises (consultarDespesas), além dos que `periodo.ts` já
 * entende.
 *
 * Regras definidas pela gestão, no fuso de Chapecó:
 *
 * - "últimos 3 meses": o mês atual e os dois anteriores, até hoje
 *   (em 21/10: agosto, setembro e outubro até 21/10);
 * - "últimos 3 meses completos": os três meses fechados antes do atual
 *   (julho, agosto e setembro);
 * - "últimos 90 dias": janela móvel de 90 dias terminando hoje;
 * - "este mês" e "este trimestre": do primeiro dia até hoje para o que já
 *   aconteceu — o valor realizado nunca inclui o futuro (o corte em hoje é
 *   aplicado pela análise, que também precisa do fim do mês para o que
 *   vence depois de hoje);
 * - "mês passado": o mês anterior completo;
 * - "mesmo período do ano anterior": os mesmos limites, um ano antes.
 *
 * O resto ("outubro", "14/11", "este ano", "semana passada"...) continua com
 * `interpretarPeriodo`, que as outras ferramentas usam: nada muda para elas.
 */
export type PeriodoDeAnalise = {
  de: string;
  ate: string;
  rotulo: string;
  observacao?: string;
};

export type ResultadoDoPeriodoDeAnalise = { ok: true; periodo: PeriodoDeAnalise } | { ok: false; erro: string };

/** O começo de "todo o histórico". Antes disso não há lançamento no ERP. */
export const INICIO_DO_HISTORICO = "2020-01-01";

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};
const ORDINAIS: Record<string, number> = { primeiro: 1, segundo: 2, terceiro: 3, quarto: 4, "1o": 1, "2o": 2, "3o": 3, "4o": 4 };

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** O mês `delta` meses antes/depois de (ano, mes). */
function mesDeslocado(ano: number, mes: number, delta: number): [number, number] {
  const total = ano * 12 + (mes - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export function dataCurta(dia: string): string {
  return `${dia.slice(8)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

function nomeDoMes(mes: number): string {
  return NOMES_DOS_MESES[mes - 1];
}

/** `anos` anos antes, no mesmo dia; 29/02 vira 28/02. */
export function anosAntes(dia: string, anos: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return `${a - anos}-${doisDigitos(m)}-${doisDigitos(Math.min(d, ultimoDia(a - anos, m)))}`;
}

/** Um ano antes, no mesmo dia; 29/02 vira 28/02. */
export function umAnoAntes(dia: string): string {
  return anosAntes(dia, 1);
}

/** O ano escrito na expressão: "outubro de 2025", "15/10/2025", "15/10/25". */
function anoEscrito(texto: string): number | null {
  const longo = texto.match(/\b(\d{4})\b/);
  if (longo) return Number(longo[1]);
  const curto = texto.match(/^\d{1,2}\/\d{1,2}\/(\d{2})$/);
  return curto ? 2000 + Number(curto[1]) : null;
}

/** A mesma ponta de intervalo com o ano da outra ponta: "agosto" → "agosto de 2025"; "01/09" → "01/09/2025". */
function comAno(texto: string, ano: number): string | null {
  if (/^\d{1,2}\/\d{1,2}$/.test(texto)) return `${texto}/${ano}`;
  if (NOMES_DOS_MESES.map((n) => normalizar(n)).includes(texto)) return `${texto} de ${ano}`;
  return null;
}

function numero(texto: string): number | null {
  if (/^\d{1,3}$/.test(texto)) return Number(texto);
  return NUMEROS[texto] ?? null;
}

function trimestre(ano: number, n: number): PeriodoDeAnalise {
  const mesInicial = (n - 1) * 3 + 1;
  return {
    de: `${ano}-${doisDigitos(mesInicial)}-01`,
    ate: `${ano}-${doisDigitos(mesInicial + 2)}-${doisDigitos(ultimoDia(ano, mesInicial + 2))}`,
    rotulo: `${n}º trimestre de ${ano} (${nomeDoMes(mesInicial)} a ${nomeDoMes(mesInicial + 2)})`,
  };
}

/**
 * Resolve a expressão de período de uma análise. Não decide o corte em hoje
 * para o que é realizado: isso é da análise, que sabe se a pergunta é sobre
 * o que já foi pago ou sobre o que ainda vence.
 */
export function interpretarPeriodoDeAnalise(expressao: string, agora: Date = new Date()): ResultadoDoPeriodoDeAnalise {
  const hoje = diaEmChapeco(agora);
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  let t = normalizar(expressao)
    .replace(/º|ª/g, "o")
    .replace(/^(em|no|na|nos|nas|de|do|da|para|pra|neste|nesta|nesse|nessa|deste|desta|durante)\s+/, "")
    .replace(/^o\s+|^os\s+/, "");
  if (!t) return { ok: false, erro: "Período não informado." };

  // "... até agora / até hoje": o fim é hoje, para tudo (inclusive o que vence depois).
  let ateHoje = false;
  const corte = t.match(/^(.*?)\s*\bate (?:agora|hoje|o momento|aqui)$/);
  if (corte) {
    ateHoje = true;
    t = corte[1].trim();
    if (!t) {
      return { ok: true, periodo: { de: INICIO_DO_HISTORICO, ate: hoje, rotulo: `todo o histórico até hoje (${dataCurta(hoje)})` } };
    }
  }
  if (/^(tudo|todo o periodo|todo o historico|desde o inicio|sempre)$/.test(t)) {
    return { ok: true, periodo: { de: INICIO_DO_HISTORICO, ate: hoje, rotulo: `todo o histórico até hoje (${dataCurta(hoje)})` } };
  }

  const desde = t.match(/^desde (.+)$/);
  if (desde) {
    t = desde[1];
    ateHoje = true;
  }

  // "Último mês até hoje" não tem leitura segura: o mês passado esticado até
  // hoje seriam quase dois meses; o mês atual seria outra pergunta. Pergunta.
  if (ateHoje && !desde && /^(o )?ultimo mes\b/.test(t)) {
    return { ok: false, erro: `"${expressao}" pode ser o mês atual até hoje, o mês passado ou os últimos 30 dias: diga "este mês até hoje", "mês passado" ou "últimos 30 dias".` };
  }
  const r = interpretarSemCorte(t, expressao, hoje, anoAtual, mesAtual);
  if (!r.ok || !ateHoje) return r;
  // "X até hoje" / "desde X": do começo de X até hoje.
  const p = r.periodo;
  if (p.de > hoje) return { ok: false, erro: `"${expressao}" começa depois de hoje: não há o que considerar "até agora".` };
  if (p.ate > hoje) return { ok: true, periodo: { ...p, ate: hoje, rotulo: `${p.rotulo}, até ${dataCurta(hoje)}` } };
  return { ok: true, periodo: { de: p.de, ate: hoje, rotulo: `de ${dataCurta(p.de)} a ${dataCurta(hoje)}` } };
}

function interpretarSemCorte(t: string, original: string, hoje: string, anoAtual: number, mesAtual: number): ResultadoDoPeriodoDeAnalise {
  // "Último mês" é o mês passado completo, como em `interpretarPeriodo` e em
  // "último trimestre": o mesmo texto não pode dar períodos diferentes
  // conforme a ferramenta.
  if (/^ultimo mes( completo| fechado| cheio)?$/.test(t)) return interpretarSemCorte("mes passado", original, hoje, anoAtual, mesAtual);

  // Últimos N meses (com o atual) e últimos N meses completos (sem o atual).
  let m = t.match(/^(?:ultimos|ultimas) (\S+) meses( completos| fechados| cheios)?$/);
  if (m) {
    const n = numero(m[1]);
    if (!n || n < 1 || n > 36) return { ok: false, erro: `Número de meses inválido em "${original}" (use de 1 a 36).` };
    if (m[2]) {
      const [ai, mi] = mesDeslocado(anoAtual, mesAtual, -n);
      const [af, mf] = mesDeslocado(anoAtual, mesAtual, -1);
      return {
        ok: true,
        periodo: {
          de: `${ai}-${doisDigitos(mi)}-01`,
          ate: `${af}-${doisDigitos(mf)}-${doisDigitos(ultimoDia(af, mf))}`,
          rotulo: `últimos ${n} ${n === 1 ? "mês completo" : "meses completos"} (${nomeDoMes(mi)}${ai !== af ? ` de ${ai}` : ""} a ${nomeDoMes(mf)} de ${af})`,
        },
      };
    }
    const [ai, mi] = mesDeslocado(anoAtual, mesAtual, -(n - 1));
    return {
      ok: true,
      periodo: {
        de: `${ai}-${doisDigitos(mi)}-01`,
        ate: hoje,
        rotulo: `últimos ${n} meses (${dataCurta(`${ai}-${doisDigitos(mi)}-01`)} a ${dataCurta(hoje)})`,
        observacao: `Inclui o mês atual até hoje: ${n > 1 ? `de ${nomeDoMes(mi)}${ai !== anoAtual ? ` de ${ai}` : ""} a ` : ""}${nomeDoMes(mesAtual)} (até ${dataCurta(hoje)}). Para só meses fechados, peça "últimos ${n} meses completos".`,
      },
    };
  }

  // Últimos N dias: janela móvel terminando hoje.
  m = t.match(/^(?:ultimos|ultimas) (\S+) dias$/);
  if (m) {
    const n = numero(m[1]);
    if (!n || n < 1 || n > 731) return { ok: false, erro: `Número de dias inválido em "${original}".` };
    const de = somarDias(hoje, -(n - 1));
    return { ok: true, periodo: { de, ate: hoje, rotulo: `últimos ${n} dias (${dataCurta(de)} a ${dataCurta(hoje)})` } };
  }

  // Trimestres.
  const atual = Math.floor((mesAtual - 1) / 3) + 1;
  if (/^(este|esse|neste|nesse)? ?trimestre( atual| corrente)?$/.test(t) && t.includes("trimestre")) {
    return { ok: true, periodo: trimestre(anoAtual, atual) };
  }
  if (/^(trimestre passado|trimestre anterior|ultimo trimestre)$/.test(t)) {
    return { ok: true, periodo: atual === 1 ? trimestre(anoAtual - 1, 4) : trimestre(anoAtual, atual - 1) };
  }
  m = t.match(/^(primeiro|segundo|terceiro|quarto|[1-4]o?) trimestre(?: de| do ano de)? ?(\d{4})?$/);
  if (m) {
    const n = ORDINAIS[m[1]] ?? Number(m[1].replace("o", ""));
    return { ok: true, periodo: trimestre(m[2] ? Number(m[2]) : anoAtual, n) };
  }

  // O que o intérprete comum entende (mês, dia, ano, semana, "mês passado"...).
  const comum = interpretarPeriodo(t, new Date(`${hoje}T15:00:00Z`));
  if (comum.ok) {
    const p = comum.periodo;
    return { ok: true, periodo: { de: p.de, ate: p.ate, rotulo: p.rotulo, ...(p.observacao ? { observacao: p.observacao } : {}) } };
  }

  // Intervalo: "de 01/09 a 15/10", "entre setembro e novembro", "setembro até hoje".
  m = t.match(/^(?:de |entre |desde )?(.+?) (?:a|ate|e) (.+)$/);
  if (m) {
    const ler = (texto: string) => interpretarSemCorte(texto, texto, hoje, anoAtual, mesAtual);
    const fimTexto = /^(agora|hoje)$/.test(m[2]) ? "hoje" : m[2];
    let inicio = ler(m[1]);
    let fim = ler(fimTexto);
    // O ano escrito numa só ponta vale para as duas: "agosto a outubro de
    // 2025" é agosto de 2025. Se assim o início passar do fim ("novembro a
    // fevereiro de 2026"), o início é do ano anterior; o simétrico para o fim.
    const anoDoInicio = anoEscrito(m[1]);
    const anoDoFim = fimTexto === "hoje" ? null : anoEscrito(fimTexto);
    if (anoDoFim !== null && anoDoInicio === null) {
      const mesmoAno = comAno(m[1], anoDoFim);
      if (mesmoAno) {
        inicio = ler(mesmoAno);
        if (inicio.ok && fim.ok && inicio.periodo.de > fim.periodo.ate) inicio = ler(comAno(m[1], anoDoFim - 1)!);
      }
    } else if (anoDoInicio !== null && anoDoFim === null && fimTexto !== "hoje") {
      const mesmoAno = comAno(fimTexto, anoDoInicio);
      if (mesmoAno) {
        fim = ler(mesmoAno);
        if (inicio.ok && fim.ok && fim.periodo.ate < inicio.periodo.de) fim = ler(comAno(fimTexto, anoDoInicio + 1)!);
      }
    }
    if (inicio.ok && fim.ok) {
      if (fim.periodo.ate < inicio.periodo.de) return { ok: false, erro: `Em "${original}" o fim vem antes do início.` };
      return {
        ok: true,
        periodo: {
          de: inicio.periodo.de,
          ate: fim.periodo.ate,
          rotulo: `de ${dataCurta(inicio.periodo.de)} a ${dataCurta(fim.periodo.ate)}`,
        },
      };
    }
  }

  return {
    ok: false,
    erro: `Não entendi o período "${original}". Exemplos: "outubro", "este mês", "mês passado", "últimos 3 meses", "últimos 90 dias", "este trimestre", "de 01/09 a 15/10".`,
  };
}

/**
 * O período de comparação. "Mesmo período do ano anterior" usa os mesmos
 * limites do período principal um ano antes — inclusive o corte em hoje, se
 * o principal foi cortado. "Período anterior"/"mês anterior" é o bloco de
 * mesmo tamanho logo antes do principal. Qualquer outra expressão é
 * resolvida por si.
 */
export function interpretarComparacao(
  expressao: string,
  principal: PeriodoDeAnalise,
  agora: Date = new Date(),
  /** O fim do período como foi pedido (antes do corte em hoje): é o ano dele que conta em "mesmo período de AAAA". */
  fimPedido: string = principal.ate,
): ResultadoDoPeriodoDeAnalise {
  const PREFIXO = /^(com o|com a|com|o|a|em|no|na)\s+/i;
  const t = normalizar(expressao).replace(PREFIXO, "");
  // "Mesmo período de 2024": o ano escrito decide quantos anos voltar. Conta
  // pelo ano em que o período principal termina: dez/2025–jan/2026 "de 2025"
  // é dez/2024–jan/2025.
  const comAnoEscrito = t.match(/^mesmo periodo (?:de|do ano de|em) (\d{4})$/);
  const anos = comAnoEscrito
    ? Number(fimPedido.slice(0, 4)) - Number(comAnoEscrito[1])
    : /^(mesmo periodo (do|no) ano (anterior|passado)|ano anterior|ano passado no mesmo periodo)$/.test(t)
      ? 1
      : null;
  if (anos !== null) {
    if (anos < 1) return { ok: false, erro: `O ano de comparação (${comAnoEscrito![1]}) precisa ser anterior ao período principal.` };
    const de = anosAntes(principal.de, anos);
    const ate = anosAntes(principal.ate, anos);
    const anoDoRotulo = de.slice(0, 4) === ate.slice(0, 4) ? de.slice(0, 4) : `${de.slice(0, 4)}/${ate.slice(0, 4)}`;
    return { ok: true, periodo: { de, ate, rotulo: `mesmo período de ${anoDoRotulo} (${dataCurta(de)} a ${dataCurta(ate)})` } };
  }
  if (/^(periodo anterior|mes anterior)$/.test(t)) {
    const [a, m] = principal.de.split("-").map(Number);
    const inteiroDeMeses =
      principal.de.endsWith("-01") && principal.ate === `${principal.ate.slice(0, 7)}-${doisDigitos(ultimoDia(Number(principal.ate.slice(0, 4)), Number(principal.ate.slice(5, 7))))}`;
    if (inteiroDeMeses || t === "mes anterior") {
      const meses = t === "mes anterior" ? 1 : (Number(principal.ate.slice(0, 4)) - a) * 12 + (Number(principal.ate.slice(5, 7)) - m) + 1;
      const [ai, mi] = mesDeslocado(a, m, -meses);
      const [af, mf] = mesDeslocado(a, m, -1);
      const de = `${ai}-${doisDigitos(mi)}-01`;
      const ate = `${af}-${doisDigitos(mf)}-${doisDigitos(ultimoDia(af, mf))}`;
      return { ok: true, periodo: { de, ate, rotulo: meses === 1 ? `${nomeDoMes(mi)} de ${ai}` : `de ${dataCurta(de)} a ${dataCurta(ate)}` } };
    }
    const dias = Math.round((Date.parse(`${principal.ate}T12:00:00Z`) - Date.parse(`${principal.de}T12:00:00Z`)) / 86_400_000) + 1;
    const ate = somarDias(principal.de, -1);
    const de = somarDias(ate, -(dias - 1));
    return { ok: true, periodo: { de, ate, rotulo: `os ${dias} dias anteriores (${dataCurta(de)} a ${dataCurta(ate)})` } };
  }
  // Qualquer outro período, sem o "com o"/"com" do começo ("com o mês passado", "com setembro").
  return interpretarPeriodoDeAnalise(expressao.trim().replace(PREFIXO, ""), agora);
}
