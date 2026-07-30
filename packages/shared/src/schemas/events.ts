import { z } from "zod";
import { EVENT_TYPES } from "../enums";

export const createEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  date: z.coerce.date(),
  guestCount: z.coerce.number().int().min(1).max(2000),
  budgetGoal: z.coerce.number().min(0).optional(),
  themeId: z.string().cuid().optional(),
  address: z.string().max(255).optional(),
  neighborhood: z.string().max(120).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
