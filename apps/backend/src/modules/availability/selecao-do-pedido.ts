/**
 * O `select` do Prisma que traz tudo que um pedido compromete.
 *
 * Vive num lugar só pelo mesmo motivo de `itensDoKitDoPedido`: é o par
 * consulta + regra que decide o que está reservado. Consulta que esquecesse
 * `kitItems` voltaria a ler o cadastro atual do kit sem ninguém perceber.
 */
export const SELECAO_DO_COMPROMISSO = {
  kitCongeladoEm: true,
  kitItems: { select: { productId: true, quantity: true } },
  kit: { select: { products: { select: { productId: true, quantity: true } } } },
  items: { select: { productId: true, quantity: true } },
} as const;

/**
 * Os estados de reserva que seguram material na data. Recusada e cancelada
 * devolvem as peças. É a lista da disponibilidade; a pressão futura do
 * acervo lê a mesma, para as duas telas não discordarem sobre um dia.
 */
export const STATUS_QUE_COMPROMETEM = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;
