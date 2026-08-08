import { z } from "zod";
import { PAYMENT_TYPES } from "../enums";

export const createCheckoutSchema = z.object({
  type: z.enum(PAYMENT_TYPES),
  method: z.enum(["PIX", "CARTAO"]),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
