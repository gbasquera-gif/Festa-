/**
 * Contas a pagar e despesas recorrentes.
 *
 * Uma despesa recorrente é uma regra — "aluguel, todo dia 10" —, e cada mês
 * dela vira um `Gasto` comum, sem `pagoEm`. Não existe uma segunda tabela de
 * despesas com totais próprios: a obrigação prevista é um lançamento a pagar,
 * e só o pagamento registrado (o `pagoEm`) a leva para o caixa, a DRE e o
 * saldo. É a mesma regra que o financeiro já segue.
 *
 * Tudo aqui é função pura sobre dias "AAAA-MM-DD" e meses "AAAA-MM", em UTC,
 * para poder ser testado sem banco e sem relógio: fevereiro, dia 31 e
 * feriado são exatamente onde erro de data se esconde.
 */

import type { NaturezaDoGasto } from "./financeiro";

/* ------------------------------------------------------------------ *
 * Vocabulário
 * ------------------------------------------------------------------ */

/** De quantos em quantos meses a conta vence. Mensal é o caso comum. */
export const INTERVALOS_DA_RECORRENCIA = [1, 2, 3, 6, 12] as const;
export type IntervaloDaRecorrencia = (typeof INTERVALOS_DA_RECORRENCIA)[number];

export const INTERVALO_DA_RECORRENCIA_LABEL: Record<IntervaloDaRecorrencia, string> = {
  1: "Mensal",
  2: "Bimestral",
  3: "Trimestral",
  6: "Semestral",
  12: "Anual",
};

/**
 * Valor fixo é o mesmo todo mês (aluguel, assinatura). Variável é uma
 * estimativa (energia, internet com franquia): o valor real é informado ao
 * registrar o pagamento.
 */
export const TIPOS_DE_VALOR = ["FIXO", "VARIAVEL"] as const;
export type TipoDeValor = (typeof TIPOS_DE_VALOR)[number];

export const TIPO_DE_VALOR_LABEL: Record<TipoDeValor, string> = {
  FIXO: "Valor fixo",
  VARIAVEL: "Valor variável (estimado)",
};

/** O que fazer quando o dia escolhido não existe no mês (31 em abril, 30 em fevereiro). */
export const AJUSTES_DE_DIA_INEXISTENTE = ["ULTIMO_DIA_DO_MES", "PRIMEIRO_DIA_DO_MES_SEGUINTE"] as const;
export type AjusteDeDiaInexistente = (typeof AJUSTES_DE_DIA_INEXISTENTE)[number];

export const AJUSTE_DE_DIA_INEXISTENTE_LABEL: Record<AjusteDeDiaInexistente, string> = {
  ULTIMO_DIA_DO_MES: "Último dia do mês",
  PRIMEIRO_DIA_DO_MES_SEGUINTE: "Primeiro dia do mês seguinte",
};

/**
 * O que fazer quando o vencimento cai em sábado, domingo ou feriado
 * nacional.
 *
 * O padrão é manter: o sistema não presume regra de banco, de prefeitura ou
 * de contrato. Quem sabe que o boleto vira para o dia útil seguinte escolhe
 * isso na conta.
 */
export const AJUSTES_DE_DIA_NAO_UTIL = ["MANTER", "ANTECIPAR", "ADIAR"] as const;
export type AjusteDeDiaNaoUtil = (typeof AJUSTES_DE_DIA_NAO_UTIL)[number];

export const AJUSTE_DE_DIA_NAO_UTIL_LABEL: Record<AjusteDeDiaNaoUtil, string> = {
  MANTER: "Manter a data",
  ANTECIPAR: "Antecipar para o dia útil anterior",
  ADIAR: "Adiar para o próximo dia útil",
};

export const SITUACOES_DA_RECORRENCIA = ["ATIVA", "PAUSADA", "ENCERRADA"] as const;
export type SituacaoDaRecorrencia = (typeof SITUACOES_DA_RECORRENCIA)[number];

