/**
 * O provedor de IA, atrás de uma interface só.
 *
 * O núcleo do assistente conversa com `ProvedorDeIA` e não sabe se do outro
 * lado está a OpenAI ou o simulado de desenvolvimento. Trocar de modelo, de
 * fornecedor ou ligar um canal novo não toca no núcleo nem nas ferramentas.
 *
 * A chave da API mora só aqui, lida do ambiente do servidor. Ela nunca vai
 * para o navegador, para o log, nem para a mensagem de erro.
 */

export type ChamadaDeFerramenta = { id: string; nome: string; argumentos: string };

export type MensagemDoModelo =
  | { papel: "sistema"; texto: string }
  | { papel: "usuario"; texto: string }
  | { papel: "assistente"; texto: string | null; chamadas?: ChamadaDeFerramenta[] }
  | { papel: "ferramenta"; chamadaId: string; nome: string; conteudo: string };

export type EsquemaDeFerramenta = { nome: string; descricao: string; parametros: Record<string, unknown> };

export type UsoDoModelo = { entrada: number; entradaEmCache: number; saida: number };

export type PassoDoModelo = { texto: string | null; chamadas: ChamadaDeFerramenta[]; uso: UsoDoModelo };

export interface ProvedorDeIA {
  readonly modo: "OPENAI" | "SIMULADO";
  conversar(mensagens: MensagemDoModelo[], ferramentas: EsquemaDeFerramenta[], sinal: AbortSignal): Promise<PassoDoModelo>;
  transcrever(audio: Buffer, mimeType: string, sinal: AbortSignal): Promise<string>;
  falar(texto: string, sinal: AbortSignal): Promise<{ audio: Buffer; mimeType: string }>;
}

