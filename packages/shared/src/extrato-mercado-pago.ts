/**
 * Leitura dos extratos do Mercado Pago (Entrega H1): só prévia.
 *
 * Recebe os arquivos que o ADMIN baixou do Mercado Pago, confere o formato e
 * as somas do próprio arquivo, classifica cada movimentação de forma
 * preliminar e aponta repetições. Não grava nada e não conhece os lançamentos
 * do ERP: a conciliação com eles é a H2.
 *
 * Princípios:
 * - Coluna só é usada se o cabeçalho tiver exatamente aquele nome. Arquivo de
 *   formato desconhecido é recusado, com os nomes das colunas encontradas.
 * - Um arquivo só é aceito se as contas dele fecharem: saldo parcial linha a
 *   linha e, quando houver, saldo inicial + créditos + débitos = saldo final.
 *   É o que protege contra ler uma coluna com o sentido trocado.
 * - Dinheiro em centavos inteiros, lido do texto (nunca por ponto flutuante).
 *   O valor que conta é o líquido que entrou ou saiu da conta; o bruto e a
 *   tarifa, quando o arquivo tem, aparecem à parte e nunca o substituem.
 * - Data como está no arquivo. Com fuso informado, o dia vale no horário de
 *   Brasília (é o que decide o mês). Sem fuso, o dia é o escrito, com aviso.
 * - Classificação é só informativa. Sem regra que a explique, a movimentação
 *   fica pendente: entrada não é presumida faturamento, nem saída despesa.
 */

export type FormatoDoExtrato = "LIBERACOES" | "EXTRATO_DA_CONTA";

export type CategoriaDoExtrato =
  | "RECEBIMENTO"
  | "SAIDA"
  | "TRANSFERENCIA_PARA_COFRINHO"
  | "RETIRADA_DO_COFRINHO"
  | "RESERVA_AUTOMATICA_POR_VENDAS"
  | "RENDIMENTO_DO_COFRINHO"
  | "TARIFA_MERCADO_PAGO"
  | "ESTORNO_OU_DEVOLUCAO"
  | "DESCONHECIDA";

/** INTERNA: dinheiro trocando de lugar dentro da própria conta. */
export type GrupoDaCategoria = "EXTERNA" | "INTERNA" | "PENDENTE";

export const CATEGORIAS_DO_EXTRATO: Record<
  CategoriaDoExtrato,
  { rotulo: string; grupo: GrupoDaCategoria; nota: string }
> = {
  RECEBIMENTO: {
    rotulo: "Pix e outros recebimentos",
    grupo: "EXTERNA",
    nota: "Dinheiro que entrou. Ainda não é faturamento: a ligação com a reserva é a próxima etapa.",
  },
  SAIDA: {
    rotulo: "Pagamentos e saídas",
    grupo: "EXTERNA",
    nota: "Dinheiro que saiu. Ainda não é despesa: pode ser fornecedor, retirada de sócio ou outra coisa.",
  },
  TRANSFERENCIA_PARA_COFRINHO: {
    rotulo: "Transferência para o cofrinho",
    grupo: "INTERNA",
    nota: "Sai da conta disponível e vai para a Reserva Festaê. Não é despesa.",
  },
  RETIRADA_DO_COFRINHO: {
    rotulo: "Retirada do cofrinho",
    grupo: "INTERNA",
    nota: "Volta da Reserva Festaê para a conta disponível. Não é faturamento.",
  },
  RESERVA_AUTOMATICA_POR_VENDAS: {
    rotulo: "Reserva automática por vendas",
    grupo: "INTERNA",
    nota: "Parte das vendas guardada automaticamente no cofrinho. Não é despesa.",
  },
  RENDIMENTO_DO_COFRINHO: {
    rotulo: "Rendimento do cofrinho",
    grupo: "EXTERNA",
    nota: "Rendimento financeiro. Não é faturamento de festa.",
  },
  TARIFA_MERCADO_PAGO: {
    rotulo: "Tarifa do Mercado Pago",
    grupo: "EXTERNA",
    nota: "Cobrança do Mercado Pago lançada em linha própria.",
  },
  ESTORNO_OU_DEVOLUCAO: {
    rotulo: "Estorno ou devolução",
    grupo: "EXTERNA",
    nota: "Dinheiro devolvido ou contestado.",
  },
  DESCONHECIDA: {
    rotulo: "Pendente de classificação",
    grupo: "PENDENTE",
    nota: "Nenhuma regra explica esta linha. Fica pendente até alguém classificar.",
  },
};

export const FORMATOS_DO_EXTRATO: Record<FormatoDoExtrato, { rotulo: string; evidencia: string }> = {
  LIBERACOES: {
    rotulo: "Relatório de Liberações (dinheiro liberado)",
    evidencia: "Colunas da documentação oficial do Mercado Pago para o relatório de liberações.",
  },
  EXTRATO_DA_CONTA: {
    rotulo: "Extrato da conta (CSV)",
    evidencia:
      "Sem documentação oficial encontrada: o arquivo só é aceito se o saldo parcial de cada linha e o resumo do próprio arquivo fecharem.",
  },
};

