import { diaEmChapeco } from "./data-da-festa";

/**
 * O vocabulário da Performance do Acervo.
 *
 * As contas vivem no backend (`modules/acervo/performance.ts`); aqui fica o
 * que a tela e o servidor precisam dizer com as mesmas palavras: as janelas
 * do filtro, a origem de um produto numa festa e o contexto de um conflito.
 */

/** As janelas do filtro, em dias. O padrão é 90. */
export const JANELAS_DO_ACERVO = [30, 90, 180, 365] as const;
export type JanelaDoAcervo = (typeof JANELAS_DO_ACERVO)[number];
export const JANELA_PADRAO_DO_ACERVO: JanelaDoAcervo = 90;

/** "Sem uso recente" é sempre 90 dias, qualquer que seja a janela da tela. */
export const DIAS_SEM_USO = 90;

/** A pressão futura olha sempre os próximos 30 dias. */
export const DIAS_DA_PRESSAO = 30;

export function ehJanelaDoAcervo(valor: number): valor is JanelaDoAcervo {
  return (JANELAS_DO_ACERVO as readonly number[]).includes(valor);
}

/** Soma dias a um "AAAA-MM-DD" (negativo volta), sem passar por fuso. */
export function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Os últimos `dias` dias até hoje, inclusive, no calendário de Chapecó.
 *
 * "Últimos 90 dias" são 90 dias de calendário: hoje e os 89 anteriores. É
 * uso que já aconteceu — o que vem depois de hoje é compromisso, e fica
 * noutra conta.
 */
export function janelaPassada(agora: Date, dias: number): { de: string; ate: string } {
  const hoje = diaEmChapeco(agora);
  return { de: somarDias(hoje, -(dias - 1)), ate: hoje };
}

/** De onde o produto veio naquela festa. */
export type OrigemNoPedido = "KIT" | "EXTRA" | "KIT_EXTRA";

export const ORIGEM_NO_PEDIDO_LABEL: Record<OrigemNoPedido, string> = {
  KIT: "Kit",
  EXTRA: "Extra",
  KIT_EXTRA: "Kit + Extra",
};

/** Os contextos que o registro de conflitos grava (Sprint 7B), com o nome da tela. */
export const CONTEXTO_DO_CONFLITO_LABEL: Record<string, string> = {
  VENDA_MANUAL: "Venda manual",
  CONVERSAO_DE_PROPOSTA: "Conversão de proposta",
  EDICAO_DE_RESERVA: "Edição de reserva",
  REAGENDAMENTO: "Reagendamento",
  LOJA: "Loja",
};
