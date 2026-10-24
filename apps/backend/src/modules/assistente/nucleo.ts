import { diaEmChapeco } from "@festae/shared";
import {
  CANAIS_ATIVOS,
  MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL,
  MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA,
  type EntradaDoAssistente,
  type FonteDaResposta,
  type IdentidadeAutenticada,
  type RespostaDoAssistente,
} from "./contrato";
import type { ConfiguracaoDoAssistente } from "./configuracao";
import { conferirResposta } from "./conferencia";
import { ConversasEmMemoria, LimitesDeUso, MetricasDoAssistente, type ConsultaFeita, type ControleDeUso, type EventoDeUso, type Recusa } from "./controle";
import {
  areasForaDoPapel,
  esquemaDaFerramenta,
  type ComplementoDaResposta,
  ferramentasDoPapel,
  type ResultadoDaFerramenta,
  type ServicosDoAssistente,
} from "./ferramentas";
import { rotuloDoDia } from "./periodo";
import { FalhaDoProvedor, type MensagemDoModelo, type ProvedorDeIA, type UsoDoModelo } from "./provedor";
import { pareceOperacao, PREFIXO_DO_CONTEXTO } from "./provedor-simulado";
import type { Pseudonimos } from "./pseudonimos";
import { semContatoNemDocumento } from "./minimizacao";

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

/**
 * O que o modelo recebe quando chama solicitarOperacao numa mensagem que o
 * servidor não reconhece como pedido de escrita — tipicamente a consulta de
 * um dado fora do perfil. Uma consulta não vira recusa de operação; o dado
 * continua bloqueado porque a ferramenta dele nem está no catálogo do papel.
 */
const CONSULTA_NAO_E_OPERACAO = {
  naoEhPedidoDeOperacao: true,
  orientacao:
    `Esta mensagem é uma consulta, não um pedido de operação: não chame solicitarOperacao de novo. ` +
    `Responda com as ferramentas de consulta disponíveis. Se a consulta for de área fora do seu perfil, responda exatamente: "${MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL}" ` +
    `Se for mesmo um pedido para registrar ou alterar algo, responda exatamente: "${MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA}"`,
};

const MENSAGEM_DE_FALHA: Record<FalhaDoProvedor["tipo"], string> = {
  AUTENTICACAO: "O assistente está sem acesso ao serviço de IA. Avise a administração.",
  LIMITE_DO_PROVEDOR: "O serviço de IA está no limite de uso agora. Tente de novo em alguns minutos.",
  INDISPONIVEL: "Não consegui falar com o serviço de IA agora. Tente de novo em instantes.",
  RESPOSTA_INVALIDA: "O serviço de IA respondeu de um jeito inesperado. Tente de novo.",
  TEMPO_ESGOTADO: "O serviço de IA demorou demais para responder. Tente de novo.",
};

