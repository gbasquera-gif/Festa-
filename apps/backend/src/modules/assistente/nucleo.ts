import { diaEmChapeco } from "@festae/shared";
import {
  CANAIS_ATIVOS,
  MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA,
  type EntradaDoAssistente,
  type FonteDaResposta,
  type IdentidadeAutenticada,
  type RespostaDoAssistente,
} from "./contrato";
import type { ConfiguracaoDoAssistente } from "./configuracao";
import { ConversasEmMemoria, LimitesDeUso, MetricasDoAssistente, type ConsultaFeita, type Recusa } from "./controle";
import {
  areasForaDoPapel,
  esquemaDaFerramenta,
  ferramentasDoPapel,
  type ResultadoDaFerramenta,
  type ServicosDoAssistente,
} from "./ferramentas";
import { rotuloDoDia } from "./periodo";
import { FalhaDoProvedor, type MensagemDoModelo, type ProvedorDeIA, type UsoDoModelo } from "./provedor";
import { pareceOperacao, PREFIXO_DO_CONTEXTO } from "./provedor-simulado";

/** Erro que o canal transforma em resposta HTTP (ou mensagem, no WhatsApp). */
export class RecusaDoAssistente extends Error {
  constructor(
    public readonly codigo: "INVALIDA" | "LIMITE" | "INDISPONIVEL" | "CANAL_INATIVO",
    mensagem: string,
    public readonly tentarEmSegundos?: number,
  ) {
    super(mensagem);
  }
}

const AFIRMA_QUE_EXECUTOU =
  /\b(registrei|cadastrei|confirmei|converti|apliquei|atualizei|cancelei|exclui|excluí|apaguei|lancei|marquei|alterei|estornei|criei|feito!|pronto!)\b/i;

const MENSAGEM_DE_FALHA: Record<FalhaDoProvedor["tipo"], string> = {
  AUTENTICACAO: "O assistente está sem acesso ao serviço de IA. Avise a administração.",
  LIMITE_DO_PROVEDOR: "O serviço de IA está no limite de uso agora. Tente de novo em alguns minutos.",
  INDISPONIVEL: "Não consegui falar com o serviço de IA agora. Tente de novo em instantes.",
  RESPOSTA_INVALIDA: "O serviço de IA respondeu de um jeito inesperado. Tente de novo.",
  TEMPO_ESGOTADO: "O serviço de IA demorou demais para responder. Tente de novo.",
};

export const EXEMPLOS_ADMIN = [
  "Qual o faturamento de outubro?",
  "Quanto temos contratado para novembro?",
  "Quanto temos a receber?",
  "Quantas festas temos em novembro?",
  "Quais festas estão previstas para amanhã?",
  "Qual a conversão comercial deste mês?",
];
export const EXEMPLOS_OPS = [
  "Quais festas estão previstas para amanhã?",
  "Quantas reservas estão aguardando devolução?",
  "Temos alguma festa no dia 14/11?",
  "Quais reservas estão com saldo pendente?",
  "Quantas propostas estão em negociação?",
];

/**
 * O núcleo do Assistente IA Festaê.
 *
 * Classe comum, sem Nest nem React: o canal entrega uma
 * `EntradaDoAssistente` e recebe uma `RespostaDoAssistente`. Os testes a
 * montam com serviços e provedor de teste; o módulo Nest a monta com os
 * serviços reais.
 */
export class NucleoDoAssistente {
  readonly limites: LimitesDeUso;
  readonly conversas: ConversasEmMemoria;

  constructor(
    private readonly cfg: ConfiguracaoDoAssistente,
    private readonly provedor: ProvedorDeIA | null,
    private readonly servicos: ServicosDoAssistente,
    readonly metricas: MetricasDoAssistente,
    private readonly relogio: () => Date = () => new Date(),
  ) {
    this.limites = new LimitesDeUso(cfg.limites);
    this.conversas = new ConversasEmMemoria(cfg.limites);
  }

  get modo() {
    return this.cfg.modo;
  }

