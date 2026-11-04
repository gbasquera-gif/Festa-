import { diasEntre } from "./reservas";
import { diaEmChapeco } from "./data-da-festa";

/**
 * Alerta das propostas aprovadas que ainda não viraram reserva.
 *
 * Aprovar não é pagar. A proposta aprovada segura as peças da opção escolhida
 * até virar reserva, ser marcada como perdida ou excluída — e não vence
 * sozinha. Quando o sinal demora, a equipe precisa conferir: a cliente pode
 * ter pago por Pix direto na conta e o pagamento ainda não foi lançado.
 *
 * O alerta só informa. Não cancela, não converte, não libera peça e não mexe
 * em pagamento: a decisão é de quem confere o extrato e fala com a cliente.
 *
 * O prazo é um parâmetro de alerta, não um vencimento comercial. Fica no
 * conteúdo da proposta (mesmo lugar do percentual do sinal e da chave Pix),
 * para a equipe ajustar sem deploy.
 */

/** O prazo padrão do alerta, em horas. */
export const ALERTA_APROVADAS_HORAS_PADRAO = 48;

/** A chave do prazo no conteúdo institucional da proposta. */
export const CHAVE_DO_ALERTA_DE_APROVADAS = "alerta_aprovadas_horas";

/** Limites aceitos para o prazo: de 1 hora a 30 dias. */
export const ALERTA_APROVADAS_HORAS_MIN = 1;
export const ALERTA_APROVADAS_HORAS_MAX = 720;

/**
 * O prazo configurado, em horas. Vazio, inválido ou fora dos limites vale o
 * padrão: um texto digitado errado não pode desligar o alerta.
 */
export function limiarDoAlerta(texto: string | null | undefined): number {
  const valor = Number(String(texto ?? "").trim());
  return Number.isInteger(valor) && valor >= ALERTA_APROVADAS_HORAS_MIN && valor <= ALERTA_APROVADAS_HORAS_MAX
    ? valor
    : ALERTA_APROVADAS_HORAS_PADRAO;
}

export type AguardoDoSinal = {
  /** Horas inteiras desde a aprovação; nulo quando a aprovação não tem data registrada. */
  horasAguardando: number | null;
  /** Passou do prazo do alerta (sem data de aprovação, entra por precaução). */
  emAlerta: boolean;
  /** Dias até a festa (negativo: já passou); nulo sem data definida. */
  diasAteAFesta: number | null;
  festaJaPassou: boolean;
};

/** Quanto tempo a proposta aprovada aguarda o sinal, e se já está em alerta. */
export function aguardoDoSinal(
  agora: Date,
  aprovadoEm: Date | null,
  festaEm: Date | null,
  limiarHoras: number,
): AguardoDoSinal {
  const horasAguardando =
    aprovadoEm === null ? null : Math.max(0, Math.floor((agora.getTime() - aprovadoEm.getTime()) / 3_600_000));
  const diasAteAFesta = festaEm === null ? null : diasEntre(diaEmChapeco(agora), festaEm.toISOString().slice(0, 10));
  return {
    horasAguardando,
    emAlerta: horasAguardando === null || horasAguardando >= limiarHoras,
    diasAteAFesta,
    festaJaPassou: diasAteAFesta !== null && diasAteAFesta < 0,
  };
}

/** "2 dias e 5 h", "18 h", "sem data de aprovação" — como a equipe lê. */
export function textoDoAguardo(horas: number | null): string {
  if (horas === null) return "sem data de aprovação registrada";
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  const resto = horas % 24;
  return `${dias} ${dias === 1 ? "dia" : "dias"}${resto ? ` e ${resto} h` : ""}`;
}
