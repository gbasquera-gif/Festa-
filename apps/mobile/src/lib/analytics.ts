import type { AnalyticsEventType } from "@festae/shared";
import { api } from "./api";

// Best-effort: nunca deixa uma falha de tracking quebrar a experiência do
// usuário (ex: sem internet, backend fora do ar).
export function track(type: AnalyticsEventType, metadata?: Record<string, unknown>) {
  api("/analytics/events", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(() => {});
}