export const SITUACAO_DA_RECORRENCIA_LABEL: Record<SituacaoDaRecorrencia, string> = {
  ATIVA: "Ativa",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
};

/**
 * Os avisos possíveis, em dias até o vencimento: 7, 3 e 1 dia antes, no dia
 * e 1 dia depois. Cada um pode ser ligado ou desligado.
 */
export const MARCOS_DE_AVISO = [7, 3, 1, 0, -1] as const;
export type MarcoDeAviso = (typeof MARCOS_DE_AVISO)[number];

export const MARCO_DE_AVISO_LABEL: Record<MarcoDeAviso, string> = {
  7: "7 dias antes",
  3: "3 dias antes",
  1: "1 dia antes",
  0: "No dia do vencimento",
  [-1]: "1 dia depois (vencida)",
};

/**
 * Por quantos dias um aviso perdido ainda vale a pena ser dado.
 *
 * Se a tarefa diária falhar num dia, o aviso daquele dia sai no seguinte. Mas
 * um aviso de "vence em 7 dias" que só sai no quarto dia não ajuda — e, na
 * primeira execução em produção, contas vencidas há meses não podem disparar
 * uma enxurrada de "venceu ontem". Fora desta janela, o aviso é deixado de lado.
 */
export const JANELA_DE_RECUPERACAO_DO_AVISO = 2;

/** Hora padrão dos avisos, no horário de Brasília. */
export const HORA_PADRAO_DO_AVISO = 8;

/* ------------------------------------------------------------------ *
 * Calendário
 * ------------------------------------------------------------------ */

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MES = /^(\d{4})-(\d{2})$/;

