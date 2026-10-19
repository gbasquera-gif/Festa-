import { randomUUID, createHash } from "node:crypto";
import { diaEmChapeco } from "@festae/shared";
import type { CanalDoAssistente, PapelAutorizado } from "./contrato";
import type { ConfiguracaoDoAssistente } from "./configuracao";

/**
 * Limites de uso, conversas e métricas — tudo em memória do processo.
 *
 * Em memória de propósito nesta fase: não há tabela nova (nenhuma migration),
 * e nada da conversa sobrevive a um reinício. A contrapartida está anotada:
 * com mais de uma instância da API, ou para um teto mensal que resista a
 * reinício, isto passa para o banco ou um cache compartilhado.
 */

const HORA = 3_600_000;

// ---------------------------------------------------------------- limites

export type Recusa = { motivo: string; tentarEmSegundos: number };

export class LimitesDeUso {
  private readonly perguntas = new Map<string, number[]>();
  private readonly falas = new Map<string, number[]>();
  private readonly emAndamento = new Set<string>();
  private totalDoDia = { dia: "", total: 0 };

  constructor(private readonly limites: ConfiguracaoDoAssistente["limites"]) {}

  /** Reserva uma pergunta. Devolve a recusa, ou nula quando pode seguir. */
  reservarPergunta(usuarioId: string, agora = Date.now()): Recusa | null {
    if (this.emAndamento.has(usuarioId)) {
      return { motivo: "Ainda estou respondendo a sua pergunta anterior.", tentarEmSegundos: 5 };
    }
    const dia = diaEmChapeco(new Date(agora));
    if (this.totalDoDia.dia !== dia) this.totalDoDia = { dia, total: 0 };
    if (this.totalDoDia.total >= this.limites.perguntasPorDiaNoTotal) {
      return { motivo: "O assistente atingiu o limite de perguntas de hoje para a Festaê. Volta amanhã.", tentarEmSegundos: 3600 };
    }
    const lista = (this.perguntas.get(usuarioId) ?? []).filter((t) => agora - t < 24 * HORA);
    const naHora = lista.filter((t) => agora - t < HORA);
    if (naHora.length >= this.limites.perguntasPorHora) {
      return { motivo: "Você atingiu o limite de perguntas por hora.", tentarEmSegundos: Math.ceil((naHora[0] + HORA - agora) / 1000) };
    }
    if (lista.length >= this.limites.perguntasPorDia) {
      return { motivo: "Você atingiu o limite de perguntas de hoje.", tentarEmSegundos: Math.ceil((lista[0] + 24 * HORA - agora) / 1000) };
    }
    lista.push(agora);
    this.perguntas.set(usuarioId, lista);
    this.totalDoDia.total += 1;
    this.emAndamento.add(usuarioId);
    return null;
  }

  liberar(usuarioId: string) {
    this.emAndamento.delete(usuarioId);
  }

  reservarFala(usuarioId: string, agora = Date.now()): Recusa | null {
    const lista = (this.falas.get(usuarioId) ?? []).filter((t) => agora - t < HORA);
    if (lista.length >= this.limites.falasPorHora) {
      return { motivo: "Limite de respostas faladas por hora atingido.", tentarEmSegundos: Math.ceil((lista[0] + HORA - agora) / 1000) };
    }
    lista.push(agora);
    this.falas.set(usuarioId, lista);
    return null;
  }
}

// ---------------------------------------------------------------- conversas

export type ConsultaFeita = { nome: string; args: Record<string, unknown>; periodo?: { rotulo: string; de: string; ate: string } };
export type Turno = { pergunta: string; resposta: string; consultas: ConsultaFeita[] };
export type Conversa = { id: string; usuarioId: string; turnos: Turno[]; atualizadaEm: number };

/**
 * O fio da conversa, para a pergunta seguinte entender "e quantas delas?".
 *
 * Vive 30 minutos sem uso e guarda só os últimos turnos. Está presa ao
 * usuário: o id de conversa de outra pessoa simplesmente abre uma nova.
 * Nunca vai para log.
 */
export class ConversasEmMemoria {
  private readonly conversas = new Map<string, Conversa>();
  private static readonly MAXIMO = 500;

  constructor(private readonly limites: ConfiguracaoDoAssistente["limites"]) {}

  abrir(usuarioId: string, conversaId: string | undefined, agora = Date.now()): Conversa {
    this.varrer(agora);
    const existente = conversaId ? this.conversas.get(conversaId) : undefined;
    if (existente && existente.usuarioId === usuarioId) return existente;
    const nova: Conversa = { id: randomUUID(), usuarioId, turnos: [], atualizadaEm: agora };
    this.conversas.set(nova.id, nova);
    return nova;
  }

  registrar(conversa: Conversa, turno: Turno, agora = Date.now()) {
    conversa.turnos.push(turno);
    if (conversa.turnos.length > this.limites.turnosNoContexto) conversa.turnos.splice(0, conversa.turnos.length - this.limites.turnosNoContexto);
    conversa.atualizadaEm = agora;
  }

  encerrar(usuarioId: string, conversaId: string) {
    const c = this.conversas.get(conversaId);
    if (c && c.usuarioId === usuarioId) this.conversas.delete(conversaId);
  }