  estado(papel: IdentidadeAutenticada["papel"]) {
    return {
      disponivel: this.cfg.modo !== "DESLIGADO" && this.provedor !== null,
      modo: this.cfg.modo,
      saidaDeVoz: this.cfg.saidaDeVoz,
      exemplos: papel === "ADMIN" ? EXEMPLOS_ADMIN : EXEMPLOS_OPS,
      limites: { caracteresPorMensagem: this.cfg.limites.caracteresPorMensagem, segundosDeAudio: this.cfg.limites.segundosDeAudio },
    };
  }

  private exigirProvedor(): ProvedorDeIA {
    if (this.cfg.modo === "DESLIGADO" || !this.provedor) {
      throw new RecusaDoAssistente("INDISPONIVEL", "O Assistente IA ainda não está configurado neste ambiente.");
    }
    return this.provedor;
  }

  /** A pergunta, de qualquer canal. */
  async responder(entrada: EntradaDoAssistente): Promise<RespostaDoAssistente> {
    const inicio = Date.now();
    const { identidade } = entrada;
    if (!CANAIS_ATIVOS.includes(entrada.canal)) {
      throw new RecusaDoAssistente("CANAL_INATIVO", "Este canal ainda não está disponível para o assistente.");
    }
    const provedor = this.exigirProvedor();
    const mensagem = entrada.mensagem.trim();
    if (!mensagem) throw new RecusaDoAssistente("INVALIDA", "Escreva ou grave uma pergunta.");
    if (mensagem.length > this.cfg.limites.caracteresPorMensagem) {
      throw new RecusaDoAssistente("INVALIDA", `A pergunta pode ter até ${this.cfg.limites.caracteresPorMensagem} caracteres.`);
    }

    const recusa = this.limites.reservarPergunta(identidade.usuarioId);
    if (recusa) {
      this.registrarLimite("PERGUNTA", entrada, recusa, inicio);
      throw new RecusaDoAssistente("LIMITE", recusa.motivo, recusa.tentarEmSegundos);
    }

    const uso: UsoDoModelo = { entrada: 0, entradaEmCache: 0, saida: 0 };
    const ferramentasUsadas: string[] = [];
    let passos = 0;
    try {
      const conversa = this.conversas.abrir(identidade.usuarioId, entrada.conversaId);
      const agora = this.relogio();
      const permitidas = ferramentasDoPapel(identidade.papel);
      const esquemas = permitidas.map(esquemaDaFerramenta);
      const mensagens = this.montarMensagens(identidade, conversa.turnos, mensagem, agora);

      const fontes: FonteDaResposta[] = [];
      const consultas: ConsultaFeita[] = [];
      let tipo: RespostaDoAssistente["tipo"] = "RESPOSTA";
      let texto: string | null = null;
      const controle = new AbortController();
      const prazo = setTimeout(() => controle.abort(), this.cfg.limites.tempoPorPerguntaMs);

      try {
        while (passos < this.cfg.limites.passosPorPergunta) {
          passos += 1;
          const passo = await provedor.conversar(mensagens, esquemas, controle.signal);
          uso.entrada += passo.uso.entrada;
          uso.entradaEmCache += passo.uso.entradaEmCache;
          uso.saida += passo.uso.saida;

          if (passo.chamadas.length === 0) {
            texto = passo.texto?.trim() || null;
            break;
          }
          const chamadas = passo.chamadas.slice(0, this.cfg.limites.chamadasPorPasso);
          mensagens.push({ papel: "assistente", texto: passo.texto, chamadas });

          let recusou = false;
          for (const chamada of chamadas) {
            const resultado = await this.executar(chamada.nome, chamada.argumentos, identidade, agora);
            ferramentasUsadas.push(chamada.nome);
            if (resultado.tipo === "RECUSA") recusou = true;
            if (resultado.tipo === "LIMITACAO" && tipo === "RESPOSTA") tipo = "LIMITACAO";
            for (const f of resultado.fontes) if (!fontes.some((x) => x.caminho === f.caminho)) fontes.push(f);
            if (!resultado.tipo || resultado.tipo === "LIMITACAO") {
              consultas.push({ nome: chamada.nome, args: argsSeguros(chamada.argumentos), periodo: periodoDoResultado(resultado) });
            }
            mensagens.push({
              papel: "ferramenta",
              chamadaId: chamada.id,
              nome: chamada.nome,
              conteudo: JSON.stringify(resultado.dados).slice(0, this.cfg.limites.caracteresPorResultado),
            });
          }
          // Recusa de operação: a frase é sempre a mesma, sem gastar outra
          // volta no modelo e sem chance de ele "dar um jeito".
          if (recusou) {
            texto = MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA;
            tipo = "RECUSA";
            break;
          }
        }
      } finally {
        clearTimeout(prazo);
      }

      if (!texto) {
        texto = "Não consegui concluir essa consulta. Tente perguntar de outro jeito, com o período (ex.: \"em novembro\").";
        tipo = "LIMITACAO";
      }
      // Rede de segurança: o assistente nunca afirma ter executado operação.
      if (tipo !== "RECUSA" && pareceOperacao(mensagem) && AFIRMA_QUE_EXECUTOU.test(texto)) {
        texto = MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA;
        tipo = "RECUSA";
      }
      if (texto.includes(MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA)) tipo = "RECUSA";
      if (ferramentasUsadas.length === 0 && tipo === "RESPOSTA") tipo = "LIMITACAO";

      this.conversas.registrar(conversa, { pergunta: mensagem, resposta: texto, consultas });
      this.metricas.registrar({
        tipo: "PERGUNTA",
        canal: entrada.canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: tipo,
        ferramentas: ferramentasUsadas,
        passos,
        tokens: uso,
        latenciaMs: Date.now() - inicio,
      });
      return {
        conversaId: conversa.id,
        texto,
        fontes: fontes.slice(0, 6),
        ferramentas: ferramentasUsadas,
        tipo,
        modo: provedor.modo,
      };
    } catch (e) {
      const falha = e instanceof FalhaDoProvedor ? e.tipo : "INTERNA";
      this.metricas.registrar({
        tipo: "PERGUNTA",
        canal: entrada.canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: "FALHA",
        ferramentas: ferramentasUsadas,
        passos,
        tokens: uso,
        latenciaMs: Date.now() - inicio,
        falha,
      });
      if (e instanceof FalhaDoProvedor) throw new RecusaDoAssistente("INDISPONIVEL", MENSAGEM_DE_FALHA[e.tipo]);
      throw e;
    } finally {
      this.limites.liberar(identidade.usuarioId);
    }
  }