/** Falha do provedor, já classificada e sem nada do conteúdo da conversa. */
export class FalhaDoProvedor extends Error {
  constructor(
    public readonly tipo: "AUTENTICACAO" | "LIMITE_DO_PROVEDOR" | "INDISPONIVEL" | "RESPOSTA_INVALIDA" | "TEMPO_ESGOTADO",
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export type ConfiguracaoOpenAI = {
  chave: string;
  urlBase: string;
  modeloDeTexto: string;
  modeloDeTranscricao: string;
  modeloDeVoz: string;
  voz: string;
  maxTokensDeSaida: number;
  /** Só enviado se configurado: nem todo modelo aceita o parâmetro. */
  esforcoDeRaciocinio: string | null;
};

const EXTENSAO_DO_AUDIO: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** Mime sem parâmetros: "audio/webm;codecs=opus" → "audio/webm". */
export function mimeBase(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}

export function extensaoDoAudio(mimeType: string): string | null {
  return EXTENSAO_DO_AUDIO[mimeBase(mimeType)] ?? null;
}

/**
 * Vocabulário que ajuda a transcrição a acertar os termos da casa. Nada de
 * nome de cliente: isto vai em toda transcrição.
 */
const VOCABULARIO =
  "Festaê, festa, reserva, orçamento, proposta, faturamento, competência, sinal, saldo, a receber, acervo, devolução, crédito Festaê, Resultado Operacional, custeio.";

export class ProvedorOpenAI implements ProvedorDeIA {
  readonly modo = "OPENAI" as const;

  constructor(private readonly cfg: ConfiguracaoOpenAI) {}

  async conversar(mensagens: MensagemDoModelo[], ferramentas: EsquemaDeFerramenta[], sinal: AbortSignal): Promise<PassoDoModelo> {
    const corpo: Record<string, unknown> = {
      model: this.cfg.modeloDeTexto,
      messages: mensagens.map(paraOpenAI),
      tools: ferramentas.map((f) => ({
        type: "function",
        function: { name: f.nome, description: f.descricao, parameters: f.parametros },
      })),
      tool_choice: "auto",
      max_completion_tokens: this.cfg.maxTokensDeSaida,
      // Não pede à OpenAI que guarde a conversa como "stored completion".
      // Explícito para não depender do padrão da API, que pode mudar.
      store: false,
    };
    if (this.cfg.esforcoDeRaciocinio) corpo.reasoning_effort = this.cfg.esforcoDeRaciocinio;

    const resposta = await this.post("/chat/completions", JSON.stringify(corpo), { "Content-Type": "application/json" }, sinal);
    const json = (await resposta.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const mensagem = json.choices?.[0]?.message;
    if (!mensagem) throw new FalhaDoProvedor("RESPOSTA_INVALIDA", "O serviço de IA respondeu sem mensagem.");
    return {
      texto: mensagem.content ?? null,
      chamadas: (mensagem.tool_calls ?? []).map((c) => ({
        id: c.id,
        nome: c.function?.name ?? "",
        argumentos: c.function?.arguments ?? "{}",
      })),
      uso: {
        entrada: json.usage?.prompt_tokens ?? 0,
        entradaEmCache: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        saida: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  async transcrever(audio: Buffer, mimeType: string, sinal: AbortSignal): Promise<string> {
    const extensao = extensaoDoAudio(mimeType) ?? "webm";
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeBase(mimeType) }), `pergunta.${extensao}`);
    form.append("model", this.cfg.modeloDeTranscricao);
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("prompt", VOCABULARIO);
    const resposta = await this.post("/audio/transcriptions", form, {}, sinal);
    const json = (await resposta.json()) as { text?: string };
    if (typeof json.text !== "string") throw new FalhaDoProvedor("RESPOSTA_INVALIDA", "A transcrição voltou vazia.");
    return json.text.trim();
  }

  async falar(texto: string, sinal: AbortSignal): Promise<{ audio: Buffer; mimeType: string }> {
    const corpo: Record<string, unknown> = {
      model: this.cfg.modeloDeVoz,
      voice: this.cfg.voz,
      input: texto,
      response_format: "mp3",
    };
    // Instruções de estilo só nos modelos de voz que as aceitam.
    if (this.cfg.modeloDeVoz.startsWith("gpt-")) {
      corpo.instructions = "Fale em português do Brasil, com tom cordial, claro e objetivo.";
    }
    const resposta = await this.post("/audio/speech", JSON.stringify(corpo), { "Content-Type": "application/json" }, sinal);
    return { audio: Buffer.from(await resposta.arrayBuffer()), mimeType: "audio/mpeg" };
  }

  private async post(caminho: string, corpo: BodyInit, cabecalhos: Record<string, string>, sinal: AbortSignal): Promise<Response> {
    let resposta: Response;
    try {
      resposta = await fetch(`${this.cfg.urlBase}${caminho}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.chave}`, ...cabecalhos },
        body: corpo,
        signal: sinal,
      });
    } catch (e) {
      if (sinal.aborted) throw new FalhaDoProvedor("TEMPO_ESGOTADO", "O serviço de IA demorou demais para responder.");
      throw new FalhaDoProvedor("INDISPONIVEL", "Não foi possível falar com o serviço de IA.");
    }
    if (resposta.ok) return resposta;
    // O corpo do erro não é lido: pode ecoar o conteúdo da pergunta.
    if (resposta.status === 401 || resposta.status === 403) {
      throw new FalhaDoProvedor("AUTENTICACAO", "A credencial do serviço de IA foi recusada.");
    }
    if (resposta.status === 429) throw new FalhaDoProvedor("LIMITE_DO_PROVEDOR", "O serviço de IA atingiu o limite de uso.");
    throw new FalhaDoProvedor("INDISPONIVEL", `O serviço de IA respondeu com erro ${resposta.status}.`);
  }
}

function paraOpenAI(m: MensagemDoModelo) {
  switch (m.papel) {
    case "sistema":
      return { role: "system", content: m.texto };
    case "usuario":
      return { role: "user", content: m.texto };
    case "assistente":
      return {
        role: "assistant",
        content: m.texto,
        ...(m.chamadas?.length
          ? {
              tool_calls: m.chamadas.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.nome, arguments: c.argumentos },
              })),
            }
          : {}),
      };
    case "ferramenta":
      return { role: "tool", tool_call_id: m.chamadaId, content: m.conteudo };
  }
}
