import { z } from "zod";
import { ANALYTICS_EVENT_TYPES } from "../enums";

export const trackEventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  userId: z.string().cuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;
