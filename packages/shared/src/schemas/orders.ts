import { z } from "zod";

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
