import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowUpRight, Mic, RotateCcw, SendHorizontal, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { assistenteApi, SemConexao, type EstadoDoAssistente, type RespostaDoAssistente } from "./api";
import { MENSAGEM_DE_ERRO_DE_GRAVACAO, useGravador, type AudioGravado } from "./useGravador";
import { falar, pararDeFalar } from "./voz";

/**
 * Malu, a Assistente IA da Festaê — o canal do painel.
 *
 * O nome nunca aparece sozinho: botão, cabeçalho e leitura de tela dizem
 * também "Assistente IA", para ninguém confundir a Malu com uma pessoa.
 *
 * Esta tela só conversa com a API do assistente: não sabe de modelo, chave,
 * ferramenta nem regra financeira. Tudo isso mora no servidor, e o mesmo
 * núcleo atenderá o WhatsApp sem mudar uma linha daqui.
 */

type Mensagem = {
  id: string;
  autor: "VOCE" | "ASSISTENTE";
  texto: string;
  viaVoz?: boolean;
  resposta?: RespostaDoAssistente;
};

type Fase = "PRONTO" | "GRAVANDO" | "TRANSCREVENDO" | "CONSULTANDO";
type Erro = { texto: string; repetir?: () => void };

const NAVY = "#0F2A4F";
const CORAL = "#F06853";
const GOLD = "#C7A360";

let sequencia = 0;
const novoId = () => `m${++sequencia}`;

function mensagemDoErro(e: unknown): string {
  if (e instanceof SemConexao) return e.message;
  if (e instanceof ApiError) {
    if (e.status === 401) return "Sua sessão expirou. Entre de novo no painel.";
    return e.message;
  }
  return "Algo deu errado. Tente de novo.";
}

