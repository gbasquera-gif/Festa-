import { API_URL, ApiError, api, getToken } from "@/lib/api";

/** O que o servidor devolve, igual ao contrato `RespostaDoAssistente` do backend. */
export type RespostaDoAssistente = {
  conversaId: string;
  texto: string;
  fontes: { rotulo: string; caminho: string }[];
  ferramentas: string[];
  tipo: "RESPOSTA" | "LIMITACAO" | "RECUSA";
  modo: "OPENAI" | "SIMULADO";
};

export type EstadoDoAssistente = {
  disponivel: boolean;
  modo: "OPENAI" | "SIMULADO" | "DESLIGADO";
  saidaDeVoz: "OPENAI" | "NAVEGADOR";
  exemplos: string[];
  limites: { caracteresPorMensagem: number; segundosDeAudio: number };
};

/** Sem rede: o fetch nem chegou ao servidor. A tela oferece "tentar de novo". */
export class SemConexao extends Error {
  constructor() {
    super("Sem conexão com o servidor. Sua pergunta não foi enviada.");
  }
}

async function enviar(caminho: string, init: RequestInit): Promise<Response> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${caminho}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch {
    throw new SemConexao();
  }
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}));
    const interno = typeof corpo.message === "object" && corpo.message !== null ? corpo.message : corpo;
    throw new ApiError(typeof interno.message === "string" ? interno.message : `Erro ${res.status}`, res.status, interno);
  }
  return res;
}

export const assistenteApi = {
  estado: () => api<EstadoDoAssistente>("/assistente/estado"),

  async perguntar(mensagem: string, conversaId?: string): Promise<RespostaDoAssistente> {
    const res = await enviar("/assistente/mensagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem, ...(conversaId ? { conversaId } : {}) }),
    });
    return res.json();
  },

  /** Áudio gravado → transcrição e resposta, numa ida só. */
  async perguntarPorVoz(
    audio: Blob,
    segundos: number,
    conversaId?: string,
  ): Promise<{ transcricao: string; resposta: RespostaDoAssistente | null; aviso?: string }> {
    const form = new FormData();
    const extensao = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", audio, `pergunta.${extensao}`);
    form.append("segundos", String(segundos));
    if (conversaId) form.append("conversaId", conversaId);
    const res = await enviar("/assistente/audio", { method: "POST", body: form });
    return res.json();
  },

  async falar(texto: string): Promise<Blob> {
    const res = await enviar("/assistente/fala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    return res.blob();
  },

  async encerrar(conversaId: string) {
    await enviar(`/assistente/conversas/${conversaId}`, { method: "DELETE" }).catch(() => undefined);
  },
};
