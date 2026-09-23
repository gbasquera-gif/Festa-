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
