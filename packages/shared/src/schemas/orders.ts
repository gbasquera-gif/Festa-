import { z } from "zod";
import { FULFILLMENTS } from "../enums";

export const selectKitSchema = z.object({
  kitId: z.string().cuid(),
});
export type SelectKitInput = z.infer<typeof selectKitSchema>;

export const addOrderItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).max(999),
});
export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(999),
});
export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

/**
 * Logística do pedido: como o cliente recebe e se quer montagem.
 *
 * As duas escolhas viajam juntas porque são feitas na mesma tela e porque
 * ambas mexem no total — gravar uma sem a outra deixaria o resumo mostrando
 * um valor que o cliente não confirmou.
 */
export const setLogisticsSchema = z.object({
  fulfillment: z.enum(FULFILLMENTS),
  assembly: z.boolean(),
  /** Obrigatório quando a escolha é entrega. */
  address: z.string().max(200).optional(),
  neighborhood: z.string().max(100).optional(),
});
export type SetLogisticsInput = z.infer<typeof setLogisticsSchema>;
