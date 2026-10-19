/**
 * Configuração do Assistente IA, toda vinda do ambiente do servidor.
 *
 * Nenhum segredo tem valor padrão. Sem `OPENAI_API_KEY`, o assistente roda
 * no modo de demonstração em desenvolvimento e fica DESLIGADO em produção —
 * a não ser que `ASSISTENTE_IA_PROVEDOR=simulado` seja pedido explicitamente.
 *
 * Os preços são estimativas para a métrica de custo, não cobrança: conferir
 * na página de preços da OpenAI e ajustar aqui quando mudarem.
 */
export type ModoDoAssistente = "OPENAI" | "SIMULADO" | "DESLIGADO";

export type ConfiguracaoDoAssistente = {
  modo: ModoDoAssistente;
  openai: {
    chave: string;
    urlBase: string;
    modeloDeTexto: string;
    modeloDeTranscricao: string;
    modeloDeVoz: string;
    voz: string;
    maxTokensDeSaida: number;
    esforcoDeRaciocinio: string | null;
  };
  /** OPENAI: voz sintetizada pelo servidor. NAVEGADOR: a tela usa a voz do aparelho (sem custo). */
  saidaDeVoz: "OPENAI" | "NAVEGADOR";
  transcricaoSimulada: string;
  limites: {
    caracteresPorMensagem: number;
    perguntasPorHora: number;
    perguntasPorDia: number;
    perguntasPorDiaNoTotal: number;
    falasPorHora: number;
    bytesDeAudio: number;
    segundosDeAudio: number;
    passosPorPergunta: number;
    chamadasPorPasso: number;
    turnosNoContexto: number;
    caracteresPorResultado: number;
    caracteresParaFala: number;
    tempoPorPerguntaMs: number;
    minutosDeConversa: number;
  };
  /** US$ por 1M tokens e por minuto. Só para estimar custo nas métricas. */
  precos: {
    entradaPorMilhao: number;
    entradaEmCachePorMilhao: number;
    saidaPorMilhao: number;
    transcricaoPorMinuto: number;
    vozPorMinuto: number;
  };
};

function numero(env: NodeJS.ProcessEnv, nome: string, padrao: number): number {
  const valor = Number(env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : padrao;
}

export function lerConfiguracao(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDoAssistente {
  const chave = env.OPENAI_API_KEY?.trim() ?? "";
  const pedido = env.ASSISTENTE_IA_PROVEDOR?.trim().toLowerCase();
  const producao = env.NODE_ENV === "production";

  let modo: ModoDoAssistente;
  if (pedido === "desligado") modo = "DESLIGADO";
  else if (pedido === "simulado") modo = "SIMULADO";
  else if (pedido === "openai") modo = chave ? "OPENAI" : "DESLIGADO";
  else modo = chave ? "OPENAI" : producao ? "DESLIGADO" : "SIMULADO";

  const saidaPedida = env.ASSISTENTE_IA_SAIDA_DE_VOZ?.trim().toLowerCase();
  return {
    modo,
    openai: {
      chave,
      urlBase: (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
      modeloDeTexto: env.ASSISTENTE_IA_MODELO?.trim() || "gpt-5.4-mini",
      modeloDeTranscricao: env.ASSISTENTE_IA_MODELO_TRANSCRICAO?.trim() || "gpt-4o-mini-transcribe",
      modeloDeVoz: env.ASSISTENTE_IA_MODELO_VOZ?.trim() || "gpt-4o-mini-tts",
      voz: env.ASSISTENTE_IA_VOZ?.trim() || "coral",
      maxTokensDeSaida: numero(env, "ASSISTENTE_IA_MAX_TOKENS", 1200),
      esforcoDeRaciocinio: env.ASSISTENTE_IA_ESFORCO?.trim() || null,
    },
    saidaDeVoz: modo === "OPENAI" && saidaPedida !== "navegador" ? "OPENAI" : "NAVEGADOR",
    transcricaoSimulada: env.ASSISTENTE_IA_TRANSCRICAO_SIMULADA?.trim() || "Quantas festas temos em novembro?",
    limites: {
      caracteresPorMensagem: 500,
      perguntasPorHora: numero(env, "ASSISTENTE_IA_PERGUNTAS_POR_HORA", 30),
      perguntasPorDia: numero(env, "ASSISTENTE_IA_PERGUNTAS_POR_DIA", 150),
      perguntasPorDiaNoTotal: numero(env, "ASSISTENTE_IA_PERGUNTAS_POR_DIA_TOTAL", 1500),
      falasPorHora: numero(env, "ASSISTENTE_IA_FALAS_POR_HORA", 30),
      bytesDeAudio: 3 * 1024 * 1024,
      segundosDeAudio: 60,
      passosPorPergunta: 4,
      chamadasPorPasso: 3,
      turnosNoContexto: 6,
      caracteresPorResultado: 6000,
      caracteresParaFala: 1500,
      tempoPorPerguntaMs: numero(env, "ASSISTENTE_IA_TEMPO_LIMITE_MS", 45_000),
      minutosDeConversa: 30,
    },
    precos: {
      entradaPorMilhao: numero(env, "ASSISTENTE_IA_PRECO_ENTRADA", 0.75),
      entradaEmCachePorMilhao: numero(env, "ASSISTENTE_IA_PRECO_ENTRADA_CACHE", 0.075),
      saidaPorMilhao: numero(env, "ASSISTENTE_IA_PRECO_SAIDA", 4.5),
      transcricaoPorMinuto: numero(env, "ASSISTENTE_IA_PRECO_TRANSCRICAO_MINUTO", 0.003),
      vozPorMinuto: numero(env, "ASSISTENTE_IA_PRECO_VOZ_MINUTO", 0.015),
    },
  };
}