/** Limites da análise (a rota aplica os mesmos). */
export const LIMITES_DO_EXTRATO = { arquivos: 5, bytesPorArquivo: 2 * 1024 * 1024, linhasPorArquivo: 20_000 };

export interface ArquivoDoExtrato {
  nome: string;
  /** SHA-256 do conteúdo, em hexadecimal (calculado por quem recebe o arquivo). */
  hash: string;
  bytes: Uint8Array;
}

export interface RepeticaoDaMovimentacao {
  /** MESMA_OPERACAO: identificador confiável igual — fica fora dos totais. POSSIVEL: só parecida — conta, com alerta. */
  tipo: "MESMA_OPERACAO" | "POSSIVEL";
  arquivo: number;
  linha: number;
}

export interface MovimentacaoDoExtrato {
  arquivo: number;
  linha: number;
  dataOriginal: string;
  /** "AAAA-MM-DD HH:MM" no horário de Brasília; null quando o arquivo não informa o fuso. */
  dataBrasilia: string | null;
  /** Dia que vale para período e mês. */
  dia: string;
  fusoInformado: boolean;
  descricao: string;
  tipoNoArquivo: string | null;
  idDaOperacao: string | null;
  referenciaExterna: string | null;
  /** Centavos. Positivo entra na conta disponível; negativo sai. */
  valor: number;
  valorBruto: number | null;
  tarifa: number | null;
  saldoApos: number | null;
  categoria: CategoriaDoExtrato;
  regra: string;
  chave: string;
  chaveConfiavel: boolean;
  repeticao: RepeticaoDaMovimentacao | null;
}

export interface ArquivoAnalisado {
  nome: string;
  hash: string;
  bytes: number;
  situacao: "ACEITO" | "RECUSADO" | "REPETIDO";
  formato: FormatoDoExtrato | null;
  erros: string[];
  avisos: string[];
  periodo: { de: string; ate: string } | null;
  linhas: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  saldoConferido: boolean;
}

export interface TotalDaCategoria {
  categoria: CategoriaDoExtrato;
  quantidade: number;
  entradas: number;
  saidas: number;
}

export interface ResumoDoExtratoMercadoPago {
  formato: FormatoDoExtrato | null;
  periodo: { de: string; ate: string } | null;
  quantidade: number;
  entradas: number;
  saidas: number;
  liquido: number;
  porCategoria: TotalDaCategoria[];
  porMes: Array<{ mes: string; entradas: number; saidas: number; liquido: number }>;
  cofrinho: { enviado: number; retirado: number; liquido: number; rendimentos: number };
  /** Soma da coluna de tarifa (embutida nas liberações); null se o arquivo não a tem. */
  tarifasEmbutidas: number | null;
  /** Bruto − líquido das linhas que trazem os dois; null se o arquivo não tem bruto. */
  diferencaBrutoLiquido: number | null;
  pendentes: number;
  repeticoesIgnoradas: number;
  possiveisRepeticoes: number;
}

export interface AnaliseDeExtratos {
  arquivos: ArquivoAnalisado[];
  movimentacoes: MovimentacaoDoExtrato[];
  resumo: ResumoDoExtratoMercadoPago;
}

// ---------------------------------------------------------------- texto

/** Minúsculas, sem acento, "_" vira espaço. Para comparar descrições. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodificar(bytes: Uint8Array): { texto: string; aviso: string | null } {
  try {
    return { texto: new TextDecoder("utf-8", { fatal: true }).decode(bytes), aviso: null };
  } catch {
    return {
      texto: new TextDecoder("windows-1252").decode(bytes),
      aviso: "O arquivo não está em UTF-8; foi lido como Windows-1252. Confira os acentos.",
    };
  }
}

interface Registro {
  linha: number;
  campos: string[];
}

/** CSV com aspas (RFC 4180), guardando a linha onde cada registro começa. */
export function lerCsv(texto: string, separador: string): Registro[] {
  const registros: Registro[] = [];
  let campos: string[] = [];
  let campo = "";
  let aspas = false;
  let linha = 1;
  let inicio = 1;
  let i = 0;
  const fechar = () => {
    campos.push(campo);
    if (campos.length > 1 || campos[0].trim() !== "") registros.push({ linha: inicio, campos });
    campos = [];
    campo = "";
  };
  while (i < texto.length) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i += 2;
        continue;
      }
      if (c === '"') aspas = false;
      else {
        if (c === "\n") linha += 1;
        campo += c;
      }
      i += 1;
      continue;
    }
    if (c === '"' && campo === "") aspas = true;
    else if (c === separador) {
      campos.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      fechar();
      linha += 1;
      inicio = linha;
    } else campo += c;
    i += 1;
  }
  if (campo !== "" || campos.length > 0) fechar();
  return registros;
}

function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const contagem = [";", ",", "\t"].map((s) => ({ s, n: primeira.split(s).length - 1 }));
  contagem.sort((a, b) => b.n - a.n);
  return contagem[0].n > 0 ? contagem[0].s : ";";
}

