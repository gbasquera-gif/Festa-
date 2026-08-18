import { z } from "zod";
import { RESERVATION_STATUSES } from "../enums";

export const createReservationSchema = z.object({
  notes: z.string().max(1000).optional(),
});
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const updateReservationStatusSchema = z.object({
  status: z.enum(RESERVATION_STATUSES),
});
export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;
