/**
 * Parâmetros operacionais da Festaê.
 *
 * Decisões de negócio que o código precisa conhecer, reunidas num lugar só
 * para que ninguém precise caçar número mágico no meio de um serviço.
 */

/*
 * NÃO existe limite de reservas por dia.
 *
 * Havia: duas festas por data, com a variável `MAX_RESERVATIONS_PER_DAY`
 * para ajustar. A regra partia de uma premissa errada — a de que toda
 * reserva é uma festa completa montada no local. Uma data pode ter festa
 * completa, só balões, itens avulsos e retirada no balcão, que são
 * trabalhos de tamanhos muito diferentes; contar todos como "uma festa" e
 * parar no segundo recusava venda que a operação dava conta de entregar.
 *
 * O que continua limitando uma data é o material: uma peça comprometida com
 * uma festa não pode estar em outra no mesmo dia. Essa conferência é física,
 * é item a item, e não foi tocada.
 */

/**
 * Tempo de vida do QR Code do Pix.
 *
 * O Mercado Pago aceita de 30 minutos a 30 dias, e usa 24 horas quando não
 * dizemos nada. Vinte e quatro horas é ruim aqui: cada Pix não pago segura o
 * material que a reserva pediu, e um painel parado por um dia inteiro é uma
 * peça que outra festa não pôde usar. Trinta minutos é o mínimo permitido e é
 * tempo de sobra para alguém abrir o app do banco e pagar.
 */
export const PIX_EXPIRATION_MINUTES = 30;

/**
 * Por quanto tempo uma reserva sem sinal pago segura a data.
 *
 * Maior que a validade do Pix de propósito: quando a janela fecha, o QR já
 * venceu e não há como o pagamento chegar depois — o material volta a ficar
 * livre sem risco de alguém pagar por uma peça já dada a outra festa.
 */
export const RESERVATION_HOLD_MINUTES = 60;

export const RESERVATION_EXPIRED_MESSAGE =
  "O prazo para pagar o sinal desta reserva venceu e a data foi liberada. Você pode montar a festa de novo — se a data ainda estiver disponível, ela é sua.";
