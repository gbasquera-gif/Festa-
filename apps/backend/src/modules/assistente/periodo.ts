import { diaEmChapeco } from "@festae/shared";

/**
 * O período de uma pergunta, resolvido no servidor.
 *
 * O modelo de IA repassa a expressão que a pessoa usou ("novembro", "amanhã",
 * "próximo sábado", "14/11") e quem transforma isso em datas é este arquivo,
 * sempre no relógio de Chapecó. Deixar a conta de calendário com o modelo
 * seria aceitar que ele erre o dia da semana ou o ano de vez em quando — e
 * um "amanhã" errado responde sobre a festa de outra cliente.
 *
 * Datas são dias do calendário "AAAA-MM-DD", inclusive nas duas pontas.
 */
export type Periodo = {
  tipo: "DIA" | "INTERVALO" | "MES" | "ANO";
  de: string;
  ate: string;
  /** Os meses "AAAA-MM" que o período toca, em ordem. */
  meses: string[];
  /** Como a resposta deve nomear o período: "novembro de 2026", "sábado, 24/10/2026". */
  rotulo: string;
  /** Presente quando houve uma escolha que a pessoa precisa saber (o ano assumido, por exemplo). */
  observacao?: string;
};

export type ResultadoDoPeriodo = { ok: true; periodo: Periodo } | { ok: false; erro: string };

export const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

const DIAS_DA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Sem acento, minúsculo, espaços simples: "Próximo Sábado" e "proximo  sabado" são a mesma coisa. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MESES_NORMALIZADOS = NOMES_DOS_MESES.map((m) => normalizar(m));
const ABREVIACOES = MESES_NORMALIZADOS.map((m) => m.slice(0, 3));
const SEMANA_NORMALIZADA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terca: 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sabado: 6,
};

// ---------------------------------------------------------------- calendário

/** Dia do calendário como data UTC ao meio-dia: soma de dias sem tropeçar em fuso. */
function paraData(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`);
}

function paraDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(dia: string, dias: number): string {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraDia(d);
}

function diaDaSemana(dia: string): number {
  return paraData(dia).getUTCDay();
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = de.slice(0, 7).split("-").map(Number);
  const fim = ate.slice(0, 7);
  for (;;) {
    const atual = `${ano}-${doisDigitos(mes)}`;
    meses.push(atual);
    if (atual >= fim) break;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

/** "sábado, 24/10/2026". */
export function rotuloDoDia(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${DIAS_DA_SEMANA[diaDaSemana(dia)]}, ${d}/${m}/${a}`;
}

function rotuloDoMes(ano: number, mes: number): string {
  return `${NOMES_DOS_MESES[mes - 1]} de ${ano}`;
}

function periodoDoDia(dia: string, observacao?: string): Periodo {
  return { tipo: "DIA", de: dia, ate: dia, meses: [dia.slice(0, 7)], rotulo: rotuloDoDia(dia), ...(observacao ? { observacao } : {}) };
}

function periodoDoMes(ano: number, mes: number, observacao?: string): Periodo {
  const de = `${ano}-${doisDigitos(mes)}-01`;
  const ate = `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDiaDoMes(ano, mes))}`;
  return { tipo: "MES", de, ate, meses: [de.slice(0, 7)], rotulo: rotuloDoMes(ano, mes), ...(observacao ? { observacao } : {}) };
}

function periodoDoAno(ano: number): Periodo {
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;
  return { tipo: "ANO", de, ate, meses: mesesEntre(de, ate), rotulo: `${ano}` };
}

function intervalo(de: string, ate: string, rotulo: string): Periodo {
  return { tipo: "INTERVALO", de, ate, meses: mesesEntre(de, ate), rotulo };
}

function diaValido(ano: number, mes: number, dia: number): boolean {
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDiaDoMes(ano, mes);
}

/** Ano com dois dígitos é deste século: "14/11/26" é 2026. */
function anoCompleto(texto: string): number {
  const n = Number(texto);
  return texto.length <= 2 ? 2000 + n : n;
}

function indiceDoMes(palavra: string): number | null {
  const i = MESES_NORMALIZADOS.indexOf(palavra);
  if (i >= 0) return i + 1;
  const j = ABREVIACOES.indexOf(palavra);
  return j >= 0 ? j + 1 : null;
}

// ---------------------------------------------------------------- intérprete

/**
 * Resolve uma expressão de período.
 *
 * Mês ou dia sem ano ficam no ano corrente. Quando isso põe a data no
 * passado — "janeiro" perguntado em outubro —, a resposta leva uma
 * observação: a pessoa pode estar pensando no próximo janeiro, e a escolha
 * tem de aparecer em vez de ficar escondida no número.
 */
