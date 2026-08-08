import { Logger } from "@nestjs/common";
import { DEFAULT_MAX_RESERVATIONS_PER_DAY } from "@festae/shared";

const logger = new Logger("OperationsConfig");

/**
 * Capacidade diária da operação.
 *
 * Único ponto do sistema que responde "quantas festas cabem num dia". Hoje
 * a resposta vem de `MAX_RESERVATIONS_PER_DAY`; quando a Festaê quiser que
 * a Maria Luiza mude isso pelo painel, é esta função que passa a ler do
 * banco — nada mais precisa mudar.
 */
export function getMaxReservationsPerDay(): number {
  const raw = process.env.MAX_RESERVATIONS_PER_DAY;
  if (!raw) return DEFAULT_MAX_RESERVATIONS_PER_DAY;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    // Valor inválido não pode virar "capacidade infinita" nem "zero": o
    // primeiro derruba a operação com festas demais, o segundo impede
    // qualquer reserva. Cai no padrão e avisa alto.
    logger.error(
      `MAX_RESERVATIONS_PER_DAY inválido ("${raw}"). Usando ${DEFAULT_MAX_RESERVATIONS_PER_DAY} festas por dia.`,
    );
    return DEFAULT_MAX_RESERVATIONS_PER_DAY;
  }

  return value;
}
