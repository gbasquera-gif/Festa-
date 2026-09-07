/**
 * A régua de preparação de uma festa.
 *
 * O problema que isto resolve não é de software: é a festa de dia 20 que
 * ninguém olhou desde que foi fechada em julho. Com poucas festas por mês, a
 * equipe se lembra; com a agenda cheia, alguém esquece — e o custo do
 * esquecimento aparece no dia, quando não dá mais para comprar, alugar ou
 * remarcar.
 *
 * Aqui ficam só as decisões: em que etapa uma festa está, o que aquela etapa
 * exige e quão grave é estar atrasado nela. Quem lê o banco e monta a tela
 * usa estas funções, para o painel e o servidor nunca discordarem sobre o
 * que é "urgente".
 */

/** As tarefas operacionais de uma reserva, na ordem em que são feitas. */
export const RESERVATION_TASKS = [
  "dados_conferidos",
  "pagamento_conferido",
  "logistica_confirmada",
  "estoque_validado",
  "itens_separados",
  "itens_conferidos",
  "cliente_avisado",
  "devolucao_concluida",
] as const;

export type ReservationTaskKey = (typeof RESERVATION_TASKS)[number];

export const RESERVATION_TASK_LABELS: Record<ReservationTaskKey, string> = {
  dados_conferidos: "Dados conferidos",
  pagamento_conferido: "Pagamento conferido",
  logistica_confirmada: "Logística confirmada",
  estoque_validado: "Estoque validado",
  itens_separados: "Itens separados",
  itens_conferidos: "Itens conferidos",
  cliente_avisado: "Cliente avisado",
  devolucao_concluida: "Devolução concluída",
};

/** Identificador de cada degrau da régua. */
export const PREPARATION_STAGES = [
  "FUTURA",
  "D30",
  "D15",
  "D7",
  "D3",
  "D1",
  "DIA_D",
  "D_MAIS_1",
  "ENCERRADA",
] as const;

export type PreparationStage = (typeof PREPARATION_STAGES)[number];

export interface EtapaDaRegua {
  stage: PreparationStage;
  /** Como a etapa aparece na tela. */
  titulo: string;
  /** O que fazer nesta etapa, em linguagem de operação. */
  acoes: string[];
  /** Tarefas do checklist que esta etapa espera concluídas. */
  tarefas: ReservationTaskKey[];
}

export const REGUA: Record<PreparationStage, EtapaDaRegua> = {
  FUTURA: {
    stage: "FUTURA",
    titulo: "Ainda longe",
    acoes: ["Nada a fazer agora — entra no radar a 30 dias da festa."],
    tarefas: [],
  },
  D30: {
    stage: "D30",
    titulo: "30 dias — revisão",
    acoes: [
      "Conferir cliente, data e tema",
      "Revisar logística combinada",
      "Ler as observações especiais do pedido",
    ],
    tarefas: ["dados_conferidos"],
  },
  D15: {
    stage: "D15",
    titulo: "15 dias — conferência",
    acoes: [
      "Conferir o pagamento e o saldo",
      "Confirmar endereço e entrega ou retirada",
      "Confirmar se haverá montagem",
      "Resolver pendências abertas",
    ],
    tarefas: ["dados_conferidos", "pagamento_conferido", "logistica_confirmada"],
  },
  D7: {
    stage: "D7",
    titulo: "7 dias — preparação",
    acoes: [
      "Validar os itens do pedido",
      "Checar o estoque físico",
      "Revisar o kit",
    ],
    tarefas: [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
    ],
  },
  D3: {
    stage: "D3",
    titulo: "3 dias — separação",
    acoes: [
      "Iniciar a separação",
      "Conferir item por item",
      "Identificar faltas ou peças danificadas",
    ],
    tarefas: [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
    ],
  },
  D1: {
    stage: "D1",
    titulo: "Véspera — checklist final",
    acoes: [
      "Conferir se o pedido está completo",
      "Confirmar a logística",
      "Confirmar com o cliente",
      "Revisar pagamento e saldo",
    ],
    tarefas: [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
      "itens_conferidos",
      "cliente_avisado",
    ],
  },
  DIA_D: {
    stage: "DIA_D",
    titulo: "Hoje é a festa",
    acoes: [
      "Retirada ou entrega conforme combinado",
      "Montagem, se contratada",
      "Endereço e telefone do cliente à mão",
    ],
    tarefas: [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
      "itens_conferidos",
      "cliente_avisado",
    ],
  },
  D_MAIS_1: {
    stage: "D_MAIS_1",
    titulo: "Devolução",
    acoes: [
      "Receber os itens de volta",
      "Conferir quantidades",
      "Registrar danos, se houver",
      "Liberar as peças para a próxima festa",
    ],
    tarefas: [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
      "itens_conferidos",
      "cliente_avisado",
      "devolucao_concluida",
    ],
  },
  ENCERRADA: {
    stage: "ENCERRADA",
    titulo: "Encerrada",
    // Uma festa encerrada só continua aparecendo enquanto a devolução não
    // foi registrada — então a instrução que interessa aqui é a da devolução.
    // Deixar em branco daria um cartão que cobra atenção sem dizer o que fazer.
    acoes: [
      "Receber os itens de volta e conferir",
      "Registrar danos, se houver",
      "Liberar as peças para a próxima festa",
    ],
    tarefas: [...RESERVATION_TASKS],
  },
};