// ---------------------------------------------------------------- dinheiro

type EstiloNumerico = "VIRGULA" | "PONTO";

/** Centavos a partir do texto. `null` para vazio; `undefined` para inválido. */
export function lerCentavos(texto: string, estilo: EstiloNumerico): number | null | undefined {
  const limpo = texto.replace(/R\$/g, "").replace(/[\s ]/g, "");
  if (limpo === "") return null;
  const m =
    estilo === "VIRGULA"
      ? /^([+-]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo)
      : /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(limpo);
  if (!m) return undefined;
  const inteiro = Number(m[2].replace(/\./g, ""));
  const fracao = Number((m[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(inteiro * 100)) return undefined;
  const valor = inteiro * 100 + fracao;
  return m[1] === "-" ? -valor : valor;
}

// ---------------------------------------------------------------- datas

const FORMATO_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function diaValido(a: number, m: number, d: number): boolean {
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

const dois = (n: number) => String(n).padStart(2, "0");

export interface DataLida {
  dia: string;
  dataBrasilia: string | null;
  fusoInformado: boolean;
}

/** Datas ISO (com ou sem fuso) e DD-MM-AAAA / DD/MM/AAAA, com hora opcional. */
export function lerData(texto: string): DataLida | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(t);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!diaValido(a, mes, d)) return null;
    if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59)) return null;
    if (m[7]) {
      const fuso = m[7] === "Z" ? "Z" : m[7].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
      const instante = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${fuso}`);
      if (Number.isNaN(instante.getTime())) return null;
      const p = Object.fromEntries(FORMATO_BRASILIA.formatToParts(instante).map((x) => [x.type, x.value]));
      const dia = `${p.year}-${p.month}-${p.day}`;
      return { dia, dataBrasilia: `${dia} ${p.hour}:${p.minute}`, fusoInformado: true };
    }
    return { dia: `${m[1]}-${m[2]}-${m[3]}`, dataBrasilia: null, fusoInformado: false };
  }
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (m) {
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!diaValido(a, mes, d)) return null;
    if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59)) return null;
    return { dia: `${a}-${dois(mes)}-${dois(d)}`, dataBrasilia: null, fusoInformado: false };
  }
  return null;
}

// ---------------------------------------------------------------- classificação

interface Regra {
  categoria: CategoriaDoExtrato;
  nome: string;
  padrao: RegExp;
  sinal?: "+" | "-";
  /** Regra genérica: não vale se uma regra específica já viu o sentido trocado. */
  generica?: boolean;
  /** Descrição com um sentido só: com o sentido trocado, fica pendente. */
  exclusiva?: boolean;
}

/**
 * Regras preliminares, em ordem. Os textos do aplicativo ainda precisam ser
 * conferidos num arquivo real; o que nenhuma regra explica fica pendente.
 * "Reserva" sozinha não basta (é também a reserva da festa): o cofrinho só
 * é reconhecido por "cofrinho", "Reserva Festaê" ou frases do próprio
 * Mercado Pago sobre dinheiro reservado/retirado.
 */
const REGRAS: Regra[] = [
  // Rendimento é crédito no cofrinho; negativo não é rendimento.
  { categoria: "RENDIMENTO_DO_COFRINHO", nome: "rendimento", padrao: /\brendiment/, sinal: "+", exclusiva: true },
  {
    categoria: "RESERVA_AUTOMATICA_POR_VENDAS",
    nome: "reserva automática de vendas",
    padrao: /reserva automatica|reservad[oa] automaticamente|reserva (de|das|por) vendas?/,
    sinal: "-",
    // Só existe indo para o cofrinho; como entrada na conta, fica pendente.
    exclusiva: true,
  },
  {
    categoria: "TRANSFERENCIA_PARA_COFRINHO",
    nome: "dinheiro reservado no cofrinho",
    padrao: /dinheiro (reservado|guardado)|para (o )?cofrinho|para (a )?reserva festae/,
    sinal: "-",
  },
  {
    categoria: "RETIRADA_DO_COFRINHO",
    nome: "dinheiro retirado do cofrinho",
    padrao: /dinheiro (retirado|resgatado)|\bd[oa] (cofrinho|reserva festae)/,
    sinal: "+",
  },
  { categoria: "TRANSFERENCIA_PARA_COFRINHO", nome: "cofrinho (saída)", padrao: /cofrinho|reserva festae/, sinal: "-", generica: true },
  { categoria: "RETIRADA_DO_COFRINHO", nome: "cofrinho (entrada)", padrao: /cofrinho|reserva festae/, sinal: "+", generica: true },
  {
    categoria: "ESTORNO_OU_DEVOLUCAO",
    nome: "estorno ou devolução",
    padrao: /estorno|devoluc|devolvid|reembols|\brefund|chargeback|contestac/,
  },
  { categoria: "TARIFA_MERCADO_PAGO", nome: "tarifa", padrao: /tarifa|\btaxa\b|\bfee\b|comissao/, sinal: "-" },
  {
    categoria: "RECEBIMENTO",
    nome: "recebimento",
    padrao: /pix recebid|transferencia recebida|pagamento recebido|dinheiro recebido|recebimento|\bvenda|\bpayment\b/,
    sinal: "+",
  },
  {
    categoria: "SAIDA",
    nome: "pagamento ou transferência enviada",
    padrao:
      /pix enviad|transferencia enviada|transferencia para|pagamento (de|com|a|efetuad)|boleto|saque|\bwithdrawal\b|\bpayout\b|compra/,
    sinal: "-",
  },
];

export function classificarMovimentacao(texto: string, valor: number): { categoria: CategoriaDoExtrato; regra: string } {
  const t = normalizarTexto(texto);
  if (/\b(block|unblock|bloqueio|desbloqueio)\b/.test(t)) {
    return { categoria: "DESCONHECIDA", regra: "bloqueio ou desbloqueio de dinheiro: conferir" };
  }
  let sinalDivergente = false;
  for (const r of REGRAS) {
    if (!r.padrao.test(t) || (r.generica && sinalDivergente)) continue;
    if (r.sinal && (r.sinal === "+" ? valor <= 0 : valor >= 0)) {
      if (r.exclusiva) return { categoria: "DESCONHECIDA", regra: "a descrição não combina com o sentido do valor" };
      if (!r.generica) sinalDivergente = true;
      continue;
    }
    return { categoria: r.categoria, regra: r.nome };
  }
  return {
    categoria: "DESCONHECIDA",
    regra: sinalDivergente ? "a descrição não combina com o sentido do valor" : "nenhuma regra reconhece a descrição",
  };
}

// ---------------------------------------------------------------- formatos

const COLUNAS_DO_EXTRATO = ["RELEASE_DATE", "TRANSACTION_TYPE", "REFERENCE_ID", "TRANSACTION_NET_AMOUNT", "PARTIAL_BALANCE"];
const RESUMO_DO_EXTRATO = ["INITIAL_BALANCE", "CREDITS", "DEBITS", "FINAL_BALANCE"];
const COLUNAS_DE_LIBERACOES = ["DATE", "SOURCE_ID", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT"];
const COLUNAS_DE_VENDAS = ["SETTLEMENT_NET_AMOUNT"];

const nomeDaColuna = (c: string) => c.trim().toUpperCase();
const contem = (cabecalho: string[], exigidas: string[]) => exigidas.every((c) => cabecalho.includes(c));

interface LinhaBruta {
  linha: number;
  data: string;
  descricao: string;
  tipoNoArquivo: string | null;
  idDaOperacao: string | null;
  referenciaExterna: string | null;
  valor: number;
  valorBruto: number | null;
  tarifa: number | null;
  saldoApos: number | null;
}

interface LeituraDoFormato {
  linhas: LinhaBruta[];
  saldoInicial: number | null;
  saldoFinal: number | null;
  saldoConferido: boolean;
  erros: string[];
  avisos: string[];
}

const MAX_ERROS = 15;

function estiloDe(valores: string[]): EstiloNumerico {
  return valores.some((v) => v.includes(",")) ? "VIRGULA" : "PONTO";
}

const reais = (centavos: number) => {
  const s = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.floor(s / 100)},${dois(s % 100)}`;
};