function partesDoDia(dia: string): [number, number, number] {
  const m = DIA.exec(dia);
  if (!m) throw new RangeError(`Dia inválido: ${dia}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function partesDoMes(mes: string): [number, number] {
  const m = MES.exec(mes);
  if (!m) throw new RangeError(`Mês inválido: ${mes}`);
  return [Number(m[1]), Number(m[2])];
}

function paraDia(ano: number, mes: number, dia: number): string {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}

/** Quantos dias o mês tem. Fevereiro de ano bissexto tem 29. */
export function diasNoMes(mes: string): number {
  const [ano, numero] = partesDoMes(mes);
  return new Date(Date.UTC(ano, numero, 0)).getUTCDate();
}

/** O mês `n` meses depois (ou antes, com `n` negativo). */
export function somarMeses(mes: string, n: number): string {
  const [ano, numero] = partesDoMes(mes);
  const total = ano * 12 + (numero - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Quantos meses vão de `de` até `ate` (negativo se `ate` vem antes). */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = partesDoMes(de);
  const [a2, m2] = partesDoMes(ate);
  return (a2 - a1) * 12 + (m2 - m1);
}

/** O dia `n` dias depois (ou antes). */
export function deslocarDia(dia: string, n: number): string {
  const [a, m, d] = partesDoDia(dia);
  return paraDia(a, m, d + n);
}

/** Quantos dias vão de `de` até `ate`: 0 no mesmo dia, negativo se `ate` já passou. */
export function diasAte(de: string, ate: string): number {
  const [a1, m1, d1] = partesDoDia(de);
  const [a2, m2, d2] = partesDoDia(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/**
 * O domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário
 * gregoriano). Só serve para achar a Sexta-feira Santa.
 */
export function domingoDePascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraDia(ano, mes, dia);
}

/**
 * Feriados nacionais, definidos em lei federal.
 *
 * Só os nacionais, de propósito: feriado estadual, municipal e ponto
 * facultativo (Carnaval, Corpus Christi) variam por banco e por contrato, e
 * o sistema não presume. Consciência Negra é nacional desde 2024
 * (Lei 14.759/2023).
 */
export function feriadosNacionais(ano: number): string[] {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (ano >= 2024) fixos.push("11-20");
  const dias = fixos.map((md) => `${ano}-${md}`);
  dias.push(deslocarDia(domingoDePascoa(ano), -2)); // Sexta-feira Santa
  return dias.sort();
}

const cacheDeFeriados = new Map<number, Set<string>>();
function ehFeriadoNacional(dia: string): boolean {
  const ano = partesDoDia(dia)[0];
  let feriados = cacheDeFeriados.get(ano);
  if (!feriados) {
    feriados = new Set(feriadosNacionais(ano));
    cacheDeFeriados.set(ano, feriados);
  }
  return feriados.has(dia);
}

/** Dia útil: nem sábado, nem domingo, nem feriado nacional. */
export function ehDiaUtil(dia: string): boolean {
  const [a, m, d] = partesDoDia(dia);
  const semana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return semana !== 0 && semana !== 6 && !ehFeriadoNacional(dia);
}

/* ------------------------------------------------------------------ *
 * Vencimentos
 * ------------------------------------------------------------------ */

/** A parte da despesa recorrente que decide quando cada mês vence. */
export type RegraDeVencimento = {
  /** 1 a 31. Quando o mês não tem esse dia, vale `ajusteDiaInexistente`. */
  diaDoVencimento: number;
  intervaloMeses: number;
  /** A partir de quando a conta existe. */
  dataInicial: string;
  /** Até quando, inclusive. Nulo enquanto não tem fim. */
  dataFinal: string | null;
  ajusteDiaInexistente: AjusteDeDiaInexistente;
  ajusteDiaNaoUtil: AjusteDeDiaNaoUtil;
};

/**
 * O dia previsto de uma competência, antes de olhar fim de semana e feriado.
 *
 * Dia 31 em abril vira 30/04 ou 01/05; dia 29, 30 ou 31 em fevereiro vira o
 * 28 (ou 29, em ano bissexto) ou 1º de março. É este dia que decide se a
 * competência está dentro do período da conta.
 */
export function diaPrevisto(
  competencia: string,
  regra: Pick<RegraDeVencimento, "diaDoVencimento" | "ajusteDiaInexistente">,
): string {
  const [ano, mes] = partesDoMes(competencia);
  const ultimo = diasNoMes(competencia);
  if (regra.diaDoVencimento <= ultimo) return paraDia(ano, mes, regra.diaDoVencimento);
  return regra.ajusteDiaInexistente === "ULTIMO_DIA_DO_MES"
    ? paraDia(ano, mes, ultimo)
    : paraDia(ano, mes + 1, 1);
}

/** O vencimento de fato: o dia previsto, levado ao dia útil quando a conta pede. */
export function vencimentoDaCompetencia(
  competencia: string,
  regra: Pick<RegraDeVencimento, "diaDoVencimento" | "ajusteDiaInexistente" | "ajusteDiaNaoUtil">,
): string {
  let dia = diaPrevisto(competencia, regra);
  if (regra.ajusteDiaNaoUtil === "MANTER") return dia;
  const passo = regra.ajusteDiaNaoUtil === "ANTECIPAR" ? -1 : 1;
  // Nenhuma sequência de dias não úteis no Brasil passa de 4 dias; 10 é folga.
  for (let i = 0; i < 10 && !ehDiaUtil(dia); i++) dia = deslocarDia(dia, passo);
  return dia;
}

/** Uma competência da conta e o dia em que ela vence. */
export type Ocorrencia = { competencia: string; vencimento: string };

/**
 * As competências da conta entre dois meses, inclusive.
 *
 * A contagem parte do mês da data inicial e anda de `intervaloMeses` em
 * `intervaloMeses`. Uma competência vale quando o dia previsto fica entre a
 * data inicial e a data final — por isso uma conta que começa em 20/11 com
 * vencimento no dia 10 tem o primeiro vencimento em dezembro.
 */
export function ocorrenciasEntre(regra: RegraDeVencimento, de: string, ate: string): Ocorrencia[] {
  const inicio = regra.dataInicial.slice(0, 7);
  const resultado: Ocorrencia[] = [];
  // Primeira competência da cadência que não vem antes de `de`.
  const salto = Math.max(0, Math.ceil(mesesEntre(inicio, de) / regra.intervaloMeses));
  for (let k = salto; ; k++) {
    const competencia = somarMeses(inicio, k * regra.intervaloMeses);
    if (mesesEntre(competencia, ate) < 0) break;
    const previsto = diaPrevisto(competencia, regra);
    if (previsto < regra.dataInicial) continue;
    if (regra.dataFinal !== null && previsto > regra.dataFinal) break;
    resultado.push({ competencia, vencimento: vencimentoDaCompetencia(competencia, regra) });
  }
  return resultado;
}

/**
 * Os próximos `n` vencimentos a partir de um dia — a prévia que a tela
 * mostra enquanto a conta é cadastrada.
 */
export function proximosVencimentos(regra: RegraDeVencimento, aPartirDe: string, n: number): Ocorrencia[] {
  const resultado: Ocorrencia[] = [];
  let de = aPartirDe.slice(0, 7);
  // Anda em blocos para não depender de quantos meses a cadência pula.
  for (let tentativas = 0; resultado.length < n && tentativas < 20; tentativas++) {
    const ate = somarMeses(de, regra.intervaloMeses * n);
    for (const o of ocorrenciasEntre(regra, de, ate)) {
      if (o.vencimento >= aPartirDe && resultado.length < n) resultado.push(o);
    }
    de = somarMeses(ate, 1);
    if (regra.dataFinal !== null && de > regra.dataFinal.slice(0, 7)) break;
  }
  return resultado;
}

/**
 * Quantos meses para trás a geração automática ainda olha. Só cobre a
 * tarefa diária ter ficado parada: o que venceu depois do cadastro e não foi
 * gerado porque nada rodou.
 */
const MESES_DE_RECUPERACAO_DA_GERACAO = 2;

/**
 * O que a geração automática cria hoje: até o mês seguinte.
 *
 * Nunca o que venceu antes de `geracaoDesde` — o dia em que a conta foi
 * cadastrada ou retomada. Mês antigo só nasce por ação explícita
 * (`ocorrenciasRetroativas`), porque é quase sempre conta que já foi paga e
 * lançada à mão, e gerá-la sozinha criaria uma dívida que não existe.
 */
export function ocorrenciasAutomaticas(
  regra: RegraDeVencimento,
  geracaoDesde: string,
  hoje: string,
): Ocorrencia[] {
  const mes = hoje.slice(0, 7);
  const recuperacao = somarMeses(mes, -MESES_DE_RECUPERACAO_DA_GERACAO);
  const de = geracaoDesde.slice(0, 7) > recuperacao ? geracaoDesde.slice(0, 7) : recuperacao;
  return ocorrenciasEntre(regra, de, somarMeses(mes, 1)).filter((o) => o.vencimento >= geracaoDesde);
}

/** Até quantos meses para trás a tela oferece gerar. */
export const LIMITE_DE_MESES_RETROATIVOS = 24;

/**
 * As competências que a geração automática deixou de fora por serem
 * anteriores ao cadastro: a tela as oferece, e só cria as que forem
 * marcadas.
 */
export function ocorrenciasRetroativas(
  regra: RegraDeVencimento,
  geracaoDesde: string,
  hoje: string,
): Ocorrencia[] {
  const mes = hoje.slice(0, 7);
  const de = somarMeses(mes, -LIMITE_DE_MESES_RETROATIVOS);
  return ocorrenciasEntre(regra, de, somarMeses(mes, 1)).filter((o) => o.vencimento < geracaoDesde);
}

/* ------------------------------------------------------------------ *
 * Situação de uma conta
 * ------------------------------------------------------------------ */

export const SITUACOES_DA_CONTA = [
  "VENCIDA",
  "VENCE_HOJE",
  "PROXIMA",
  "A_VENCER",
  "SEM_VENCIMENTO",
  "PAGA",
] as const;
export type SituacaoDaConta = (typeof SITUACOES_DA_CONTA)[number];

export const SITUACAO_DA_CONTA_LABEL: Record<SituacaoDaConta, string> = {
  VENCIDA: "Vencidas",
  VENCE_HOJE: "Vencem hoje",
  PROXIMA: "Próximos 7 dias",
  A_VENCER: "A vencer",
  SEM_VENCIMENTO: "Sem vencimento",
  PAGA: "Pagas",
};

/** "Próxima do vencimento" é até 7 dias. */
export const DIAS_DE_PROXIMIDADE = 7;

/** Em que pé está uma conta hoje. Só `pagoEm` diz se foi paga. */
export function situacaoDaConta(conta: { pagoEm: string | null; venceEm: string | null }, hoje: string): SituacaoDaConta {
  if (conta.pagoEm !== null) return "PAGA";
  if (conta.venceEm === null) return "SEM_VENCIMENTO";
  const dias = diasAte(hoje, conta.venceEm);
  if (dias < 0) return "VENCIDA";
  if (dias === 0) return "VENCE_HOJE";
  if (dias <= DIAS_DE_PROXIMIDADE) return "PROXIMA";
  return "A_VENCER";
}

/** O prazo em palavras: "vence em 3 dias", "vence hoje", "venceu há 2 dias". */
export function textoDoPrazo(dias: number): string {
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === 1) return "vence amanhã";
  if (dias === 0) return "vence hoje";
  if (dias === -1) return "venceu ontem";
  return `venceu há ${-dias} dias`;
}

/* ------------------------------------------------------------------ *
 * Avisos
 * ------------------------------------------------------------------ */

/**
 * Qual aviso uma conta em aberto pede hoje, se algum.
 *
 * O aviso é o marco ligado mais recente cujo dia já chegou — se a tarefa
 * ficou parada e hoje faltam 2 dias, sai o de "3 dias antes", uma vez só, e
 * não também o de 7. Marco cujo dia passou há mais que a janela de
 * recuperação é deixado de lado (ver `JANELA_DE_RECUPERACAO_DO_AVISO`).
 *
 * Quem impede o mesmo aviso de sair duas vezes é o banco (uma chave por
 * conta, vencimento e marco); esta função só diz qual é o de hoje.
 */
export function marcoDoDia(
  vencimento: string,
  hoje: string,
  marcosLigados: readonly number[],
  janela = JANELA_DE_RECUPERACAO_DO_AVISO,
): number | null {
  const faltam = diasAte(hoje, vencimento);
  const alcancados = marcosLigados.filter((m) => m >= faltam);
  if (alcancados.length === 0) return null;
  const marco = Math.min(...alcancados);
  const atraso = marco - faltam; // dias desde o dia do marco
  return atraso <= janela ? marco : null;
}

/* ------------------------------------------------------------------ *
 * Conferência de duplicidade
 * ------------------------------------------------------------------ */

/** A conta que a recorrência criaria. */
export type ContaPrevista = {
  descricao: string;
  natureza: NaturezaDoGasto;
  fornecedor: string | null;
  valor: number;
  tipoDeValor: TipoDeValor;
  vencimento: string;
};

/** Um lançamento que já existe e pode ser a mesma conta, lançada à mão. */
export type LancamentoExistente = {
  id: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  fornecedor: string | null;
  valor: number;
  /** Dia do vencimento, se tiver. */
  venceEm: string | null;
  /** Dia do pagamento, se tiver. */
  pagoEm: string | null;
  /** Já pertence a uma recorrência: não é candidato. */
  recorrenciaId: string | null;
};

/** Distância máxima, em dias, entre o lançamento e o vencimento previsto. */
export const DIAS_DE_TOLERANCIA_NA_CONFERENCIA = 12;

/** Minúsculas, sem acento nem pontuação, espaços simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function palavras(texto: string): Set<string> {
  return new Set(
    normalizarTexto(texto)
      .split(" ")
      .filter((p) => p.length >= 3),
  );
}

/** Quanto duas descrições se parecem, de 0 a 1 (palavras em comum sobre o total). */
export function semelhancaDeDescricao(a: string, b: string): number {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na))) return 1;
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / (pa.size + pb.size - comuns);
}

function valorCompativel(prevista: ContaPrevista, valor: number): boolean {
  if (prevista.tipoDeValor === "FIXO") {
    return Math.abs(valor - prevista.valor) <= Math.max(1, prevista.valor * 0.05);
  }
  // Variável: só descarta o que está fora de qualquer proporção.
  return valor >= prevista.valor / 3 && valor <= prevista.valor * 3;
}

/**
 * Os lançamentos manuais que podem ser esta mesma conta.
 *
 * Mesma natureza; data (vencimento, ou pagamento quando não há vencimento)
 * a até 12 dias do vencimento previsto; mesmo fornecedor ou descrição
 * parecida; e valor compatível. Achar candidato não decide nada: a geração
 * para e a tela pergunta se é a mesma conta (vincular) ou outra (gerar).
 */
export function candidatosDeDuplicidade(
  prevista: ContaPrevista,
  lancamentos: readonly LancamentoExistente[],
): LancamentoExistente[] {
  const fornecedor = prevista.fornecedor ? normalizarTexto(prevista.fornecedor) : "";
  return lancamentos
    .filter((l) => {
      if (l.recorrenciaId !== null || l.natureza !== prevista.natureza) return false;
      const data = l.venceEm ?? l.pagoEm;
      if (data === null || Math.abs(diasAte(prevista.vencimento, data)) > DIAS_DE_TOLERANCIA_NA_CONFERENCIA) {
        return false;
      }
      const mesmoFornecedor = fornecedor !== "" && l.fornecedor !== null && normalizarTexto(l.fornecedor) === fornecedor;
      const descricaoParecida = semelhancaDeDescricao(prevista.descricao, l.descricao) >= 0.5;
      return (mesmoFornecedor || descricaoParecida) && valorCompativel(prevista, l.valor);
    })
    .sort(
      (a, b) =>
        Math.abs(diasAte(prevista.vencimento, a.venceEm ?? a.pagoEm!)) -
        Math.abs(diasAte(prevista.vencimento, b.venceEm ?? b.pagoEm!)),
    );
}

/* ------------------------------------------------------------------ *
 * Edição da recorrência
 * ------------------------------------------------------------------ */

/** O que a recorrência copia para cada conta que gera. */
export type ModeloDaConta = {
  descricao: string;
  natureza: NaturezaDoGasto;
  categoria: string | null;
  fornecedor: string | null;
  valor: number;
};

/** Uma conta gerada, como está agora. */
export type ContaGerada = ModeloDaConta & { venceEm: string };

/**
 * O que muda numa conta em aberto quando a recorrência é editada.
 *
 * Campo a campo: só o que ainda está como a recorrência gerou acompanha a
 * edição. Se a conta de dezembro teve o valor ajustado à mão (a fatura de
 * energia chegou), mudar a estimativa da recorrência não desfaz o ajuste.
 * Contas pagas nem chegam aqui — quem chama só passa as em aberto a partir
 * de hoje.
 */
export function atualizacaoDaConta(
  conta: ContaGerada,
  antes: ModeloDaConta & { vencimento: string },
  depois: ModeloDaConta & { vencimento: string },
): Partial<ContaGerada> {
  const mudancas: Partial<ContaGerada> = {};
  const campos = ["descricao", "natureza", "categoria", "fornecedor"] as const;
  for (const campo of campos) {
    if (conta[campo] === antes[campo] && antes[campo] !== depois[campo]) {
      (mudancas as Record<string, unknown>)[campo] = depois[campo];
    }
  }
  if (Math.abs(conta.valor - antes.valor) < 0.005 && Math.abs(antes.valor - depois.valor) >= 0.005) {
    mudancas.valor = depois.valor;
  }
  if (conta.venceEm === antes.vencimento && antes.vencimento !== depois.vencimento) {
    mudancas.venceEm = depois.vencimento;
  }
  return mudancas;
}
