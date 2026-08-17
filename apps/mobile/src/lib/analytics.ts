import type { AnalyticsEventType } from "@festae/shared";
import { api } from "./api";

// Best-effort: nunca deixa uma falha de tracking quebrar a experiência do
// usuário (ex: sem internet, backend fora do ar).
export function track(type: AnalyticsEventType, metadata?: Record<string, unknown>) {
  api("/analytics/events", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(() => {});
}

/**
 * Marca que alguém chegou na loja — o denominador de toda taxa de conversão.
 *
 * Uma vez por carregamento da página, e não a cada visita à home: a pessoa
 * volta para a home várias vezes durante a jornada, e contar cada volta
 * inflaria o topo do funil e faria a conversão parecer pior do que é.
 *
 * A variável vive no módulo porque isso já é exatamente "esta sessão": no
 * navegador ela morre quando a aba é recarregada ou fechada, que é o
 * comportamento desejado.
 */
let visitaRegistrada = false;

export function registrarVisita(origem?: string) {
  if (visitaRegistrada) return;
  visitaRegistrada = true;
  track("VISITA_LOJA", origem ? { origem } : undefined);
}
