/**
 * Parâmetros operacionais da Festaê.
 *
 * Decisões de negócio que o código precisa conhecer, reunidas num lugar só
 * para que ninguém precise caçar número mágico no meio de um serviço.
 */

/**
 * Quantas festas a Festaê consegue atender por dia.
 *
 * Decisão operacional do lançamento, não limitação técnica: a equipe dá
 * conta de duas. O backend lê este valor por variável de ambiente
 * (`MAX_RESERVATIONS_PER_DAY`), então subir para 3 ou 4 quando a capacidade
 * crescer é trocar a variável — não mexer no código. O passo seguinte, que
 * fica para quando houver necessidade real, é guardar isso numa tabela de
 * configuração e dar um campo à Maria Luiza no painel; a leitura já está
 * isolada numa função só, então essa troca é local.
 */
export const DEFAULT_MAX_RESERVATIONS_PER_DAY = 2;

/**
 * Tempo de vida do QR Code do Pix.
 *
 * O Mercado Pago aceita de 30 minutos a 30 dias, e usa 24 horas quando não
 * dizemos nada. Vinte e quatro horas é ruim aqui: com capacidade de duas
 * festas por dia, cada Pix não pago segura metade de uma data por um dia
 * inteiro. Trinta minutos é o mínimo permitido e é tempo de sobra para
 * alguém abrir o app do banco e pagar.
 */
export const PIX_EXPIRATION_MINUTES = 30;

/**
 * Por quanto tempo uma reserva sem sinal pago segura a data.
 *
 * Maior que a validade do Pix de propósito: quando a janela fecha, o QR já
 * venceu e não há como o pagamento chegar depois — a data volta a ficar
 * livre sem risco de alguém pagar por uma vaga que já foi de outro.
 */
export const RESERVATION_HOLD_MINUTES = 60;

export const RESERVATION_EXPIRED_MESSAGE =
  "O prazo para pagar o sinal desta reserva venceu e a data foi liberada. Você pode montar a festa de novo — se a data ainda estiver disponível, ela é sua.";