  /** Áudio → texto. O canal chama antes de `responder`. */
  async transcrever(
    identidade: IdentidadeAutenticada,
    canal: EntradaDoAssistente["canal"],
    audio: Buffer,
    mimeType: string,
    segundos: number,
  ): Promise<string> {
    const inicio = Date.now();
    const provedor = this.exigirProvedor();
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 30_000);
    try {
      const texto = await provedor.transcrever(audio, mimeType, controle.signal);
      this.metricas.registrar({
        tipo: "TRANSCRICAO",
        canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: texto ? "RESPOSTA" : "LIMITACAO",
        segundosDeAudio: segundos,
        latenciaMs: Date.now() - inicio,
      });
      return texto;
    } catch (e) {
      this.metricas.registrar({
        tipo: "TRANSCRICAO",
        canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: "FALHA",
        segundosDeAudio: segundos,
        latenciaMs: Date.now() - inicio,
        falha: e instanceof FalhaDoProvedor ? e.tipo : "INTERNA",
      });
      if (e instanceof FalhaDoProvedor) throw new RecusaDoAssistente("INDISPONIVEL", MENSAGEM_DE_FALHA[e.tipo]);
      throw e;
    } finally {
      clearTimeout(prazo);
    }
  }

  /** Texto → voz, quando a voz é do servidor. */
  async falar(identidade: IdentidadeAutenticada, texto: string): Promise<{ audio: Buffer; mimeType: string }> {
    const inicio = Date.now();
    const provedor = this.exigirProvedor();
    if (this.cfg.saidaDeVoz !== "OPENAI") {
      throw new RecusaDoAssistente("INDISPONIVEL", "A resposta falada usa a voz do aparelho neste ambiente.");
    }
    const limpo = texto.trim().slice(0, this.cfg.limites.caracteresParaFala);
    if (!limpo) throw new RecusaDoAssistente("INVALIDA", "Nada para falar.");
    const recusa = this.limites.reservarFala(identidade.usuarioId);
    if (recusa) throw new RecusaDoAssistente("LIMITE", recusa.motivo, recusa.tentarEmSegundos);
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 30_000);
    try {
      const audio = await provedor.falar(limpo, controle.signal);
      this.metricas.registrar({
        tipo: "FALA",
        canal: "PAINEL_VOZ",
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: "RESPOSTA",
        caracteresFalados: limpo.length,
        latenciaMs: Date.now() - inicio,
      });
      return audio;
    } catch (e) {
      this.metricas.registrar({
        tipo: "FALA",
        canal: "PAINEL_VOZ",
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: "FALHA",
        latenciaMs: Date.now() - inicio,
        falha: e instanceof FalhaDoProvedor ? e.tipo : "INTERNA",
      });
      if (e instanceof FalhaDoProvedor) throw new RecusaDoAssistente("INDISPONIVEL", MENSAGEM_DE_FALHA[e.tipo]);
      throw e;
    } finally {
      clearTimeout(prazo);
    }
  }

  // ---------------------------------------------------------------- internos

  /**
   * Executa uma chamada do modelo. Tudo que vem do modelo é tratado como
   * entrada não confiável: o nome precisa estar no catálogo DO PAPEL, e os
   * argumentos passam pela validação da ferramenta.
   */
  private async executar(nome: string, argumentos: string, identidade: IdentidadeAutenticada, agora: Date): Promise<ResultadoDaFerramenta> {
    const ferramenta = ferramentasDoPapel(identidade.papel).find((f) => f.nome === nome);
    if (!ferramenta) {
      return { tipo: "LIMITACAO", dados: { erro: "Consulta não disponível para este perfil de acesso." }, fontes: [] };
    }
    let bruto: unknown;
    try {
      bruto = argumentos ? JSON.parse(argumentos) : {};
    } catch {
      return { tipo: "LIMITACAO", dados: { erro: "Parâmetros ilegíveis." }, fontes: [] };
    }
    const validados = ferramenta.parametros.safeParse(bruto);
    if (!validados.success) {
      return { tipo: "LIMITACAO", dados: { erro: "Parâmetros inválidos para a consulta.", detalhes: validados.error.issues.map((i) => i.message).slice(0, 3) }, fontes: [] };
    }
    try {
      return await ferramenta.executar(validados.data, { papel: identidade.papel, agora, servicos: this.servicos });
    } catch {
      // O detalhe do erro interno não vai para a IA externa.
      return { tipo: "LIMITACAO", dados: { erro: "Não consegui ler esses dados agora." }, fontes: [] };
    }
  }

  private montarMensagens(
    identidade: IdentidadeAutenticada,
    turnos: { pergunta: string; resposta: string; consultas: ConsultaFeita[] }[],
    pergunta: string,
    agora: Date,
  ): MensagemDoModelo[] {
    const mensagens: MensagemDoModelo[] = [{ papel: "sistema", texto: instrucoes(identidade.papel, agora) }];
    const consultas = turnos.flatMap((t) => t.consultas).slice(-3);
    if (consultas.length) mensagens.push({ papel: "sistema", texto: `${PREFIXO_DO_CONTEXTO}${JSON.stringify(consultas)}` });
    for (const t of turnos) {
      mensagens.push({ papel: "usuario", texto: t.pergunta });
      mensagens.push({ papel: "assistente", texto: t.resposta });
    }
    mensagens.push({ papel: "usuario", texto: pergunta });
    return mensagens;
  }

  private registrarLimite(tipo: "PERGUNTA", entrada: EntradaDoAssistente, recusa: Recusa, inicio: number) {
    this.metricas.registrar({
      tipo,
      canal: entrada.canal,
      papel: entrada.identidade.papel,
      usuarioId: entrada.identidade.usuarioId,
      resultado: "LIMITE",
      latenciaMs: Date.now() - inicio,
      falha: recusa.motivo,
    });
  }
}