  private varrer(agora: number) {
    const validade = this.limites.minutosDeConversa * 60_000;
    for (const [id, c] of this.conversas) if (agora - c.atualizadaEm > validade) this.conversas.delete(id);
    while (this.conversas.size >= ConversasEmMemoria.MAXIMO) {
      const maisAntiga = [...this.conversas.values()].sort((a, b) => a.atualizadaEm - b.atualizadaEm)[0];
      this.conversas.delete(maisAntiga.id);
    }
  }
}

// ---------------------------------------------------------------- métricas

export type EventoDeUso = {
  tipo: "PERGUNTA" | "TRANSCRICAO" | "FALA";
  canal: CanalDoAssistente;
  papel: PapelAutorizado;
  usuarioId: string;
  resultado: "RESPOSTA" | "LIMITACAO" | "RECUSA" | "LIMITE" | "FALHA";
  ferramentas?: string[];
  passos?: number;
  tokens?: { entrada: number; entradaEmCache: number; saida: number };
  segundosDeAudio?: number;
  caracteresFalados?: number;
  latenciaMs: number;
  falha?: string;
};

/**
 * Métricas técnicas, sem conteúdo.
 *
 * Nunca entram aqui a pergunta, a transcrição, a resposta, nomes ou valores.
 * O usuário vira um hash curto — dá para ver se uma pessoa está usando demais
 * sem expor quem é no log. O custo é estimado pela tabela de preços da
 * configuração.
 */
export class MetricasDoAssistente {
  private dia = "";
  private agregado = this.zerado();

  constructor(
    private readonly precos: ConfiguracaoDoAssistente["precos"],
    private readonly escrever: (linha: string) => void,
  ) {}

  custoEstimado(e: Pick<EventoDeUso, "tokens" | "segundosDeAudio" | "caracteresFalados">): number {
    const p = this.precos;
    const t = e.tokens ?? { entrada: 0, entradaEmCache: 0, saida: 0 };
    const texto =
      ((t.entrada - t.entradaEmCache) * p.entradaPorMilhao + t.entradaEmCache * p.entradaEmCachePorMilhao + t.saida * p.saidaPorMilhao) / 1_000_000;
    const transcricao = ((e.segundosDeAudio ?? 0) / 60) * p.transcricaoPorMinuto;
    // ~900 caracteres por minuto de fala em português.
    const voz = ((e.caracteresFalados ?? 0) / 900) * p.vozPorMinuto;
    return texto + transcricao + voz;
  }

  registrar(e: EventoDeUso, agora = new Date()) {
    const dia = diaEmChapeco(agora);
    if (dia !== this.dia) {
      this.dia = dia;
      this.agregado = this.zerado();
    }
    const custo = this.custoEstimado(e);
    const a = this.agregado;
    a.eventos[e.tipo] += 1;
    a.resultados[e.resultado] = (a.resultados[e.resultado] ?? 0) + 1;
    for (const f of e.ferramentas ?? []) a.ferramentas[f] = (a.ferramentas[f] ?? 0) + 1;
    a.tokensDeEntrada += e.tokens?.entrada ?? 0;
    a.tokensDeSaida += e.tokens?.saida ?? 0;
    a.segundosDeAudio += e.segundosDeAudio ?? 0;
    a.caracteresFalados += e.caracteresFalados ?? 0;
    a.custoEstimadoUsd += custo;
    a.latenciaTotalMs += e.latenciaMs;
    this.escrever(
      JSON.stringify({
        evento: "assistente_ia",
        tipo: e.tipo,
        canal: e.canal,
        papel: e.papel,
        usuario: hashCurto(e.usuarioId),
        resultado: e.resultado,
        ferramentas: e.ferramentas,
        passos: e.passos,
        tokens: e.tokens,
        segundosDeAudio: e.segundosDeAudio,
        caracteresFalados: e.caracteresFalados,
        custoEstimadoUsd: Number(custo.toFixed(6)),
        latenciaMs: e.latenciaMs,
        falha: e.falha,
      }),
    );
  }

  resumoDoDia() {
    const a = this.agregado;
    const total = a.eventos.PERGUNTA + a.eventos.TRANSCRICAO + a.eventos.FALA;
    return {
      dia: this.dia,
      ...a,
      custoEstimadoUsd: Number(a.custoEstimadoUsd.toFixed(4)),
      latenciaMediaMs: total ? Math.round(a.latenciaTotalMs / total) : null,
    };
  }

  private zerado() {
    return {
      eventos: { PERGUNTA: 0, TRANSCRICAO: 0, FALA: 0 },
      resultados: {} as Record<string, number>,
      ferramentas: {} as Record<string, number>,
      tokensDeEntrada: 0,
      tokensDeSaida: 0,
      segundosDeAudio: 0,
      caracteresFalados: 0,
      custoEstimadoUsd: 0,
      latenciaTotalMs: 0,
    };
  }
}

export function hashCurto(valor: string): string {
  return createHash("sha256").update(`festae-assistente:${valor}`).digest("hex").slice(0, 10);
}
