import { Platform } from "react-native";

/**
 * De onde veio quem abriu a loja.
 *
 * A pergunta que a Maria Luiza faz é "vale a pena postar no Instagram?", e
 * ela só tem resposta se a visita souber dizer de onde veio. Sem isso o
 * relatório mostra quantas pessoas chegaram, mas não o que trouxe elas.
 *
 * Duas fontes, nesta ordem:
 *   1. `?utm_source=` no link — é o que a Festaê controla ao publicar.
 *   2. o site que encaminhou, quando o navegador informa.
 *
 * O Instagram costuma abrir links no navegador interno dele, que muitas
 * vezes não manda o referrer. Por isso o `utm_source` no link publicado é o
 * que realmente vai funcionar — o referrer é só a rede de segurança.
 */
export function origemDaVisita(): string | undefined {
  if (Platform.OS !== "web") return "app";

  try {
    const utm = new URL(window.location.href).searchParams.get("utm_source");
    if (utm) return utm.slice(0, 60);

    const referrer = document.referrer;
    if (!referrer) return "direto";

    const host = new URL(referrer).hostname.replace(/^www\./, "");
    // Mesmo domínio é navegação interna, não uma visita nova.
    if (host === window.location.hostname) return undefined;
    return host.slice(0, 60);
  } catch {
    return undefined;
  }
}