/** Saldo parcial linha a linha, na ordem do arquivo ou na inversa. */
function conferirSaldoParcial(linhas: LinhaBruta[], saldoInicial: number | null): string | null {
  const comSaldo = linhas.filter((l) => l.saldoApos !== null);
  if (comSaldo.length !== linhas.length) return "Há linhas sem saldo parcial.";
  const crescente = (ls: LinhaBruta[], inicial: number | null) => {
    let anterior = inicial ?? ls[0].saldoApos! - ls[0].valor;
    for (const l of ls) {
      if (anterior + l.valor !== l.saldoApos) return l.linha;
      anterior = l.saldoApos!;
    }
    return null;
  };
  const falha = crescente(linhas, saldoInicial);
  if (falha === null) return null;
  if (crescente([...linhas].reverse(), saldoInicial) === null) return null;
  return `O saldo parcial não fecha com os valores a partir da linha ${falha}. O arquivo pode estar incompleto ou com colunas trocadas.`;
}

function lerExtratoDaConta(registros: Registro[], iCabecalho: number): LeituraDoFormato {
  const erros: string[] = [];
  const avisos: string[] = [];
  const cab = registros[iCabecalho].campos.map(nomeDaColuna);
  const col = Object.fromEntries(COLUNAS_DO_EXTRATO.map((c) => [c, cab.indexOf(c)]));
  const dados = registros.slice(iCabecalho + 1).filter((r) => r.campos.some((c) => c.trim() !== ""));

  // Resumo (saldo inicial, créditos, débitos, saldo final) antes da tabela.
  let resumo: { inicial: number; creditos: number; debitos: number; final: number } | null = null;
  const iResumo = registros.slice(0, iCabecalho).findIndex((r) => contem(r.campos.map(nomeDaColuna), RESUMO_DO_EXTRATO));
  const valoresDoResumo: string[] = [];
  let cabResumo: string[] = [];
  if (iResumo >= 0 && registros[iResumo + 1] && iResumo + 1 < iCabecalho) {
    cabResumo = registros[iResumo].campos.map(nomeDaColuna);
    valoresDoResumo.push(...RESUMO_DO_EXTRATO.map((c) => registros[iResumo + 1].campos[cabResumo.indexOf(c)] ?? ""));
  }
  const estilo = estiloDe([
    ...valoresDoResumo,
    ...dados.flatMap((r) => [r.campos[col.TRANSACTION_NET_AMOUNT] ?? "", r.campos[col.PARTIAL_BALANCE] ?? ""]),
  ]);
  if (valoresDoResumo.length) {
    const [inicial, creditos, debitos, final] = valoresDoResumo.map((v) => lerCentavos(v, estilo));
    if ([inicial, creditos, debitos, final].some((v) => v === undefined || v === null)) {
      erros.push(`Resumo do extrato (linha ${registros[iResumo + 1].linha}) com valor inválido.`);
    } else {
      resumo = { inicial: inicial!, creditos: creditos!, debitos: debitos!, final: final! };
    }
  } else {
    avisos.push("O arquivo não traz o resumo de saldo inicial e final; só o saldo parcial foi conferido.");
  }

  const linhas: LinhaBruta[] = [];
  for (const r of dados) {
    if (erros.length >= MAX_ERROS) break;
    const valor = lerCentavos(r.campos[col.TRANSACTION_NET_AMOUNT] ?? "", estilo);
    const saldo = lerCentavos(r.campos[col.PARTIAL_BALANCE] ?? "", estilo);
    const data = (r.campos[col.RELEASE_DATE] ?? "").trim();
    if (valor === undefined || valor === null) erros.push(`Linha ${r.linha}: valor inválido ou vazio.`);
    else if (saldo === undefined) erros.push(`Linha ${r.linha}: saldo parcial inválido.`);
    else if (!lerData(data)) erros.push(`Linha ${r.linha}: data inválida.`);
    else {
      const id = (r.campos[col.REFERENCE_ID] ?? "").trim();
      linhas.push({
        linha: r.linha,
        data,
        descricao: (r.campos[col.TRANSACTION_TYPE] ?? "").trim(),
        tipoNoArquivo: null,
        idDaOperacao: id || null,
        referenciaExterna: null,
        valor,
        valorBruto: null,
        tarifa: null,
        saldoApos: saldo,
      });
    }
  }

  let saldoConferido = false;
  if (erros.length === 0 && linhas.length > 0) {
    const problema = conferirSaldoParcial(linhas, resumo?.inicial ?? null);
    if (problema) erros.push(problema);
    if (resumo) {
      const creditos = linhas.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
      const debitos = linhas.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
      if (resumo.inicial + Math.abs(resumo.creditos) - Math.abs(resumo.debitos) !== resumo.final) {
        erros.push("O resumo do extrato não fecha: saldo inicial + créditos − débitos ≠ saldo final.");
      } else if (creditos !== Math.abs(resumo.creditos) || -debitos !== Math.abs(resumo.debitos)) {
        erros.push(
          `As linhas somam créditos de ${reais(creditos)} e débitos de ${reais(-debitos)}, diferentes do resumo do arquivo. O arquivo pode estar incompleto.`,
        );
      }
    }
    saldoConferido = erros.length === 0;
  }
  return {
    linhas,
    saldoInicial: resumo?.inicial ?? null,
    saldoFinal: resumo?.final ?? (linhas.length ? linhas[linhas.length - 1].saldoApos : null),
    saldoConferido,
    erros,
    avisos,
  };
}

