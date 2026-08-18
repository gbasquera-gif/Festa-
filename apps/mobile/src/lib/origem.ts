import { Platform } from "react-native";

/**
 * De onde veio quem abriu a loja.
 *
 * A pergunta que a Festaê faz é "vale a pena postar no Instagram?", e ela só
 * tem resposta se a visita souber dizer de onde veio — e se essa informação
 * sobreviver até a reserva. Saber que 40 pessoas vieram do Instagram não
 * decide nada; saber que 3 delas reservaram, sim.
 */
export interface Origem {
  source?: string;
  medium?: string;
  campaign?: string;
}

/** Corta valor de UTM: campo livre numa URL pública, não confie no tamanho. */
function limpar(valor: string | null): string | undefined {
  const texto = valor?.trim();
  return texto ? texto.slice(0, 60) : undefined;
}

/** Onde a origem fica guardada enquanto a aba estiver aberta. */
const CHAVE_ORIGEM = "festae_origem";

let lembrada: Origem | null = null;

/**
 * Lê a origem uma vez e a mantém pela visita inteira.
 *
 * Precisa ser lida cedo porque o Expo Router reescreve a URL ao navegar e os
 * parâmetros somem no primeiro passo. Só a memória do módulo não bastava:
 * recarregar a página, abrir um kit em outra aba ou voltar pelo histórico
 * derrubava tudo, e a reserva acabava marcada como "direto" — justamente a
 * jornada mais longa, que é a que fecha venda.
 *
 * `sessionStorage` é o armazenamento certo aqui: dura enquanto a aba viver e
 * morre quando ela fecha. Guardar por mais tempo (localStorage) creditaria ao
 * Instagram uma visita de duas semanas depois, que já não é mérito dele.
 */
export function origemDaVisita(): Origem {
  if (lembrada) return lembrada;

  const daUrl = lerDaUrl();

  // UTM no link sempre manda: é uma chegada nova, mesmo que a aba já tivesse
  // uma origem guardada de antes.
  if (daUrl.source && daUrl.source !== "direto") {
    lembrada = daUrl;
    guardar(daUrl);
    return lembrada;
  }

  const guardada = recuperar();
  lembrada = guardada ?? daUrl;
  if (!guardada) guardar(lembrada);
  return lembrada;
}

function guardar(origem: Origem) {
  if (Platform.OS !== "web") return;
  try {
    window.sessionStorage.setItem(CHAVE_ORIGEM, JSON.stringify(origem));
  } catch {
    // Navegador anônimo ou armazenamento bloqueado: a medição piora, a
    // jornada continua. Nunca vale quebrar a compra por causa de métrica.
  }
}

function recuperar(): Origem | null {
  if (Platform.OS !== "web") return null;
  try {
    const bruto = window.sessionStorage.getItem(CHAVE_ORIGEM);
    return bruto ? (JSON.parse(bruto) as Origem) : null;
  } catch {
    return null;
  }
}

/**
 * Esta aba já foi contada como visita?
 *
 * Recarregar a página não é uma visita nova. Sem esta marca, quem atualiza a
 * tela três vezes vira três visitas e a conversão aparece pior do que é.
 */
export function visitaJaContada(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    if (window.sessionStorage.getItem("festae_visita") === "1") return true;
    window.sessionStorage.setItem("festae_visita", "1");
    return false;
  } catch {
    return false;
  }
}

function lerDaUrl(): Origem {
  if (Platform.OS !== "web") return { source: "app", medium: "app" };

  try {
    const params = new URL(window.location.href).searchParams;
    const source = limpar(params.get("utm_source"));

    if (source) {
      return {
        source,
        medium: limpar(params.get("utm_medium")),
        campaign: limpar(params.get("utm_campaign")),
      };
    }

    // Sem UTM no link, o site que encaminhou é a melhor pista. O Instagram
    // abre links no navegador interno dele e muitas vezes não manda o
    // referrer — por isso o utm_source no link publicado é o que de fato
    // funciona, e isto aqui é só a rede de segurança.
    const referrer = document.referrer;
    if (!referrer) return { source: "direto" };

    const host = new URL(referrer).hostname.replace(/^www\./, "");
    if (host === window.location.hostname) return { source: "direto" };
    return { source: host.slice(0, 60), medium: "referral" };
  } catch {
    return {};
  }
}

/** A origem em formato de metadados, para anexar a um evento do funil. */
export function origemComoMetadata(): Record<string, string> {
  const origem = origemDaVisita();
  return {
    ...(origem.source ? { utmSource: origem.source } : {}),
    ...(origem.medium ? { utmMedium: origem.medium } : {}),
    ...(origem.campaign ? { utmCampaign: origem.campaign } : {}),
  };
}