export const EXEMPLOS_ADMIN = [
  "Qual o faturamento de outubro?",
  "Quais foram os maiores fornecedores este mês?",
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
  readonly limites: ControleDeUso;
  readonly conversas: ConversasEmMemoria;

  constructor(
    private readonly cfg: ConfiguracaoDoAssistente,
    private readonly provedor: ProvedorDeIA | null,
    private readonly servicos: ServicosDoAssistente,
    readonly metricas: MetricasDoAssistente,
    private readonly relogio: () => Date = () => new Date(),
    /** Em produção, os contadores no banco (valem entre instâncias). */
    controle?: ControleDeUso,
  ) {
    this.limites = controle ?? new LimitesDeUso(cfg.limites);
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

    const recusa = await this.conferirLimite(() => this.limites.reservarPergunta(identidade.usuarioId, this.relogio()));
    if (recusa) {
      this.registrarLimite("PERGUNTA", entrada, recusa, inicio);
      throw new RecusaDoAssistente("LIMITE", recusa.motivo, recusa.tentarEmSegundos);
    }

    const uso: UsoDoModelo = { entrada: 0, entradaEmCache: 0, saida: 0 };
    const ferramentasUsadas: string[] = [];
    let passos = 0;
    try {
      const conversa = this.conversas.abrir(identidade.usuarioId, entrada.conversaId, Date.now(), identidade.papel);
      const agora = this.relogio();
      const permitidas = ferramentasDoPapel(identidade.papel);
      const esquemas = permitidas.map(esquemaDaFerramenta);
      const mensagens = this.montarMensagens(identidade, conversa.turnos, mensagem, agora);

      const fontes: FonteDaResposta[] = [];
      const consultas: ConsultaFeita[] = [];
      let tipo: RespostaDoAssistente["tipo"] = "RESPOSTA";
      let texto: string | null = null;
      let chamouOperacao = false;
      const complementos: ComplementoDaResposta[] = [];
      /** Todos os resultados do turno: os fatos contra os quais os valores da resposta são conferidos. */
      const resultadosDoTurno: ResultadoDoTurno[] = [];
      /** Os textos que o modelo mandou nos argumentos: o servidor pode repeti-los, e eles não viram fato. */
      const ecos: string[] = [];
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
            if (chamada.nome === "solicitarOperacao" && !pareceOperacao(mensagem)) {
              chamouOperacao = true;
              mensagens.push({ papel: "ferramenta", chamadaId: chamada.id, nome: chamada.nome, conteudo: JSON.stringify(CONSULTA_NAO_E_OPERACAO) });
              continue;
            }
            const resultado = await this.executar(chamada.nome, chamada.argumentos, identidade, agora, conversa.pseudonimos);
            ferramentasUsadas.push(chamada.nome);
            const args = argsSeguros(chamada.argumentos);
            for (const t of textosDe(args)) ecos.push(t, conversa.pseudonimos.revelar(t));
            // O que a pessoa (ou o modelo) usou como filtro de nome nesta consulta de despesas.
            const reais = (...valores: unknown[]) => textosDe(valores).map((t) => conversa.pseudonimos.revelar(t));
            resultadosDoTurno.push(
              chamada.nome === "consultarDespesas"
                ? {
                    nome: chamada.nome,
                    dados: resultado.dados,
                    termos: reais(args.fornecedor, args.fornecedoresConfirmados),
                    termosDeCategoria: reais(args.categoria, args.categoriasConfirmadas),
                  }
                : { nome: chamada.nome, dados: resultado.dados },
            );
            if (resultado.complemento) complementos.push(resultado.complemento);
            if (resultado.tipo === "RECUSA") recusou = true;
            if (resultado.tipo === "LIMITACAO" && tipo === "RESPOSTA") tipo = "LIMITACAO";
            for (const f of resultado.fontes) if (!fontes.some((x) => x.caminho === f.caminho)) fontes.push(f);
            if (!resultado.tipo || resultado.tipo === "LIMITACAO") {
              consultas.push({ nome: chamada.nome, args, periodo: periodoDoResultado(resultado) });
            }
            mensagens.push({
              papel: "ferramenta",
              chamadaId: chamada.id,
              nome: chamada.nome,
              conteudo: conteudoParaModelo(resultado.dados, this.cfg.limites.caracteresPorResultado),
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
      // Rede de segurança: o assistente nunca afirma ter executado operação —
      // nem quando o pedido escapou do detector e só o modelo o viu como operação.
      if (tipo !== "RECUSA" && (pareceOperacao(mensagem) || chamouOperacao) && AFIRMA_QUE_EXECUTOU.test(texto)) {
        texto = MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA;
        tipo = "RECUSA";
      }
      if (texto.includes(MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA)) tipo = "RECUSA";
      else if (texto.includes(MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL)) tipo = "LIMITACAO";
      if (ferramentasUsadas.length === 0 && tipo === "RESPOSTA") tipo = "LIMITACAO";
      if (tipo === "RESPOSTA") texto = completar(texto, complementos);
      // Rede de segurança das análises de despesa: cada valor da resposta
      // (dinheiro, percentual, quantidade de lançamentos, com a direção) tem
      // de ser igual a um fato devolvido pelas ferramentas DESTE turno — de
      // qualquer uma delas, e das frases que o próprio servidor acrescentou —,
      // e a resposta não pode afirmar alta onde a comparação deu queda (nem o
      // contrário), com ou sem número. Se algo não confere, a resposta vira a
      // que o servidor monta: os resumos das despesas, mais as frases do
      // modelo que trazem valores conferidos de outras ferramentas. Sem nada
      // conferível para mostrar, a resposta diz que não pôde conferir e não
      // traz número nenhum.
      // A recusa de operação também passa pela conferência quando o modelo pôs
      // mais alguma coisa junto da frase de recusa: um número de despesa ao
      // lado dela não escapa por isso. Só a recusa pura (a frase fixa) fica de fora.
      let conferencia: EventoDeUso["conferencia"];
      const recusaPura = texto.trim() === MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA;
      if (!recusaPura && resultadosDoTurno.some((r) => r.nome === "consultarDespesas")) {
        const conferida = conferirResposta(texto, resultadosDoTurno, { frasesDoServidor: complementos.map((c) => c.frase), ecos });
        if (conferida.confere) {
          conferencia = "CONFERIDA";
        } else {
          const doServidor = respostaDoServidor(resultadosDoTurno, conferida.preservadas);
          texto = tipo === "RECUSA" ? `${doServidor.texto}\n\n${MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA}` : doServidor.texto;
          conferencia = doServidor.mostraValores ? "SUBSTITUIDA" : "BLOQUEADA";
          if (tipo !== "RECUSA" && (!doServidor.mostraValores || doServidor.comFalha)) tipo = "LIMITACAO";
        }
      }

      // A IA vê os códigos de fornecedor; a pessoa vê os nomes. O histórico
      // guarda a versão da IA, para os nomes não irem para ela na pergunta seguinte.
      this.conversas.registrar(conversa, { pergunta: mensagem, resposta: texto, consultas });
      texto = conversa.pseudonimos.revelar(texto);
      const custo = this.metricas.registrar({
        tipo: "PERGUNTA",
        canal: entrada.canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: tipo,
        ferramentas: ferramentasUsadas,
        passos,
        tokens: uso,
        latenciaMs: Date.now() - inicio,
        conferencia,
      });
      await this.somarGasto(custo);
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
      const custo = this.metricas.registrar({
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
      await this.somarGasto(custo);
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
    const teto = await this.conferirLimite(() => this.limites.conferirGasto(this.relogio()));
    if (teto) throw new RecusaDoAssistente("LIMITE", teto.motivo, teto.tentarEmSegundos);
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 30_000);
    try {
      const texto = await provedor.transcrever(audio, mimeType, controle.signal);
      const custo = this.metricas.registrar({
        tipo: "TRANSCRICAO",
        canal,
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: texto ? "RESPOSTA" : "LIMITACAO",
        segundosDeAudio: segundos,
        latenciaMs: Date.now() - inicio,
      });
      await this.somarGasto(custo);
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
    const recusa = await this.conferirLimite(() => this.limites.reservarFala(identidade.usuarioId, this.relogio()));
    if (recusa) throw new RecusaDoAssistente("LIMITE", recusa.motivo, recusa.tentarEmSegundos);
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), 30_000);
    try {
      const audio = await provedor.falar(limpo, controle.signal);
      const custo = this.metricas.registrar({
        tipo: "FALA",
        canal: "PAINEL_VOZ",
        papel: identidade.papel,
        usuarioId: identidade.usuarioId,
        resultado: "RESPOSTA",
        caracteresFalados: limpo.length,
        latenciaMs: Date.now() - inicio,
      });
      await this.somarGasto(custo);
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

  /** Limites no banco fora do ar: recusa clara, sem passar sem conferir. */
  private async conferirLimite(conferir: () => Promise<Recusa | null>): Promise<Recusa | null> {
    try {
      return await conferir();
    } catch {
      throw new RecusaDoAssistente("INDISPONIVEL", "Não consegui conferir os limites de uso agora. Tente de novo em instantes.");
    }
  }

  /** Soma o gasto estimado no teto. Uma falha aqui não derruba a resposta já paga. */
  private async somarGasto(custo: number) {
    await this.limites.registrarGasto(custo, this.relogio()).catch(() => undefined);
  }

  /**
   * Executa uma chamada do modelo. Tudo que vem do modelo é tratado como
   * entrada não confiável: o nome precisa estar no catálogo DO PAPEL, e os
   * argumentos passam pela validação da ferramenta.
   */
  private async executar(
    nome: string,
    argumentos: string,
    identidade: IdentidadeAutenticada,
    agora: Date,
    pseudonimos: Pseudonimos,
  ): Promise<ResultadoDaFerramenta> {
    const ferramenta = ferramentasDoPapel(identidade.papel).find((f) => f.nome === nome);
    if (!ferramenta) {
      return { tipo: "LIMITACAO", dados: { erro: "Consulta não disponível para este perfil de acesso." }, fontes: [] };
    }
    let bruto: unknown;
    try {
      bruto = argumentos ? JSON.parse(argumentos) : {};
      // Os códigos de fornecedor que a IA devolve ("[F2]") voltam a ser nomes
      // antes da validação — só nos campos de fornecedor da ferramenta que os
      // usa. Em qualquer outro campo (período, categoria), um código continua
      // código: o servidor repete esses textos para a IA e o nome não pode ir junto.
      // E só o código do próprio tipo: [C1] (cliente) ou [S1] (sócio) no campo
      // de fornecedor continua código — não vira busca pelo nome da pessoa.
      if (nome === "consultarDespesas" && bruto && typeof bruto === "object") {
        const campos = bruto as Record<string, unknown>;
        const tipos: Record<string, ("F" | "K")[]> = { fornecedor: ["F"], fornecedoresConfirmados: ["F"], categoria: ["K"], categoriasConfirmadas: ["K"] };
        for (const [campo, aceitos] of Object.entries(tipos)) {
          if (campo in campos) campos[campo] = pseudonimos.revelarEmValores(campos[campo], aceitos);
        }
      }
    } catch {
      return { tipo: "LIMITACAO", dados: { erro: "Parâmetros ilegíveis." }, fontes: [] };
    }
    const validados = ferramenta.parametros.safeParse(bruto);
    if (!validados.success) {
      return { tipo: "LIMITACAO", dados: { erro: "Parâmetros inválidos para a consulta.", detalhes: validados.error.issues.map((i) => i.message).slice(0, 3) }, fontes: [] };
    }
    try {
      return await ferramenta.executar(validados.data, { papel: identidade.papel, agora, servicos: this.servicos, pseudonimos });
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
    // A pergunta vai como foi escrita, menos contato e documento (minimizacao.ts).
    for (const t of turnos) {
      mensagens.push({ papel: "usuario", texto: semContatoNemDocumento(t.pergunta) });
      mensagens.push({ papel: "assistente", texto: t.resposta });
    }
    mensagens.push({ papel: "usuario", texto: semContatoNemDocumento(pergunta) });
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

/**
 * Acrescenta as frases que o servidor montou com os números do ERP quando a
 * resposta citou o valor de referência e deixou de fora o detalhe dele.
 */
function completar(texto: string, complementos: readonly ComplementoDaResposta[]): string {
  const comparavel = (s: string) => s.replace(/\s+/g, " ");
  let saida = texto;
  for (const c of complementos) {
    const atual = comparavel(saida);
    if (atual.includes(comparavel(c.seCitar)) && !c.valores.every((v) => atual.includes(comparavel(v)))) saida = `${saida}\n${c.frase}`;
  }
  return saida;
}

type ResultadoDoTurno = { nome: string; dados: Record<string, unknown>; termos?: string[]; termosDeCategoria?: string[] };
type LancamentoDaLista = { dia: string; valor: string; fornecedor: string | null; situacao: string };

/**
 * A mesma conferência que roda em produção (`conferirResposta`), para
 * resultados que são todos de consultarDespesas.
 */
export function valoresConferem(texto: string, resultados: readonly Record<string, unknown>[]): boolean {
  return conferirResposta(
    texto,
    resultados.map((dados) => ({ nome: "consultarDespesas", dados })),
  ).confere;
}

/** Todos os textos de um valor (os argumentos de uma chamada), em qualquer profundidade. */
function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(textosDe);
  if (valor && typeof valor === "object") return Object.values(valor).flatMap(textosDe);
  return [];
}

const semPontoFinal = (t: string) => t.trim().replace(/[.]+$/, "");
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/**
 * A resposta que o servidor monta quando a do modelo não confere: as frases
 * conferidas de outras ferramentas e os resumos calculados aqui. O que não é
 * conferível fica de fora, e a resposta diz isso — melhor uma lacuna dita do
 * que um número sem origem.
 */
export function respostaDoServidor(
  resultados: readonly ResultadoDoTurno[],
  preservadas: readonly string[] = [],
): { texto: string; mostraValores: boolean; comFalha: boolean } {
  const resumos: string[] = [];
  const falhas: string[] = [];
  let outras = false;
  for (const r of resultados) {
    const { resumo, erro } = r.dados as { resumo?: unknown; erro?: unknown };
    if (r.nome === "consultarDespesas" && typeof resumo === "string" && resumo.trim()) {
      resumos.push(resumo.trim());
      // A lista pedida não some na troca: vai como o servidor a montou.
      const lista = (r.dados.resultado as { listaDeLancamentos?: LancamentoDaLista[] } | undefined)?.listaDeLancamentos;
      if (lista?.length) {
        resumos.push(`Lançamentos considerados, os mais recentes: ${lista.map((l) => `${l.dia} · ${l.valor}${l.fornecedor ? ` · ${l.fornecedor}` : ""} (${l.situacao})`).join("; ")}.`);
      }
    } else if (typeof erro === "string") falhas.push(minuscula(semPontoFinal(erro)));
    else outras = true;
  }
  const unicos = [...new Set(resumos)];
  if (!unicos.length && !preservadas.length) {
    return {
      texto:
        `Não consegui conferir os valores desta resposta${falhas.length ? ` (${falhas.join("; ")})` : ""}. ` +
        "Para não mostrar um número possivelmente errado, não trago valores agora. Tente perguntar de novo em instantes.",
      mostraValores: false,
      comFalha: falhas.length > 0,
    };
  }
  const avisos = [
    ...(falhas.length ? [`Parte da consulta não pôde ser feita (${falhas.join("; ")}).`] : []),
    ...(preservadas.length
      ? ["Retirei da resposta os trechos com valores que não conferem com o sistema; os valores acima são os calculados pelo servidor."]
      : outras
        ? ["Os valores das outras consultas desta pergunta não puderam ser conferidos e ficaram de fora: pergunte por eles separadamente."]
        : []),
  ];
  return {
    texto: [...(preservadas.length ? [preservadas.join(" ")] : []), ...unicos, ...avisos].join("\n\n"),
    mostraValores: true,
    comFalha: falhas.length > 0,
  };
}

/** O detalhe que sai primeiro quando o resultado não cabe no limite: listas, depois quebras. */
const DETALHES_DISPENSAVEIS: readonly (readonly string[])[] = [
  // A nota da amostra sai junto com a lista: não se fala de uma lista que o modelo não vê.
  ["listaDeLancamentos", "lista", "listaCortada"],
  ["grupos", "outros", "porNatureza", "nomesConsiderados", "maior", "menor", "tambemNaDescricao", "opcoes"],
];
const AVISO_DE_DETALHES_OMITIDOS =
  "Parte dos detalhes não coube no limite e foi omitida. Responda só com o que veio; se pedirem a lista ou o ranking, diga que precisa de um recorte menor.";

function semChaves(valor: unknown, chaves: ReadonlySet<string>): unknown {
  if (Array.isArray(valor)) return valor.map((v) => semChaves(v, chaves));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).filter(([k]) => !chaves.has(k)).map(([k, v]) => [k, semChaves(v, chaves)]));
  }
  return valor;
}

/**
 * O resultado como vai para o modelo: JSON inteiro e válido, nunca cortado no
 * meio. Se não couber no limite, tira o detalhe aos poucos (listas, depois
 * quebras); no fim, só o essencial — resumo, período, critérios.
 */
export function conteudoParaModelo(dados: Record<string, unknown>, limite: number): string {
  const inteiro = JSON.stringify(dados);
  if (inteiro.length <= limite) return inteiro;
  const removidas = new Set<string>();
  for (const grupo of DETALHES_DISPENSAVEIS) {
    for (const chave of grupo) removidas.add(chave);
    const reduzido = JSON.stringify({ ...(semChaves(dados, removidas) as object), detalhesOmitidos: AVISO_DE_DETALHES_OMITIDOS });
    if (reduzido.length <= limite) return reduzido;
  }
  for (const chaves of [
    ["resumo", "limitacao", "erro", "periodo", "criterios"],
    ["resumo", "limitacao", "erro"],
  ]) {
    const essencial = Object.fromEntries(chaves.filter((k) => k in dados).map((k) => [k, dados[k]]));
    const curto = JSON.stringify({ ...essencial, detalhesOmitidos: AVISO_DE_DETALHES_OMITIDOS });
    if (curto.length <= limite) return curto;
  }
  return JSON.stringify({ limitacao: "O resultado é grande demais para esta resposta. Peça um recorte menor (período, fornecedor ou categoria)." });
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

/** Só para quem tem consultarDespesas (ADMIN). */
const REGRAS_DAS_DESPESAS = [
  "11. Despesa com recorte — fornecedor, categoria, situação (pago, a pagar, vencido), média, maior/menor, ranking, comparação, ou períodos como \"últimos 3 meses\", \"este trimestre\", \"até agora\": use consultarDespesas com os filtros que a pessoa disse. Nunca responda uma pergunta com fornecedor ou categoria com um total geral.",
  "12. consultarDespesas: natureza só se a pessoa disser; situação: gastamos/pagamos = PAGO, a pagar = A_PAGAR, vencido = VENCIDO, registramos/lançamos = TODOS. \"precisaConfirmar\": mostre as opções e pergunte, sem somar; depois chame com os códigos escolhidos. \"semCorrespondencia\": diga que não há lançamentos e ofereça só o que vier nele. Diga o período considerado, os filtros, o critério e a quantidade de lançamentos (o campo lancamentos; listaDeLancamentos é só uma amostra). Se vier \"atencao\", diga-a.",
  "13. Continuação de consultarDespesas (\"e no mês passado?\", \"e quanto disso já foi pago?\" = situação TODOS, \"e em custeio?\"): repita a última chamada trocando só o que a pessoa mudou.",
  "14. Para consultar um fornecedor ou uma categoria que vieram como código, passe o código ([F2], [K1]) em fornecedor/fornecedoresConfirmados ou categoria/categoriasConfirmadas.",
  "15. Valores: copie exatamente como vieram, com centavos e sinal (R$ 1.234,56; +12,3%; \"a mais\"/\"a menos\"). Não arredonde, não some, não subtraia, não escreva \"cerca de\". Cada valor da resposta é conferido com o que as ferramentas devolveram; se algum não conferir, a resposta é trocada pelo resumo do servidor.",
];

/** As instruções do modelo. Curtas: cada token aqui é pago em toda pergunta. */
export function instrucoes(papel: IdentidadeAutenticada["papel"], agora: Date): string {
  const hoje = diaEmChapeco(agora);
  const fora = areasForaDoPapel(papel);
  return [
    "Você é a Malu, Assistente IA da Festaê. Atende CONSULTAS do painel de gestão da Festaê (locação de decoração de festas, Chapecó/SC).",
    `Hoje é ${rotuloDoDia(hoje)} (${hoje}), fuso America/Sao_Paulo. Perfil de quem pergunta: ${papel}.`,
    "Regras:",
    "1. Responda SOMENTE com dados devolvidos pelas ferramentas. Nunca invente números, nomes, datas ou registros. Se a ferramenta não trouxer o dado, diga que não há essa informação.",
    '2. No parâmetro "periodo", repasse a expressão que a pessoa usou ("novembro", "amanhã", "14/11", "mês passado", "este mês"); o servidor calcula as datas. Se a pergunta precisa de período e não tem, pergunte qual. "Mês que vem"/"próximo mês" é o mês-calendário seguinte inteiro (do dia 1 ao último dia), nunca os próximos 30 dias.',
    "3. Em continuações (\"e quantas delas…\", \"e desse mês…\"), mantenha o mesmo período e o mesmo conjunto da consulta anterior desta conversa.",
    '4. Sempre diga o período na resposta. Explique em uma frase o critério relevante que veio em "criterios". Se o período tiver "observacao", informe-a.',
    "5. Regras financeiras: faturamento é por competência (data da festa); caixa é pagamento confirmado (PAID) menos reembolso realizado; canceladas ficam fora do faturamento; retenção por cancelamento é separada; crédito Festaê não é desconto nem entrada de caixa; período futuro é CONTRATADO, não realizado; diga \"Resultado Operacional\", nunca \"lucro\" — se pedirem lucro, explique que o indicador é o Resultado Operacional e que não é lucro líquido; uma proposta com várias opções é uma proposta; aprovado considera só a opção aprovada. Mês em andamento: o faturamento por competência atribui ao mês as festas já realizadas E as ainda agendadas; quando vier \"divisaoDoMesEmAndamento\", diga as duas partes (agendadas = contratado, ainda não realizado). Nunca diga \"até agora\", \"já faturamos\" nem que todas as festas do mês já aconteceram.",
    "6. Pedidos para registrar, cadastrar, confirmar, converter, aplicar, cancelar, excluir, alterar ou atualizar qualquer coisa: chame solicitarOperacao. Perguntas de consulta nunca são pedido de operação, nem quando estão fora do perfil. Nunca diga que executou algo.",
    fora.length
      ? `7. Fora do perfil ${papel}: ${fora.join("; ")}. Se perguntarem algo dessas áreas, não chame ferramenta e responda exatamente: "${MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL}"`
      : "7. O perfil tem acesso a todas as consultas do catálogo.",
    "8. Português do Brasil, objetivo, até 5 frases curtas. Use os valores exatamente como vieram (R$ já formatado). Sem tabelas; listas curtas com • só para poucas festas. Não cite links: a tela mostra as fontes.",
    "9. Se a pergunta for ambígua, diga o critério que usou ou pergunte. Se não houver ferramenta para a pergunta, diga claramente que ainda não é possível consultar isso. Se a ferramenta devolver \"limitacao\", explique-a em uma frase e ofereça só o que vier em \"alternativasDisponiveis\"; nunca sugira outro formato de período ou de consulta.",
    "10. Clientes, sócios, fornecedores e categorias de despesa vêm como códigos entre colchetes ([C1], [S1], [F1], [K1]). Escreva o código exatamente assim, com os colchetes: a tela mostra o nome. Nunca troque o código por um nome nem tente adivinhá-lo. Não repita outros dados pessoais.",
    ...(papel === "ADMIN" ? REGRAS_DAS_DESPESAS : []),
  ].join("\n");
}