export function interpretarPeriodo(expressao: string, agora: Date = new Date()): ResultadoDoPeriodo {
  const hoje = diaEmChapeco(agora);
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  const t = normalizar(expressao)
    .replace(/^(em|no|na|nos|nas|de|do|da|para|pra|neste|nesta|nesse|nessa|deste|desta)\s+/, "")
    .replace(/^o\s+/, "");

  if (!t) return { ok: false, erro: "Período não informado." };

  // ISO: 2026-11-14, 2026-11, 2026.
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return diaValido(ano, mes, dia) ? { ok: true, periodo: periodoDoDia(m[0]) } : { ok: false, erro: `Data inválida: ${expressao}.` };
  }
  m = t.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { ok: true, periodo: periodoDoMes(Number(m[1]), Number(m[2])) };
  m = t.match(/^(?:ano (?:de )?)?(\d{4})$/);
  if (m) return { ok: true, periodo: periodoDoAno(Number(m[1])) };

  // Relativos de dia.
  if (t === "hoje") return { ok: true, periodo: periodoDoDia(hoje) };
  if (t === "amanha") return { ok: true, periodo: periodoDoDia(somarDias(hoje, 1)) };
  if (t === "depois de amanha") return { ok: true, periodo: periodoDoDia(somarDias(hoje, 2)) };
  if (t === "ontem") return { ok: true, periodo: periodoDoDia(somarDias(hoje, -1)) };

  // Semana: de segunda a domingo.
  const segundaDestaSemana = somarDias(hoje, -((diaDaSemana(hoje) + 6) % 7));
  if (/^(esta|essa|nesta|nessa)? ?semana( atual)?$/.test(t) && t.includes("semana") && !t.includes("que vem")) {
    return { ok: true, periodo: intervalo(segundaDestaSemana, somarDias(segundaDestaSemana, 6), "esta semana") };
  }
  if (/^(proxima semana|semana que vem)$/.test(t)) {
    const de = somarDias(segundaDestaSemana, 7);
    return { ok: true, periodo: intervalo(de, somarDias(de, 6), "a próxima semana") };
  }
  if (/^semana passada$/.test(t)) {
    const de = somarDias(segundaDestaSemana, -7);
    return { ok: true, periodo: intervalo(de, somarDias(de, 6), "a semana passada") };
  }

  // Fim de semana: o próximo sábado e o domingo seguinte (o atual, se hoje já é sábado ou domingo).
  if (/^(este |esse |proximo )?fim de semana$/.test(t)) {
    const dow = diaDaSemana(hoje);
    const sabado = dow === 0 ? somarDias(hoje, -1) : somarDias(hoje, (6 - dow + 7) % 7);
    return { ok: true, periodo: intervalo(sabado, somarDias(sabado, 1), "o fim de semana") };
  }

  // Mês relativo.
  if (/^(este|esse|neste|nesse)? ?mes( atual| corrente)?$/.test(t) && t.includes("mes")) {
    return { ok: true, periodo: periodoDoMes(anoAtual, mesAtual) };
  }
  if (/^(mes passado|mes anterior|ultimo mes)$/.test(t)) {
    const [a, mm] = mesAtual === 1 ? [anoAtual - 1, 12] : [anoAtual, mesAtual - 1];
    return { ok: true, periodo: periodoDoMes(a, mm) };
  }
  if (/^(proximo mes|mes que vem)$/.test(t)) {
    const [a, mm] = mesAtual === 12 ? [anoAtual + 1, 1] : [anoAtual, mesAtual + 1];
    return { ok: true, periodo: periodoDoMes(a, mm) };
  }

  // Ano relativo.
  if (/^(este|esse|neste|nesse)? ?ano( atual| corrente)?$/.test(t) && t.includes("ano")) return { ok: true, periodo: periodoDoAno(anoAtual) };
  if (/^ano passado$/.test(t)) return { ok: true, periodo: periodoDoAno(anoAtual - 1) };
  if (/^(proximo ano|ano que vem)$/.test(t)) return { ok: true, periodo: periodoDoAno(anoAtual + 1) };

  // Dia da semana: "sábado", "este sábado", "próximo sábado", "sábado que vem".
  m = t.match(/^(este |esse |proximo |proxima |nesta |neste )?(domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)( que vem)?$/);
  if (m) {
    const alvo = SEMANA_NORMALIZADA[m[2]];
    const dow = diaDaSemana(hoje);
    let delta = (alvo - dow + 7) % 7;
    // "Próximo sábado" num sábado é o da semana que vem; "este sábado" num sábado é hoje.
    const proximo = Boolean(m[1]?.startsWith("proxim") || m[3]);
    if (delta === 0 && proximo) delta = 7;
    return { ok: true, periodo: periodoDoDia(somarDias(hoje, delta)) };
  }

  // dd/mm[/aaaa] e dd-mm[-aaaa].
  m = t.match(/^(?:dia )?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) return diaComOuSemAno(Number(m[1]), Number(m[2]), m[3], hoje, expressao);

  // "14 de novembro", "dia 14 de novembro de 2026".
  m = t.match(/^(?:dia )?(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/);
  if (m) {
    const mes = indiceDoMes(m[2]);
    if (mes) return diaComOuSemAno(Number(m[1]), mes, m[3], hoje, expressao);
  }

  // "dia 14": o dia 14 do mês corrente.
  m = t.match(/^dia (\d{1,2})$/);
  if (m) {
    const dia = Number(m[1]);
    if (!diaValido(anoAtual, mesAtual, dia)) return { ok: false, erro: `Este mês não tem dia ${dia}.` };
    const data = `${anoAtual}-${doisDigitos(mesAtual)}-${doisDigitos(dia)}`;
    return {
      ok: true,
      periodo: periodoDoDia(data, data < hoje ? `Considerei o dia ${dia} deste mês, que já passou.` : undefined),
    };
  }

  // "novembro", "novembro de 2027", "nov 2027", "11/2026".
  m = t.match(/^(?:mes de )?([a-z]+)(?: de| do ano de)? ?(\d{4})?$/);
  if (m) {
    const mes = indiceDoMes(m[1]);
    if (mes) return mesComOuSemAno(mes, m[2], anoAtual, mesAtual);
  }
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { ok: true, periodo: periodoDoMes(Number(m[2]), Number(m[1])) };

  // "3 a 17 de outubro", "entre 03/10 e 17/10": intervalo escolhido a dedo.
  // Não é consultável nesta fase, e a mensagem diz isso em vez de sugerir
  // outro jeito de escrever o mesmo intervalo.
  if (/\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?(?: de [a-z]+)? (?:a|ate|e) (?:o |dia )?\d{1,2}\b/.test(t)) {
    return { ok: false, erro: `Intervalos de datas escolhidos ("${expressao}") ainda não podem ser consultados.` };
  }

  return { ok: false, erro: `Não entendi o período "${expressao}". Use, por exemplo, "novembro", "amanhã", "14/11" ou "mês passado".` };
}

