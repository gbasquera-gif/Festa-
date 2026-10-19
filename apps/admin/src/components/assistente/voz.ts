import { assistenteApi } from "./api";

/**
 * Ouvir a resposta.
 *
 * Com a voz do servidor (OpenAI), o áudio vem pronto em mp3. Sem ela — modo
 * de demonstração, ou quando a escolha é economizar —, usa a voz do próprio
 * aparelho, que no iPhone fala português muito bem e não custa nada.
 *
 * iPhone só toca áudio que começou dentro de um toque. Por isso o
 * `AudioContext` é criado e retomado no próprio toque, antes de ir buscar o
 * mp3: depois de destravado, ele toca o que chegar.
 */

type Tocador = { contexto: AudioContext; fonte?: AudioBufferSourceNode };
let atual: Tocador | null = null;

export function pararDeFalar() {
  if (atual) {
    try {
      atual.fonte?.stop();
    } catch {
      /* já tinha parado */
    }
    atual.contexto.close().catch(() => undefined);
    atual = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function falarPeloAparelho(texto: string, aoTerminar: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  const voz = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().replace("_", "-").startsWith("pt-br"));
  if (voz) fala.voice = voz;
  fala.onend = aoTerminar;
  fala.onerror = aoTerminar;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(fala);
  return true;
}

function novoContexto(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

/**
 * Fala o texto. Chame DENTRO do handler do toque.
 * A promessa termina quando a fala acaba, é interrompida ou falha.
 */
export function falar(texto: string, origem: "OPENAI" | "NAVEGADOR"): Promise<"OK" | "SEM_VOZ"> {
  pararDeFalar();
  const limpo = texto.replace(/[•]/g, "").replace(/\s+/g, " ").trim();
  return new Promise((resolver) => {
    const fim = () => resolver("OK");
    const peloAparelho = () => {
      if (!falarPeloAparelho(limpo, fim)) resolver("SEM_VOZ");
    };
    if (origem === "NAVEGADOR") return peloAparelho();

    const contexto = novoContexto();
    if (!contexto) return peloAparelho();
    const tocador: Tocador = { contexto };
    atual = tocador;
    contexto.resume().catch(() => undefined);
    assistenteApi
      .falar(limpo)
      .then((blob) => blob.arrayBuffer())
      .then((bytes) => contexto.decodeAudioData(bytes))
      .then((buffer) => {
        if (atual !== tocador) return fim();
        const fonte = contexto.createBufferSource();
        fonte.buffer = buffer;
        fonte.connect(contexto.destination);
        fonte.onended = () => {
          if (atual === tocador) pararDeFalar();
          fim();
        };
        tocador.fonte = fonte;
        fonte.start();
      })
      .catch(() => {
        // Voz do servidor indisponível: cai para a do aparelho, sem erro na tela.
        if (atual === tocador) {
          contexto.close().catch(() => undefined);
          atual = null;
        }
        peloAparelho();
      });
  });
}