function lerLiberacoes(registros: Registro[], iCabecalho: number): LeituraDoFormato {
  const erros: string[] = [];
  const avisos: string[] = [];
  const cab = registros[iCabecalho].campos.map(nomeDaColuna);
  const i = (c: string) => cab.indexOf(c);
  const opcional = (r: Registro, c: string) => (i(c) >= 0 ? (r.campos[i(c)] ?? "").trim() : "");
  const dados = registros.slice(iCabecalho + 1).filter((r) => r.campos.some((c) => c.trim() !== ""));
  const temSaldo = i("BALANCE_AMOUNT") >= 0;
  const estilo = estiloDe(
    dados.flatMap((r) =>
      ["NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "MP_FEE_AMOUNT", "BALANCE_AMOUNT"].map((c) => opcional(r, c)),
    ),
  );

  let saldoInicial: number | null = null;
  const linhas: LinhaBruta[] = [];
  for (const r of dados) {
    if (erros.length >= MAX_ERROS) break;
    const tipo = opcional(r, "RECORD_TYPE");
    const tipoN = normalizarTexto(tipo);
    const credito = lerCentavos(opcional(r, "NET_CREDIT_AMOUNT"), estilo);
    const debito = lerCentavos(opcional(r, "NET_DEBIT_AMOUNT"), estilo);
    const saldo = temSaldo ? lerCentavos(opcional(r, "BALANCE_AMOUNT"), estilo) : null;
    if (credito === undefined || debito === undefined || saldo === undefined) {
      erros.push(`Linha ${r.linha}: valor inválido.`);
      continue;
    }
    if (/inicial|initial/.test(tipoN)) {
      saldoInicial = saldo ?? (credito ?? 0) - Math.abs(debito ?? 0);
      continue;
    }
    if (/^(sub ?)?total/.test(tipoN)) continue;
    const moeda = opcional(r, "CURRENCY");
    if (moeda && moeda.toUpperCase() !== "BRL") {
      erros.push(`Linha ${r.linha}: moeda ${moeda.slice(0, 5)}; só reais são aceitos.`);
      continue;
    }
    const data = opcional(r, "DATE");
    if (!lerData(data)) {
      erros.push(`Linha ${r.linha}: data inválida.`);
      continue;
    }
    if (credito === null && debito === null) {
      erros.push(`Linha ${r.linha}: sem crédito nem débito.`);
      continue;
    }
    const bruto = lerCentavos(opcional(r, "GROSS_AMOUNT"), estilo);
    const tarifa = lerCentavos(opcional(r, "MP_FEE_AMOUNT"), estilo);
    if (bruto === undefined || tarifa === undefined) {
      erros.push(`Linha ${r.linha}: valor bruto ou tarifa inválidos.`);
      continue;
    }
    linhas.push({
      linha: r.linha,
      data,
      descricao: opcional(r, "DESCRIPTION"),
      tipoNoArquivo: tipo || null,
      idDaOperacao: opcional(r, "SOURCE_ID") || null,
      referenciaExterna: opcional(r, "EXTERNAL_REFERENCE") || null,
      // A documentação diverge sobre o sentido das duas colunas; o saldo
      // (BALANCE_AMOUNT) é que confirma. Sem ele, fica o aviso abaixo.
      valor: Math.abs(credito ?? 0) - Math.abs(debito ?? 0),
      valorBruto: bruto,
      tarifa: tarifa === null ? null : Math.abs(tarifa),
      saldoApos: saldo,
    });
  }

  let saldoConferido = false;
  if (erros.length === 0 && linhas.length > 0) {
    if (temSaldo) {
      const problema = conferirSaldoParcial(linhas, saldoInicial);
      if (problema) erros.push(problema);
      saldoConferido = erros.length === 0;
    } else {
      avisos.push(
        "Sem a coluna BALANCE_AMOUNT: o sentido de crédito e débito e a soma do arquivo não puderam ser conferidos. Inclua a coluna de saldo no relatório.",
      );
    }
  }
  if (i("GROSS_AMOUNT") < 0 || i("MP_FEE_AMOUNT") < 0) {
    avisos.push("O relatório não traz valor bruto e tarifa (GROSS_AMOUNT e MP_FEE_AMOUNT): só o líquido aparece.");
  }
  return {
    linhas,
    saldoInicial,
    saldoFinal: temSaldo && linhas.length ? linhas[linhas.length - 1].saldoApos : null,
    saldoConferido,
    erros,
    avisos,
  };
}

function identificarFormato(registros: Registro[]):
  | { formato: FormatoDoExtrato; iCabecalho: number }
  | { erro: string } {
  for (let i = 0; i < Math.min(registros.length, 10); i += 1) {
    const cab = registros[i].campos.map(nomeDaColuna);
    if (contem(cab, COLUNAS_DO_EXTRATO)) return { formato: "EXTRATO_DA_CONTA", iCabecalho: i };
    if (contem(cab, COLUNAS_DE_LIBERACOES)) return { formato: "LIBERACOES", iCabecalho: i };
    if (contem(cab, COLUNAS_DE_VENDAS)) {
      return {
        erro: "Este é um relatório de vendas/transações. Ele não traz todas as movimentações da conta (transferências, cofrinho, saques). Envie o extrato da conta ou o relatório de liberações.",
      };
    }
  }
  const primeira = registros[0]?.campos.map((c) => c.trim()) ?? [];
  const pareceCabecalho = primeira.length > 1 && primeira.every((c) => /^[A-Za-z_ ]{2,40}$/.test(c));
  return {
    erro: pareceCabecalho
      ? `Formato não reconhecido. Colunas encontradas: ${primeira.slice(0, 15).join(", ")}.`
      : "Formato não reconhecido: a primeira linha não parece um cabeçalho de relatório do Mercado Pago.",
  };
}

// ---------------------------------------------------------------- análise

function arquivoVazio(
  a: ArquivoDoExtrato,
  situacao: ArquivoAnalisado["situacao"],
  erros: string[] = [],
  avisos: string[] = [],
): ArquivoAnalisado {
  return {
    nome: a.nome,
    hash: a.hash,
    bytes: a.bytes.length,
    situacao,
    formato: null,
    erros,
    avisos,
    periodo: null,
    linhas: 0,
    saldoInicial: null,
    saldoFinal: null,
    saldoConferido: false,
  };
}

function lerArquivo(a: ArquivoDoExtrato): { analisado: ArquivoAnalisado; linhas: LinhaBruta[] } {
  const b = a.bytes;
  if (b.length === 0) return { analisado: arquivoVazio(a, "RECUSADO", ["Arquivo vazio."]), linhas: [] };
  if (b.length > LIMITES_DO_EXTRATO.bytesPorArquivo) {
    return { analisado: arquivoVazio(a, "RECUSADO", ["Arquivo maior que 2 MB."]), linhas: [] };
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return {
      analisado: arquivoVazio(a, "RECUSADO", [
        "PDF ainda não é lido automaticamente. Baixe o mesmo período em CSV no Mercado Pago.",
      ]),
      linhas: [],
    };
  }
  if (b[0] === 0x50 && b[1] === 0x4b) {
    return {
      analisado: arquivoVazio(a, "RECUSADO", ["Planilha Excel não é aceita. Baixe o relatório em CSV."]),
      linhas: [],
    };
  }
  const { texto, aviso } = decodificar(b);
  const semBom = texto.replace(/^﻿/, "");
  const registros = lerCsv(semBom, detectarSeparador(semBom));
  const formato = identificarFormato(registros);
  if ("erro" in formato) return { analisado: arquivoVazio(a, "RECUSADO", [formato.erro]), linhas: [] };
  if (registros.length - formato.iCabecalho - 1 > LIMITES_DO_EXTRATO.linhasPorArquivo) {
    return { analisado: arquivoVazio(a, "RECUSADO", ["Arquivo com mais de 20 mil linhas."]), linhas: [] };
  }
  const leitura =
    formato.formato === "LIBERACOES"
      ? lerLiberacoes(registros, formato.iCabecalho)
      : lerExtratoDaConta(registros, formato.iCabecalho);
  if (leitura.erros.length === 0 && leitura.linhas.length === 0) leitura.erros.push("Nenhuma movimentação no arquivo.");
  const avisos = [...(aviso ? [aviso] : []), ...leitura.avisos];
  const dias = leitura.linhas.map((l) => lerData(l.data)!);
  if (dias.some((d) => !d.fusoInformado)) {
    avisos.push("Datas sem fuso horário: o dia foi considerado como está escrito no arquivo.");
  }
  const ordenados = dias.map((d) => d.dia).sort();
  return {
    analisado: {
      nome: a.nome,
      hash: a.hash,
      bytes: b.length,
      situacao: leitura.erros.length ? "RECUSADO" : "ACEITO",
      formato: formato.formato,
      erros: leitura.erros,
      avisos,
      periodo: ordenados.length ? { de: ordenados[0], ate: ordenados[ordenados.length - 1] } : null,
      linhas: leitura.linhas.length,
      saldoInicial: leitura.saldoInicial,
      saldoFinal: leitura.saldoFinal,
      saldoConferido: leitura.saldoConferido,
    },
    linhas: leitura.erros.length ? [] : leitura.linhas,
  };
}

function chaveDa(formato: FormatoDoExtrato, l: LinhaBruta, dia: string): { chave: string; confiavel: boolean } {
  const desc = normalizarTexto(`${l.tipoNoArquivo ?? ""} ${l.descricao}`);
  if (l.idDaOperacao) return { chave: `${formato}|${l.idDaOperacao}|${desc}|${l.valor}|${dia}`, confiavel: true };
  // Sem identificador: data e valor sozinhos nunca decidem que é a mesma operação.
  return { chave: `${formato}~${dia}|${desc}|${l.valor}|${l.saldoApos ?? ""}`, confiavel: false };
}

/**
 * Analisa um lote de arquivos. Mesmo conteúdo (hash) entra uma vez só; o
 * mesmo identificador em outro arquivo (período sobreposto) não é somado de
 * novo; repetição sem identificador confiável é só apontada.
 */
export function analisarExtratos(arquivos: ArquivoDoExtrato[]): AnaliseDeExtratos {
  const analisados: ArquivoAnalisado[] = [];
  const movimentacoes: MovimentacaoDoExtrato[] = [];
  const vistas = new Map<string, { arquivo: number; linha: number }>();
  let formatoDoLote: FormatoDoExtrato | null = null;

  arquivos.forEach((a, indice) => {
    const anterior = analisados.findIndex((x) => x.hash === a.hash);
    if (anterior >= 0) {
      analisados.push(
        arquivoVazio(a, "REPETIDO", [], [`Mesmo conteúdo de "${analisados[anterior].nome}": não foi lido de novo.`]),
      );
      return;
    }
    const { analisado, linhas } = lerArquivo(a);
    if (analisado.situacao === "ACEITO" && formatoDoLote && analisado.formato !== formatoDoLote) {
      analisado.situacao = "RECUSADO";
      analisado.erros.push("Formato diferente dos outros arquivos. Analise um formato de cada vez.");
      analisados.push(analisado);
      return;
    }
    if (analisado.situacao === "ACEITO") {
      formatoDoLote = analisado.formato;
      analisados.forEach((outro, j) => {
        if (outro.situacao !== "ACEITO" || !outro.periodo || !analisado.periodo) return;
        if (outro.periodo.de <= analisado.periodo.ate && analisado.periodo.de <= outro.periodo.ate) {
          analisado.avisos.push(
            `Período sobreposto ao de "${outro.nome}" (arquivo ${j + 1}). Operações repetidas não são somadas de novo.`,
          );
        }
      });
      for (const l of linhas) {
        const data = lerData(l.data)!;
        const { chave, confiavel } = chaveDa(analisado.formato!, l, data.dia);
        const ja = vistas.get(chave);
        let repeticao: RepeticaoDaMovimentacao | null = null;
        if (ja && ja.arquivo !== indice) {
          repeticao = { tipo: confiavel ? "MESMA_OPERACAO" : "POSSIVEL", ...ja };
        } else if (ja && !analisado.saldoConferido) {
          // No mesmo arquivo com o saldo conferido, as duas linhas movimentaram dinheiro de fato.
          repeticao = { tipo: "POSSIVEL", ...ja };
        }
        if (!ja) vistas.set(chave, { arquivo: indice, linha: l.linha });
        const texto = `${l.tipoNoArquivo ?? ""} ${l.descricao}`;
        const { categoria, regra } = classificarMovimentacao(texto, l.valor);
        movimentacoes.push({
          arquivo: indice,
          linha: l.linha,
          dataOriginal: l.data,
          dataBrasilia: data.dataBrasilia,
          dia: data.dia,
          fusoInformado: data.fusoInformado,
          descricao: l.descricao,
          tipoNoArquivo: l.tipoNoArquivo,
          idDaOperacao: l.idDaOperacao,
          referenciaExterna: l.referenciaExterna,
          valor: l.valor,
          valorBruto: l.valorBruto,
          tarifa: l.tarifa,
          saldoApos: l.saldoApos,
          categoria,
          regra,
          chave,
          chaveConfiavel: confiavel,
          repeticao,
        });
      }
    }
    analisados.push(analisado);
  });

  return { arquivos: analisados, movimentacoes, resumo: resumir(movimentacoes, formatoDoLote) };
}

function resumir(todas: MovimentacaoDoExtrato[], formato: FormatoDoExtrato | null): ResumoDoExtratoMercadoPago {
  const contam = todas.filter((m) => m.repeticao?.tipo !== "MESMA_OPERACAO");
  const soma = (ms: MovimentacaoDoExtrato[], f: (m: MovimentacaoDoExtrato) => number) =>
    ms.reduce((s, m) => s + f(m), 0);
  const entradas = (ms: MovimentacaoDoExtrato[]) => soma(ms, (m) => (m.valor > 0 ? m.valor : 0));
  const saidas = (ms: MovimentacaoDoExtrato[]) => soma(ms, (m) => (m.valor < 0 ? m.valor : 0));
  const de = (c: CategoriaDoExtrato) => contam.filter((m) => m.categoria === c);

  const porCategoria = (Object.keys(CATEGORIAS_DO_EXTRATO) as CategoriaDoExtrato[])
    .map((categoria) => ({ categoria, quantidade: de(categoria).length, entradas: entradas(de(categoria)), saidas: saidas(de(categoria)) }))
    .filter((c) => c.quantidade > 0);

  const meses = Array.from(new Set(contam.map((m) => m.dia.slice(0, 7)))).sort();
  const porMes = meses.map((mes) => {
    const ms = contam.filter((m) => m.dia.startsWith(mes));
    return { mes, entradas: entradas(ms), saidas: saidas(ms), liquido: soma(ms, (m) => m.valor) };
  });

  const enviado = -saidas([...de("TRANSFERENCIA_PARA_COFRINHO"), ...de("RESERVA_AUTOMATICA_POR_VENDAS")]);
  const retirado = entradas(de("RETIRADA_DO_COFRINHO"));
  const comTarifa = contam.filter((m) => m.tarifa !== null);
  const comBruto = contam.filter((m) => m.valorBruto !== null);
  const dias = contam.map((m) => m.dia).sort();
  return {
    formato,
    periodo: dias.length ? { de: dias[0], ate: dias[dias.length - 1] } : null,
    quantidade: contam.length,
    entradas: entradas(contam),
    saidas: saidas(contam),
    liquido: soma(contam, (m) => m.valor),
    porCategoria,
    porMes,
    cofrinho: { enviado, retirado, liquido: enviado - retirado, rendimentos: soma(de("RENDIMENTO_DO_COFRINHO"), (m) => m.valor) },
    tarifasEmbutidas: comTarifa.length ? soma(comTarifa, (m) => m.tarifa!) : null,
    diferencaBrutoLiquido: comBruto.length ? soma(comBruto, (m) => Math.abs(m.valorBruto!) - Math.abs(m.valor)) : null,
    pendentes: de("DESCONHECIDA").length,
    repeticoesIgnoradas: todas.length - contam.length,
    possiveisRepeticoes: todas.filter((m) => m.repeticao?.tipo === "POSSIVEL").length,
  };
}