function diaComOuSemAno(dia: number, mes: number, anoTexto: string | undefined, hoje: string, original: string): ResultadoDoPeriodo {
  const anoAtual = Number(hoje.slice(0, 4));
  const ano = anoTexto ? anoCompleto(anoTexto) : anoAtual;
  if (!diaValido(ano, mes, dia)) return { ok: false, erro: `Data inválida: ${original}.` };
  const data = `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  const observacao =
    !anoTexto && data < hoje
      ? `Considerei ${data.slice(8)}/${data.slice(5, 7)}/${ano} (ano corrente), que já passou. Se a pergunta era sobre ${ano + 1}, diga.`
      : undefined;
  return { ok: true, periodo: periodoDoDia(data, observacao) };
}

function mesComOuSemAno(mes: number, anoTexto: string | undefined, anoAtual: number, mesAtual: number): ResultadoDoPeriodo {
  if (anoTexto) return { ok: true, periodo: periodoDoMes(Number(anoTexto), mes) };
  const observacao =
    mes < mesAtual
      ? `Considerei ${NOMES_DOS_MESES[mes - 1]} de ${anoAtual} (ano corrente), que já passou. Se a pergunta era sobre ${NOMES_DOS_MESES[mes - 1]} de ${anoAtual + 1}, diga.`
      : undefined;
  return { ok: true, periodo: periodoDoMes(anoAtual, mes, observacao) };
}

/** Em que pé o período está em relação a hoje: decide se o número é realizado ou contratado. */
export function situacaoDoPeriodo(periodo: Pick<Periodo, "de" | "ate">, agora: Date = new Date()): "ENCERRADO" | "EM_ANDAMENTO" | "FUTURO" {
  const hoje = diaEmChapeco(agora);
  if (periodo.ate < hoje) return "ENCERRADO";
  if (periodo.de > hoje) return "FUTURO";
  return "EM_ANDAMENTO";
}

// ---------------------------------------------------------------- busca no texto

const PADROES_NO_TEXTO: RegExp[] = [
  /\b\d{4}-\d{2}(?:-\d{2})?\b/,
  /\b(?:dia )?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\b(?:dia )?\d{1,2} de (?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de \d{4})?\b/,
  /\bdepois de amanha\b/,
  /\b(?:hoje|amanha|ontem)\b/,
  /\b(?:proxima semana|semana que vem|semana passada|(?:esta|essa|nesta|nessa) semana)\b/,
  /\b(?:este |esse |proximo )?fim de semana\b/,
  /\b(?:mes passado|mes anterior|ultimo mes|proximo mes|mes que vem|(?:este|esse|neste|nesse) mes|mes atual)\b/,
  /\b(?:ano passado|proximo ano|ano que vem|(?:este|esse|neste|nesse) ano)\b/,
  /\b(?:(?:este|esse|proximo|proxima) )?(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)(?: que vem)?\b/,
  /\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?: de \d{4})?\b/,
  /\bdia \d{1,2}\b/,
  /\b(?:em|de) (\d{4})\b/,
];

/**
 * A primeira expressão de período que aparece num texto livre, ou nula.
 *
 * Usada pelo provedor simulado e pelos testes; com a IA de verdade, quem
 * extrai a expressão é o modelo, e o servidor só resolve.
 */
export function encontrarPeriodoNoTexto(texto: string): string | null {
  const t = normalizar(texto);
  for (const padrao of PADROES_NO_TEXTO) {
    const m = t.match(padrao);
    if (m) return m[1] && /^\d{4}$/.test(m[1]) ? m[1] : m[0];
  }
  return null;
}