function argsSeguros(argumentos: string): Record<string, unknown> {
  try {
    const v = JSON.parse(argumentos);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function periodoDoResultado(r: ResultadoDaFerramenta): ConsultaFeita["periodo"] {
  const p = (r.dados as { periodo?: { rotulo?: string; de?: string; ate?: string } }).periodo;
  return p?.rotulo && p.de && p.ate ? { rotulo: p.rotulo, de: p.de, ate: p.ate } : undefined;
}

/** As instruções do modelo. Curtas: cada token aqui é pago em toda pergunta. */
export function instrucoes(papel: IdentidadeAutenticada["papel"], agora: Date): string {
  const hoje = diaEmChapeco(agora);
  const fora = areasForaDoPapel(papel);
  return [
    "Você é o Assistente IA Festaê, assistente de CONSULTA do painel de gestão da Festaê (locação de decoração de festas, Chapecó/SC).",
    `Hoje é ${rotuloDoDia(hoje)} (${hoje}), fuso America/Sao_Paulo. Perfil de quem pergunta: ${papel}.`,
    "Regras:",
    "1. Responda SOMENTE com dados devolvidos pelas ferramentas. Nunca invente números, nomes, datas ou registros. Se a ferramenta não trouxer o dado, diga que não há essa informação.",
    '2. No parâmetro "periodo", repasse a expressão que a pessoa usou ("novembro", "amanhã", "14/11", "mês passado", "este mês"); o servidor calcula as datas. Se a pergunta precisa de período e não tem, pergunte qual.',
    "3. Em continuações (\"e quantas delas…\", \"e desse mês…\"), mantenha o mesmo período e o mesmo conjunto da consulta anterior desta conversa.",
    '4. Sempre diga o período na resposta. Explique em uma frase o critério relevante que veio em "criterios". Se o período tiver "observacao", informe-a.',
    "5. Regras financeiras: faturamento é por competência (data da festa); caixa é pagamento confirmado (PAID) menos reembolso realizado; canceladas ficam fora do faturamento; retenção por cancelamento é separada; crédito Festaê não é desconto nem entrada de caixa; período futuro é CONTRATADO, não realizado; diga \"Resultado Operacional\", nunca \"lucro\" — se pedirem lucro, explique que o indicador é o Resultado Operacional e que não é lucro líquido; uma proposta com várias opções é uma proposta; aprovado considera só a opção aprovada.",
    "6. Pedidos para registrar, cadastrar, confirmar, converter, aplicar, cancelar, excluir, alterar ou atualizar qualquer coisa: chame solicitarOperacao. Nunca diga que executou algo.",
    fora.length
      ? `7. Fora do perfil ${papel}: ${fora.join("; ")}. Se perguntarem, diga que essa consulta não está disponível para o seu perfil de acesso.`
      : "7. O perfil tem acesso a todas as consultas do catálogo.",
    "8. Português do Brasil, objetivo, até 5 frases curtas. Use os valores exatamente como vieram (R$ já formatado). Sem tabelas; listas curtas com • só para poucas festas. Não cite links: a tela mostra as fontes.",
    "9. Se a pergunta for ambígua, diga o critério que usou ou pergunte. Se não houver ferramenta para a pergunta, diga claramente que ainda não é possível consultar isso.",
    "10. Não repita dados pessoais além do primeiro nome que a ferramenta trouxer.",
  ].join("\n");
}
