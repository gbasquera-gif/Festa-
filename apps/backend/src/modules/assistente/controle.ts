import { randomUUID, createHash } from "node:crypto";
import { diaEmChapeco } from "@festae/shared";
import type { CanalDoAssistente, PapelAutorizado } from "./contrato";
import type { ConfiguracaoDoAssistente } from "./configuracao";
import { Pseudonimos } from "./pseudonimos";

/**
 * Limites de uso, conversas e métricas.
 *
 * Os limites e o teto de gasto valem entre instâncias da API: em produção
 * ficam no banco (`LimitesNoBanco`, em uso-no-banco.ts). Esta versão em
 * memória serve aos testes e ao desenvolvimento. Conversas e métricas
 * detalhadas continuam em memória: nada da conversa sobrevive a um reinício.
 */

const HORA = 3_600_000;

// ---------------------------------------------------------------- limites

export type Recusa = { motivo: string; tentarEmSegundos: number };

export type TotaisDeUso = {
  /** Onde os contadores vivem: BANCO vale para todas as instâncias. */
  onde: "BANCO" | "MEMORIA";
  dia: string;
  perguntasNoDia: number;
  gastoNoDiaUsd: number;
  mes: string;
  gastoNoMesUsd: number;
  tetoDoDiaUsd: number;
  tetoDoMesUsd: number;
};

/** O que o núcleo precisa para limitar uso e gasto, venha de onde vier. */
export interface ControleDeUso {
  readonly onde: TotaisDeUso["onde"];
  /** Reserva uma pergunta. Devolve a recusa, ou nula quando pode seguir. */
  reservarPergunta(usuarioId: string, agora?: Date): Promise<Recusa | null>;
  liberar(usuarioId: string): void;
  reservarFala(usuarioId: string, agora?: Date): Promise<Recusa | null>;
  /** Só o teto de gasto — antes de transcrever, que não conta como pergunta. */
  conferirGasto(agora?: Date): Promise<Recusa | null>;
  registrarGasto(usd: number, agora?: Date): Promise<void>;
  totais(agora?: Date): Promise<TotaisDeUso>;
}

export const RECUSA_EM_ANDAMENTO: Recusa = { motivo: "Ainda estou respondendo a sua pergunta anterior.", tentarEmSegundos: 5 };

/** O teto de gasto, igual para memória e banco. */
export function gastoExcedido(limites: ConfiguracaoDoAssistente["limites"], gastoNoDia: number, gastoNoMes: number): Recusa | null {
  if (gastoNoMes >= limites.gastoMaximoPorMesUsd) {
    return { motivo: "O assistente atingiu o teto de gasto deste mês. Peça à administração para revisar o limite.", tentarEmSegundos: 3600 };
  }
  if (gastoNoDia >= limites.gastoMaximoPorDiaUsd) {
    return { motivo: "O assistente atingiu o teto de gasto de hoje. Volta amanhã.", tentarEmSegundos: 3600 };
  }
  return null;
}

/** Os limites em memória do processo: testes e desenvolvimento. */
export class LimitesDeUso implements ControleDeUso {
  readonly onde = "MEMORIA" as const;
  private readonly perguntas = new Map<string, number[]>();
  private readonly falas = new Map<string, number[]>();
  private readonly emAndamento = new Set<string>();
  private totalDoDia = { dia: "", total: 0 };
  private gasto = { dia: "", noDia: 0, mes: "", noMes: 0 };

  constructor(private readonly limites: ConfiguracaoDoAssistente["limites"]) {}

