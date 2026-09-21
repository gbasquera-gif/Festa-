import { diaEmChapeco } from "./data-da-festa";
import { toCentsInt } from "./pricing";
import type { ReservationStatus } from "./enums";

/**
 * Como a operação lê a lista de reservas.
 *
 * A tela mostrava tudo numa pilha só, do mais recente ao mais antigo. Com
 * trinta contratos ainda dava; com trezentos, achar a festa de sábado que
 * está sem sinal vira caça ao tesouro — e o que não se acha, não se cobra.
 *
 * A classificação mora aqui, e não na tela, porque a mesma pergunta aparece
 * em três lugares (lista, contadores das abas e ordenação). Três cópias da
 * regra é a forma mais barata de fazer o contador dizer 8 e a lista mostrar 7.
 */

export const ABAS_DE_RESERVA = ["ATIVAS", "PROXIMAS", "CONCLUIDAS", "CANCELADAS", "TODAS"] as const;
export type AbaDeReserva = (typeof ABAS_DE_RESERVA)[number];

export const ABA_DE_RESERVA_LABEL: Record<AbaDeReserva, string> = {
  ATIVAS: "Ativas",
  PROXIMAS: "Próximas",
  CONCLUIDAS: "Concluídas",
  CANCELADAS: "Canceladas",
  TODAS: "Todas",
};

export const ABA_DE_RESERVA_NOTA: Record<AbaDeReserva, string> = {
  ATIVAS: "o que ainda pede ação — pendências primeiro, depois a festa mais próxima",
  PROXIMAS: "festas de hoje em diante",
  CONCLUIDAS: "festas entregues e quitadas",
  CANCELADAS: "canceladas e recusadas — ficam no histórico, fora dos totais",
  TODAS: "tudo que existe, sem recorte",
};

/** O mínimo que uma reserva precisa expor para ser classificada. */
export type ReservaClassificavel = {
  status: ReservationStatus;
  /** Dia da festa. Aceita o ISO que a API devolve. */
  eventDate: string | Date;
  /** Total do pedido. */
  total: number;
  /** Soma dos pagamentos com status PAID. */
  recebido: number;
};

/**
 * Cancelada e recusada moram juntas.
 *
 * São histórias diferentes — uma desistiu, a outra nem chegou a ser aceita —
 * mas a operação faz a mesma coisa com as duas: nada. Separá-las em duas abas
 * criaria uma aba que quase sempre fica vazia.
 */
const MORTAS: readonly ReservationStatus[] = ["CANCELLED", "REJECTED"];

export type SituacaoOperacional = {
  cancelada: boolean;
  /** Dias até a festa, no calendário de Chapecó. Negativo = já passou. */
  diasAteAFesta: number;
  /** Falta dinheiro a receber. Normal antes da festa: o saldo vence nela. */
  pendenciaFinanceira: boolean;
  /** A festa já passou e o saldo continua aberto. Isso é atraso. */
  vencido: boolean;
  /** A festa já passou e a reserva não foi fechada como concluída. */
  pendenciaOperacional: boolean;
  /**
   * Precisa de ação agora.
   *
   * Não é o mesmo que "tem saldo": quase todo contrato tem saldo aberto até
   * o dia da festa, porque é nela que o cliente paga o restante. Se isso
   * marcasse a linha, a lista inteira ficaria marcada — e lista inteira
   * marcada é lista sem marca nenhuma.
   */
  temPendencia: boolean;
};

export function diasEntre(deDia: string, ateDia: string): number {
  const [a1, m1, d1] = deDia.split("-").map(Number);
  const [a2, m2, d2] = ateDia.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function situacaoOperacional(
  reserva: ReservaClassificavel,
  agora: Date,
): SituacaoOperacional {
  const cancelada = MORTAS.includes(reserva.status);
  const festa = diaEmChapeco(new Date(reserva.eventDate));
  const diasAteAFesta = diasEntre(diaEmChapeco(agora), festa);

  // Em centavos: 219,99999 < 220 em ponto flutuante transformaria contrato
  // quitado em pendência eterna, e a aba Ativas nunca esvaziaria.
  const saldo = toCentsInt(reserva.total) - toCentsInt(reserva.recebido);
  const pendenciaFinanceira = !cancelada && saldo > 0;
  const vencido = pendenciaFinanceira && diasAteAFesta < 0;
  const pendenciaOperacional = !cancelada && diasAteAFesta < 0 && reserva.status !== "COMPLETED";

  return {
    cancelada,
    diasAteAFesta,
    pendenciaFinanceira,
    vencido,
    pendenciaOperacional,
    temPendencia: vencido || pendenciaOperacional,
  };
}

/**
 * A que aba uma reserva pertence.
 *
 * "Ativa" não é o oposto de "concluída": uma festa já entregue com saldo em
 * aberto continua pedindo ação — alguém tem de cobrar. Por isso ela fica em
 * Ativas até o dinheiro entrar, e só então desce para Concluídas. Fosse pelo
 * status apenas, a cobrança sumiria da tela no dia em que a festa acabasse,
 * que é justamente quando ela começa.
 */
export function ehDaAba(reserva: ReservaClassificavel, aba: AbaDeReserva, agora: Date): boolean {
  const s = situacaoOperacional(reserva, agora);

  switch (aba) {
    case "TODAS":
      return true;
    case "CANCELADAS":
      return s.cancelada;
    case "CONCLUIDAS":
      return !s.cancelada && reserva.status === "COMPLETED" && !s.pendenciaFinanceira;
    case "PROXIMAS":
      return !s.cancelada && s.diasAteAFesta >= 0;
    case "ATIVAS":
      return !s.cancelada && (reserva.status !== "COMPLETED" || s.pendenciaFinanceira);
  }
}

/**
 * A ordem de leitura de Ativas.
 *
 * Pendência primeiro, e dentro dela a festa mais próxima — porque cobrar às
 * vésperas é mais urgente do que cobrar com dois meses pela frente. Depois o
 * resto, também por proximidade. Ordenar só por data poria o atraso de julho
 * no fim da lista, abaixo de tudo que está em dia.
 */
export function ordenarParaOperacao(
  reservas: readonly ReservaClassificavel[],
  agora: Date,
): ReservaClassificavel[] {
  return [...reservas].sort((a, b) => {
    const sa = situacaoOperacional(a, agora);
    const sb = situacaoOperacional(b, agora);
    if (sa.temPendencia !== sb.temPendencia) return sa.temPendencia ? -1 : 1;
    return sa.diasAteAFesta - sb.diasAteAFesta;
  });
}

/** Grupos de leitura da aba Próximas. */
export const GRUPOS_DE_PROXIMIDADE = ["HOJE", "SEMANA", "DEPOIS"] as const;
export type GrupoDeProximidade = (typeof GRUPOS_DE_PROXIMIDADE)[number];

export const GRUPO_DE_PROXIMIDADE_LABEL: Record<GrupoDeProximidade, string> = {
  HOJE: "Hoje",
  SEMANA: "Esta semana",
  DEPOIS: "Mais adiante",
};

export function grupoDeProximidade(diasAteAFesta: number): GrupoDeProximidade {
  if (diasAteAFesta <= 0) return "HOJE";
  return diasAteAFesta <= 7 ? "SEMANA" : "DEPOIS";
}