function relogio(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AssistenteFestae() {
  const { data: estado } = useQuery({ queryKey: ["assistente", "estado"], queryFn: assistenteApi.estado, staleTime: 5 * 60_000, retry: 1 });
  const [aberto, setAberto] = useState(false);

  if (!estado?.disponivel) return null;
  return (
    <>
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir a Malu, Assistente IA da Festaê"
          title="Malu · Assistente IA da Festaê"
          data-assistente-botao
          className="fixed right-4 z-[60] flex size-14 items-center justify-center gap-2 rounded-full text-white shadow-[0_8px_24px_rgba(15,42,79,0.28)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#F06853]/40 print:hidden lg:right-6 lg:h-12 lg:w-auto lg:px-5"
          style={{ background: NAVY, bottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <Sparkles className="size-5 shrink-0" style={{ color: GOLD }} aria-hidden />
          <span className="hidden items-center gap-1.5 lg:inline-flex" aria-hidden>
            <span className="text-sm font-semibold tracking-tight">Malu</span>
            <span className="rounded-full border px-1.5 py-px text-[10px] font-semibold tracking-[0.06em]" style={{ borderColor: "rgba(199,163,96,0.55)", color: GOLD }}>
              IA
            </span>
          </span>
        </button>
      )}
      {aberto && <Painel estado={estado} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function Painel({
  estado,
  aoFechar,
}: {
  estado: EstadoDoAssistente;
  aoFechar: () => void;
}) {
  const [, navegar] = useLocation();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [conversaId, setConversaId] = useState<string | undefined>();
  const [texto, setTexto] = useState("");
  const [fase, setFase] = useState<Fase>("PRONTO");
  const [erro, setErro] = useState<Erro | null>(null);
  const [falando, setFalando] = useState<string | null>(null);
  const gravador = useGravador(estado.limites.segundosDeAudio);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const limite = estado.limites.caracteresPorMensagem;
  const ocupado = fase !== "PRONTO";

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens, fase, erro]);

  useEffect(() => {
    // No celular o teclado cobriria a conversa: o foco só vai sozinho no computador.
    if (window.matchMedia("(min-width: 1024px)").matches) campo.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", esc);
      pararDeFalar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fechar() {
    gravador.cancelar();
    pararDeFalar();
    aoFechar();
  }

  function receber(resposta: RespostaDoAssistente) {
    setConversaId(resposta.conversaId);
    setMensagens((m) => [...m, { id: novoId(), autor: "ASSISTENTE", texto: resposta.texto, resposta }]);
  }

  async function perguntar(pergunta: string) {
    const limpa = pergunta.trim();
    if (!limpa || ocupado) return;
    setErro(null);
    setTexto("");
    setMensagens((m) => [...m, { id: novoId(), autor: "VOCE", texto: limpa }]);
    setFase("CONSULTANDO");
    try {
      receber(await assistenteApi.perguntar(limpa, conversaId));
    } catch (e) {
      setErro({ texto: mensagemDoErro(e), repetir: e instanceof SemConexao ? () => repetirTexto(limpa) : undefined });
    } finally {
      setFase("PRONTO");
    }
  }

  function repetirTexto(pergunta: string) {
    // A pergunta já está na conversa: tira a última cópia e manda de novo.
    setMensagens((m) => (m.at(-1)?.autor === "VOCE" && m.at(-1)?.texto === pergunta ? m.slice(0, -1) : m));
    void perguntar(pergunta);
  }

  async function enviarAudio(audio: AudioGravado) {
    setErro(null);
    setFase("TRANSCREVENDO");
    const marcador = novoId();
    setMensagens((m) => [...m, { id: marcador, autor: "VOCE", texto: "…", viaVoz: true }]);
    try {
      const r = await assistenteApi.perguntarPorVoz(audio.blob, audio.segundos, conversaId);
      setMensagens((m) => m.map((x) => (x.id === marcador ? { ...x, texto: r.transcricao || "(áudio sem fala reconhecível)" } : x)));
      if (r.resposta) receber(r.resposta);
      else if (r.aviso) setErro({ texto: r.aviso });
    } catch (e) {
      setMensagens((m) => m.filter((x) => x.id !== marcador));
      setErro({ texto: mensagemDoErro(e), repetir: e instanceof SemConexao ? () => void enviarAudio(audio) : undefined });
    } finally {
      setFase("PRONTO");
    }
  }

  function tocarMicrofone() {
    if (gravador.gravando) return gravador.parar();
    if (ocupado) return;
    setErro(null);
    pararDeFalar();
    setFalando(null);
    setFase("GRAVANDO");
    void gravador.comecar((audio, motivo) => {
      if (audio) return void enviarAudio(audio);
      setFase("PRONTO");
      if (motivo) setErro({ texto: MENSAGEM_DE_ERRO_DE_GRAVACAO[motivo] });
    });
  }

  function ouvir(m: Mensagem) {
    if (falando === m.id) {
      pararDeFalar();
      setFalando(null);
      return;
    }
    setFalando(m.id);
    void falar(m.texto, estado.saidaDeVoz).then((r) => {
      setFalando((atual) => (atual === m.id ? null : atual));
      if (r === "SEM_VOZ") setErro({ texto: "Este aparelho não tem voz disponível para ler a resposta." });
    });
  }

  function novaConversa() {
    if (conversaId) void assistenteApi.encerrar(conversaId);
    pararDeFalar();
    setFalando(null);
    setConversaId(undefined);
    setMensagens([]);
    setErro(null);
  }

  function irPara(caminho: string) {
    navegar(caminho);
    if (!window.matchMedia("(min-width: 1024px)").matches) fechar();
  }

  function enviarFormulario(e: FormEvent) {
    e.preventDefault();
    void perguntar(texto);
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistente-titulo"
      aria-describedby="assistente-identificacao"
      data-assistente-painel
      className="fixed inset-0 z-[70] flex flex-col bg-[#FDF9F4] print:hidden lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[440px] lg:border-l lg:shadow-[-12px_0_32px_rgba(15,42,79,0.12)]"
      style={{ borderColor: "#E8DFD5" }}
    >
      <header className="flex items-start gap-3 px-4 pb-3 text-white lg:px-5" style={{ background: NAVY, paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(199,163,96,0.18)" }}>
          <Sparkles className="size-[18px]" style={{ color: GOLD }} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="assistente-titulo" className="text-[15px] font-semibold leading-tight tracking-tight">
            Malu
          </h2>
          <p id="assistente-identificacao" className="mt-0.5 text-xs font-medium text-white/80">
            Assistente IA da Festaê
          </p>
          <p className="mt-0.5 text-[11px] text-white/60">Consulta os dados do painel. Não altera nada.</p>
          {estado.modo === "SIMULADO" && (
            <span
              className="mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ borderColor: GOLD, color: GOLD }}
              data-modo-demonstracao
            >
              Modo de demonstração
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={novaConversa}
          disabled={ocupado || mensagens.length === 0}
          aria-label="Nova conversa"
          title="Nova conversa"
          className="flex size-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 disabled:opacity-40"
        >
          <RotateCcw className="size-[18px]" />
        </button>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar a Malu"
          className="-mr-1 flex size-10 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5" aria-live="polite" data-assistente-conversa>
        {mensagens.length === 0 && (
          <div className="space-y-4" data-assistente-boas-vindas>
            <div>
              <p className="text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>
                Oi! Eu sou a Malu, sua assistente virtual da Festaê. Como posso ajudar você hoje?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5B6B80]">
                Sou uma inteligência artificial. Respondo com os números do sistema — festas, pagamentos, propostas e acervo — e mostro onde conferir. Pergunte por texto ou por voz.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {estado.exemplos.map((exemplo) => (
                <button
                  key={exemplo}
                  type="button"
                  onClick={() => void perguntar(exemplo)}
                  className="rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm transition-colors hover:border-[#C7A360] hover:bg-[#FFFCF7]"
                  style={{ borderColor: "#E8DFD5", color: NAVY }}
                >
                  {exemplo}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="space-y-3">
          {mensagens.map((m) =>
            m.autor === "VOCE" ? (
              <li key={m.id} className="flex justify-end" data-mensagem-voce>
                <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-relaxed text-white" style={{ background: NAVY }}>
                  {m.viaVoz && (
                    <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">
                      <Mic className="size-3" aria-hidden /> Transcrição
                    </span>
                  )}
                  <span className="sr-only">Você: </span>
                  <span className="whitespace-pre-wrap break-words">{m.texto}</span>
                </div>
              </li>
            ) : (
              <li key={m.id} className="flex justify-start" data-mensagem-assistente data-tipo={m.resposta?.tipo}>
                <div
                  className="max-w-[92%] rounded-2xl rounded-bl-md border bg-white px-3.5 py-3 text-sm leading-relaxed"
                  style={{
                    borderColor: m.resposta?.tipo === "RECUSA" ? "#E9C77F" : "#E8DFD5",
                    color: "#1F2F44",
                  }}
                >
                  <span className="sr-only">Malu: </span>
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  <div className="mt-2.5 flex items-end justify-between gap-2">
                  {(m.resposta?.fontes.length ?? 0) > 0 ? (
                    <div className="flex min-w-0 flex-wrap gap-1.5" data-fontes>
                      {m.resposta!.fontes.map((f) => (
                        <button
                          key={f.caminho}
                          type="button"
                          onClick={() => irPara(f.caminho)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors hover:bg-[#FDF3EF]"
                          style={{ borderColor: "#F3C2B8", color: "#B9452F" }}
                        >
                          {f.rotulo}
                          <ArrowUpRight className="size-3" aria-hidden />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span />
                  )}
                    <button
                      type="button"
                      onClick={() => ouvir(m)}
                      className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-[#5B6B80] transition-colors hover:bg-[#F4EFE8]"
                      aria-label={falando === m.id ? "Parar a leitura" : "Ouvir a resposta da Malu"}
                    >
                      {falando === m.id ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                      {falando === m.id ? "Parar" : "Ouvir"}
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
          {(fase === "CONSULTANDO" || fase === "TRANSCREVENDO") && (
            <li className="flex justify-start" data-processando>
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border bg-white px-3.5 py-3 text-sm text-[#5B6B80]" style={{ borderColor: "#E8DFD5" }}>
                <span className="flex gap-1" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
                      style={{ background: GOLD, animationDelay: `${i * 140}ms` }}
                    />
                  ))}
                </span>
                {fase === "TRANSCREVENDO" ? "Ouvindo o áudio…" : "Consultando os dados…"}
              </div>
            </li>
          )}
        </ol>

        {erro && (
          <div role="alert" className="mt-3 rounded-xl border px-3.5 py-3 text-sm" style={{ borderColor: "#F3C2B8", background: "#FDF3EF", color: "#8E2F1E" }} data-assistente-erro>
            <p>{erro.texto}</p>
            {erro.repetir && (
              <button type="button" onClick={erro.repetir} className="mt-2 inline-flex min-h-9 items-center rounded-lg px-3 text-xs font-semibold text-white" style={{ background: CORAL }}>
                Tentar de novo
              </button>
            )}
          </div>
        )}
        <div ref={fim} />
      </div>

      <footer className="border-t bg-white px-3 pt-3 lg:px-4" style={{ borderColor: "#E8DFD5", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        {gravador.gravando ? (
          <div className="flex items-center gap-3" data-gravando>
            <span className="relative flex size-3 shrink-0" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: CORAL }} />
              <span className="relative inline-flex size-3 rounded-full" style={{ background: CORAL }} />
            </span>
            <p className="min-w-0 flex-1 text-sm" style={{ color: NAVY }}>
              Gravando <span className="font-semibold tabular-nums">{relogio(gravador.segundos)}</span>
              <span className="text-[#8A97A8]"> / {relogio(estado.limites.segundosDeAudio)}</span>
            </p>
            <button type="button" onClick={gravador.cancelar} className="min-h-11 rounded-lg px-3 text-sm font-medium text-[#5B6B80] hover:bg-[#F4EFE8]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={tocarMicrofone}
              className="flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white"
              style={{ background: CORAL }}
              aria-label="Encerrar gravação e enviar"
            >
              <Square className="size-3.5 fill-current" aria-hidden /> Enviar
            </button>
          </div>
        ) : (
          <form onSubmit={enviarFormulario} className="flex items-end gap-2">
            <label htmlFor="assistente-pergunta" className="sr-only">
              Sua pergunta para a Malu
            </label>
            <textarea
              id="assistente-pergunta"
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, limite))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void perguntar(texto);
                }
              }}
              rows={1}
              placeholder="Pergunte à Malu"
              disabled={ocupado}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border bg-[#FDF9F4] px-3.5 py-2.5 text-base leading-snug outline-none transition-colors placeholder:text-[#9AA6B5] focus:border-[#C7A360] focus:bg-white disabled:opacity-60 lg:text-sm"
              style={{ borderColor: "#E8DFD5", color: NAVY }}
            />
            <button
              type="button"
              onClick={tocarMicrofone}
              disabled={ocupado}
              aria-label="Gravar pergunta por voz"
              title="Toque para gravar"
              data-microfone
              className="flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors hover:bg-[#FDF3EF] disabled:opacity-40"
              style={{ borderColor: "#F3C2B8", color: CORAL }}
            >
              <Mic className="size-5" />
            </button>
            <button
              type="submit"
              disabled={ocupado || !texto.trim()}
              aria-label="Enviar pergunta"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-35"
              style={{ background: NAVY }}
            >
              <SendHorizontal className="size-[18px]" />
            </button>
          </form>
        )}
        {!gravador.gravando && texto.length > limite - 80 && (
          <p className="mt-1 text-right text-[11px] tabular-nums text-[#8A97A8]">
            {texto.length}/{limite}
          </p>
        )}
      </footer>
    </section>
  );
}