  // Tudo síncrono por dentro: a trava "uma por vez" não pode ter espera no meio.
  async reservarPergunta(usuarioId: string, quando = new Date()): Promise<Recusa | null> {
    const agora = quando.getTime();
    if (this.emAndamento.has(usuarioId)) return RECUSA_EM_ANDAMENTO;
    const teto = this.tetoAgora(quando);
    if (teto) return teto;
    const dia = diaEmChapeco(quando);
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

  async reservarFala(usuarioId: string, quando = new Date()): Promise<Recusa | null> {
    const teto = this.tetoAgora(quando);
    if (teto) return teto;
    const agora = quando.getTime();
    const lista = (this.falas.get(usuarioId) ?? []).filter((t) => agora - t < HORA);
    if (lista.length >= this.limites.falasPorHora) {
      return { motivo: "Limite de respostas faladas por hora atingido.", tentarEmSegundos: Math.ceil((lista[0] + HORA - agora) / 1000) };
    }
    lista.push(agora);
    this.falas.set(usuarioId, lista);
    return null;
  }

  async conferirGasto(quando = new Date()): Promise<Recusa | null> {
    return this.tetoAgora(quando);
  }

  private tetoAgora(quando: Date): Recusa | null {
    this.virarGasto(quando);
    return gastoExcedido(this.limites, this.gasto.noDia, this.gasto.noMes);
  }

  async registrarGasto(usd: number, quando = new Date()) {
    if (!(usd > 0)) return;
    this.virarGasto(quando);
    this.gasto.noDia += usd;
    this.gasto.noMes += usd;
  }

  async totais(quando = new Date()): Promise<TotaisDeUso> {
    this.virarGasto(quando);
    const dia = diaEmChapeco(quando);
    return {
      onde: this.onde,
      dia,
      perguntasNoDia: this.totalDoDia.dia === dia ? this.totalDoDia.total : 0,
      gastoNoDiaUsd: arredondar(this.gasto.noDia),
      mes: dia.slice(0, 7),
      gastoNoMesUsd: arredondar(this.gasto.noMes),
      tetoDoDiaUsd: this.limites.gastoMaximoPorDiaUsd,
      tetoDoMesUsd: this.limites.gastoMaximoPorMesUsd,
    };
  }

  private virarGasto(quando: Date) {
    const dia = diaEmChapeco(quando);
    const mes = dia.slice(0, 7);
    if (this.gasto.mes !== mes) this.gasto = { dia, noDia: 0, mes, noMes: 0 };
    else if (this.gasto.dia !== dia) this.gasto = { ...this.gasto, dia, noDia: 0 };
  }
}

export function arredondar(usd: number): number {
  return Number(usd.toFixed(4));
}

// ---------------------------------------------------------------- conversas

export type ConsultaFeita = { nome: string; args: Record<string, unknown>; periodo?: { rotulo: string; de: string; ate: string } };
/** `resposta` é a do jeito que a IA a vê: com os códigos de fornecedor, não os nomes. */
export type Turno = { pergunta: string; resposta: string; consultas: ConsultaFeita[] };
/** Presa ao usuário E ao perfil: perfil trocado no meio do caminho abre outra conversa, sem o histórico nem os códigos do perfil anterior. */
export type Conversa = { id: string; usuarioId: string; papel?: PapelAutorizado; turnos: Turno[]; atualizadaEm: number; pseudonimos: Pseudonimos };

/**
 * O fio da conversa, para a pergunta seguinte entender "e quantas delas?".
 *
 * Vive 30 minutos sem uso e guarda só os últimos turnos. Está presa ao
 * usuário: o id de conversa de outra pessoa simplesmente abre uma nova.
 * Nunca vai para log.
 *
 * A varredura roda a cada minuto, e não só na pergunta seguinte: sem ela, a
 * conversa vencida ficaria na memória até alguém voltar a usar o assistente.
 * Assim o prazo que a Política de Privacidade declara (no máximo 31 minutos
 * depois da última pergunta) vale mesmo sem uso.
 */
export class ConversasEmMemoria {
  private readonly conversas = new Map<string, Conversa>();
  private static readonly MAXIMO = 500;

  constructor(private readonly limites: ConfiguracaoDoAssistente["limites"]) {
    setInterval(() => this.varrer(Date.now()), 60_000).unref();
  }

  abrir(usuarioId: string, conversaId: string | undefined, agora = Date.now(), papel?: PapelAutorizado): Conversa {
    this.varrer(agora);
    const existente = conversaId ? this.conversas.get(conversaId) : undefined;
    if (existente && existente.usuarioId === usuarioId && existente.papel === papel) return existente;
    const nova: Conversa = { id: randomUUID(), usuarioId, papel, turnos: [], atualizadaEm: agora, pseudonimos: new Pseudonimos() };
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
  /**
   * Conferência dos valores da resposta (perguntas com consultarDespesas):
   * CONFERIDA — todos os valores vieram das ferramentas;
   * SUBSTITUIDA — havia valor sem origem e a resposta virou o resumo do servidor;
   * BLOQUEADA — havia valor sem origem e não havia resumo: a resposta diz que não pôde conferir.
   */
  conferencia?: "CONFERIDA" | "SUBSTITUIDA" | "BLOQUEADA";
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

  /** Registra o evento e devolve o custo estimado, para o teto de gasto. */
  registrar(e: EventoDeUso, agora = new Date()): number {
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
        conferencia: e.conferencia,
      }),
    );
    return custo;
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