/**
 * Quantos dias inteiros faltam para a festa.
 *
 * Compara só a data, ignorando a hora: uma festa de hoje às 8h continua
 * sendo "hoje" às 18h, e não "ontem". Trabalha no fuso de Chapecó porque é
 * o calendário de quem lê — em UTC, tudo depois das 21h já seria amanhã.
 */
export function diasAteAFesta(dataDaFesta: Date, agora: Date = new Date()): number {
  const dia = (d: Date) => {
    const local = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  };
  return Math.round((dia(dataDaFesta) - dia(agora)) / 86_400_000);
}

/**
 * Em que degrau da régua uma festa está.
 *
 * Os limites são fechados no fim do intervalo de propósito: faltando
 * exatamente 7 dias, a festa já está na etapa de 7 dias — e não na anterior.
 * Quem lê "D-7" espera que ela valha no dia 7, não no dia 6.
 */
export function etapaDaRegua(dias: number): EtapaDaRegua {
  if (dias > 30) return REGUA.FUTURA;
  if (dias > 15) return REGUA.D30;
  if (dias > 7) return REGUA.D15;
  if (dias > 3) return REGUA.D7;
  if (dias > 1) return REGUA.D3;
  if (dias === 1) return REGUA.D1;
  if (dias === 0) return REGUA.DIA_D;
  if (dias === -1) return REGUA.D_MAIS_1;
  return REGUA.ENCERRADA;
}

/** Ordem dos degraus, para saber se uma tarefa venceu numa etapa anterior. */
const ORDEM: PreparationStage[] = [
  "FUTURA",
  "D30",
  "D15",
  "D7",
  "D3",
  "D1",
  "DIA_D",
  "D_MAIS_1",
  "ENCERRADA",
];

/** Em que etapa cada tarefa passa a ser cobrada. */
export function etapaQueCobra(tarefa: ReservationTaskKey): PreparationStage {
  for (const stage of ORDEM) {
    if (REGUA[stage].tarefas.includes(tarefa)) return stage;
  }
  return "ENCERRADA";
}

export const SITUACOES = ["NORMAL", "ATENCAO", "URGENTE", "ATRASADO"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const SITUACAO_LABELS: Record<Situacao, string> = {
  NORMAL: "Normal",
  ATENCAO: "Atenção",
  URGENTE: "Urgente",
  ATRASADO: "Atrasado",
};

export interface EntradaDoSemaforo {
  dias: number;
  /** Tarefas já concluídas nesta reserva. */
  feitas: readonly string[];
  /** Impedimentos que não são tarefa — falta telefone, sinal não pago, etc. */
  pendencias: readonly string[];
  /**
   * Em que degrau a reserva já nasceu.
   *
   * Uma venda fechada hoje para a festa de sábado nasce em D-3: cobrar dela
   * as tarefas de D-30 e D-15 seria marcar como atrasada uma reserva que
   * acabou de existir. O prazo de uma tarefa nunca é anterior ao dia em que
   * a reserva passou a existir.
   */
  etapaNaCriacao?: PreparationStage;
}

/**
 * O semáforo de uma reserva.
 *
 * Quatro estados e nada mais, porque a tela é lida de relance por quem está
 * com as mãos ocupadas. A regra é uma pergunta só: o que já deveria estar
 * pronto está pronto?
 *
 * - vermelho: passou do prazo — tarefa cobrada numa etapa anterior à atual;
 * - laranja: falta pouco tempo (véspera, dia ou devolução) e ainda há tarefa;
 * - amarelo: a etapa de agora tem tarefa aberta, mas ainda há prazo;
 * - verde: em dia.
 *
 * Pendência que não é tarefa (sinal não pago, endereço faltando) puxa para
 * atenção sozinha: não trava a etapa, mas ninguém deveria descobrir isso na
 * véspera.
 */
export function situacaoDaReserva({
  dias,
  feitas,
  pendencias,
  etapaNaCriacao,
}: EntradaDoSemaforo): Situacao {
  const etapa = etapaDaRegua(dias);
  const atual = ORDEM.indexOf(etapa.stage);
  const concluidas = new Set(feitas);
  const nascimento = ORDEM.indexOf(etapaNaCriacao ?? "FUTURA");

  const abertas = etapa.tarefas.filter((t) => !concluidas.has(t));

  // O prazo de uma tarefa é o mais tardio entre o degrau que a cobra e o
  // degrau em que a reserva nasceu.
  const venceuAntes = abertas.some(
    (t) => Math.max(ORDEM.indexOf(etapaQueCobra(t)), nascimento) < atual,
  );
  if (venceuAntes) return "ATRASADO";

  // A festa já passou e a devolução não foi registrada: as peças estão fora
  // e o acervo não sabe. É o pior tipo de pendência, porque compromete a
  // próxima festa sem ninguém perceber.
  if (etapa.stage === "ENCERRADA" && !concluidas.has("devolucao_concluida")) {
    return "ATRASADO";
  }

  if (abertas.length > 0) {
    const apertado = etapa.stage === "D1" || etapa.stage === "DIA_D" || etapa.stage === "D_MAIS_1";
    return apertado ? "URGENTE" : "ATENCAO";
  }

  if (pendencias.length > 0) return "ATENCAO";
  return "NORMAL";
}
