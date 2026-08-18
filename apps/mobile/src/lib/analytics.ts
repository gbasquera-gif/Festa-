import type { AnalyticsEventType } from "@festae/shared";
import { api } from "./api";
import { origemComoMetadata, visitaJaContada } from "./origem";

/**
 * Registra um passo do funil.
 *
 * A origem viaja junto em todos os eventos, e não só na visita: é assim que
 * "o Instagram traz gente" vira "o Instagram traz gente que reserva". Sem
 * isso, cada degrau do funil é um número solto, sem dizer de onde veio.
 *
 * Best-effort: falha de tracking nunca pode quebrar a jornada de quem está
 * comprando (sem internet, backend fora do ar).
 */
export function track(type: AnalyticsEventType, metadata?: Record<string, unknown>) {
  api("/analytics/events", {
    method: "POST",
    body: JSON.stringify({ type, metadata: { ...origemComoMetadata(), ...metadata } }),
  }).catch(() => {});
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

export function registrarVisita() {
  if (visitaRegistrada) return;
  visitaRegistrada = true;
  // Recarregar a página não é visita nova: quem atualiza a tela três vezes
  // viraria três visitas e faria a conversão parecer pior do que é.
  if (visitaJaContada()) return;
  track("VISITA_LOJA");
}
