import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Gravação de uma pergunta: toque para começar, toque para encerrar.
 *
 * Nunca há escuta contínua: o microfone só abre no toque, fecha no fim da
 * gravação (as faixas são paradas, e o indicador de microfone do iPhone some)
 * e tem teto de duração. O áudio fica só na memória até ser enviado.
 *
 * iPhone/Safari grava em audio/mp4 (AAC); Chrome e Android, em audio/webm.
 * O formato é escolhido pelo que o navegador declara suportar.
 */

export type ErroDeGravacao = "SEM_SUPORTE" | "PERMISSAO_NEGADA" | "SEM_MICROFONE" | "MICROFONE_OCUPADO" | "MUITO_CURTA" | "FALHA";

export const MENSAGEM_DE_ERRO_DE_GRAVACAO: Record<ErroDeGravacao, string> = {
  SEM_SUPORTE: "Este navegador não permite gravar áudio aqui. Digite a pergunta.",
  PERMISSAO_NEGADA:
    "O microfone está bloqueado para o painel. No iPhone: Ajustes › Safari › Microfone (ou, no app instalado, Ajustes › Privacidade › Microfone). Depois toque no microfone de novo.",
  SEM_MICROFONE: "Nenhum microfone encontrado neste aparelho. Digite a pergunta.",
  MICROFONE_OCUPADO: "O microfone está em uso por outro app (ligação, gravador). Encerre e tente de novo.",
  MUITO_CURTA: "A gravação ficou curta demais. Toque no microfone, fale a pergunta e toque para encerrar.",
  FALHA: "Não consegui gravar. Tente de novo ou digite a pergunta.",
};

const FORMATOS = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

function formatoSuportado(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
}

export function gravacaoSuportada(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export type AudioGravado = { blob: Blob; segundos: number; mimeType: string };

export function useGravador(maxSegundos: number) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const inicio = useRef(0);
  const relogio = useRef<number | null>(null);
  const aoTerminar = useRef<((r: AudioGravado | null, erro?: ErroDeGravacao) => void) | null>(null);
  const descartar = useRef(false);

  const soltarMicrofone = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (relogio.current !== null) window.clearInterval(relogio.current);
    relogio.current = null;
  }, []);

  useEffect(() => () => soltarMicrofone(), [soltarMicrofone]);

  const parar = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  /** Começa a gravar. `terminar` recebe o áudio, ou nulo com o motivo. */
  const comecar = useCallback(
    async (terminar: (r: AudioGravado | null, erro?: ErroDeGravacao) => void) => {
      if (!gravacaoSuportada()) return terminar(null, "SEM_SUPORTE");
      let midia: MediaStream;
      try {
        midia = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        const nome = (e as DOMException)?.name;
        if (nome === "NotAllowedError" || nome === "SecurityError") return terminar(null, "PERMISSAO_NEGADA");
        if (nome === "NotFoundError" || nome === "OverconstrainedError") return terminar(null, "SEM_MICROFONE");
        if (nome === "NotReadableError" || nome === "AbortError") return terminar(null, "MICROFONE_OCUPADO");
        return terminar(null, "FALHA");
      }
      stream.current = midia;
      const formato = formatoSuportado();
      let r: MediaRecorder;
      try {
        r = formato ? new MediaRecorder(midia, { mimeType: formato }) : new MediaRecorder(midia);
      } catch {
        soltarMicrofone();
        return terminar(null, "SEM_SUPORTE");
      }
      recorder.current = r;
      pedacos.current = [];
      descartar.current = false;
      aoTerminar.current = terminar;
      r.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) pedacos.current.push(ev.data);
      };
      r.onstop = () => {
        const duracao = (Date.now() - inicio.current) / 1000;
        const tipo = r.mimeType || formato || "audio/webm";
        soltarMicrofone();
        setGravando(false);
        const fim = aoTerminar.current;
        aoTerminar.current = null;
        if (descartar.current) return fim?.(null);
        if (duracao < 0.6 || pedacos.current.length === 0) return fim?.(null, "MUITO_CURTA");
        fim?.({ blob: new Blob(pedacos.current, { type: tipo }), segundos: Math.round(duracao * 10) / 10, mimeType: tipo });
      };
      r.onerror = () => {
        descartar.current = true;
        soltarMicrofone();
        setGravando(false);
        aoTerminar.current?.(null, "FALHA");
        aoTerminar.current = null;
      };
      inicio.current = Date.now();
      setSegundos(0);
      // Pedaços de 1 s: o Safari às vezes só entrega dados no fim sem isso.
      r.start(1000);
      setGravando(true);
      relogio.current = window.setInterval(() => {
        const s = Math.floor((Date.now() - inicio.current) / 1000);
        setSegundos(s);
        if (s >= maxSegundos) parar();
      }, 250);
    },
    [maxSegundos, parar, soltarMicrofone],
  );

  const cancelar = useCallback(() => {
    descartar.current = true;
    parar();
  }, [parar]);

  return { gravando, segundos, comecar, parar, cancelar };
}
