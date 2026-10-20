/**
 * O contrato do Assistente IA Festaê com os canais.
 *
 * Canal → Interpretação IA → Ferramenta autorizada → Serviço Festaê → Resposta
 *
 * Todo canal — o painel hoje, o WhatsApp depois — chega ao núcleo pelo mesmo
 * `EntradaDoAssistente` e recebe o mesmo `RespostaDoAssistente`. O núcleo não
 * sabe o que é React, HTTP ou WhatsApp: recebe uma identidade já autenticada
 * pelo canal e uma mensagem em texto (digitada ou transcrita), e devolve
 * texto mais as fontes. Áudio é responsabilidade do canal: ele transcreve
 * antes de entrar e sintetiza depois de sair, se quiser.
 */

export const CANAIS_DO_ASSISTENTE = ["PAINEL_TEXTO", "PAINEL_VOZ", "WHATSAPP_TEXTO", "WHATSAPP_AUDIO"] as const;
export type CanalDoAssistente = (typeof CANAIS_DO_ASSISTENTE)[number];

/** Os canais que existem nesta fase. Os de WhatsApp estão reservados e são recusados. */
export const CANAIS_ATIVOS: readonly CanalDoAssistente[] = ["PAINEL_TEXTO", "PAINEL_VOZ"];

export type PapelAutorizado = "ADMIN" | "OPS";

/**
 * Quem pergunta, como o CANAL comprovou.
 *
 * No painel, é o JWT. No WhatsApp, será um vínculo próprio entre o número e
 * uma conta do painel, confirmado por código enviado ao painel e renovado
 * periodicamente — o número de telefone sozinho NÃO é identidade suficiente
 * para dados financeiros (número troca de dono, WhatsApp é clonável, aparelho
 * fica desbloqueado na mesa). O núcleo confia só no que vem aqui, e o papel é
 * relido do cadastro a cada pergunta, nunca aceito do canal.
 */
export type IdentidadeAutenticada = {
  usuarioId: string;
  papel: PapelAutorizado;
  /** Como o canal provou a identidade: auditoria, nunca autorização. */
  comprovadaPor: "JWT_PAINEL" | "VINCULO_WHATSAPP";
};

export type EntradaDoAssistente = {
  canal: CanalDoAssistente;
  identidade: IdentidadeAutenticada;
  /** Continuidade da conversa. Ausente: começa uma nova. */
  conversaId?: string;
  /** Texto da pergunta — digitado, ou a transcrição do áudio. */
  mensagem: string;
  origem: "DIGITADA" | "TRANSCRITA";
};

/** Onde conferir a resposta no painel. Sempre um caminho interno, nunca um link externo. */
export type FonteDaResposta = { rotulo: string; caminho: string };

export type RespostaDoAssistente = {
  conversaId: string;
  texto: string;
  fontes: FonteDaResposta[];
  /** As ferramentas consultadas, na ordem. Sem os dados — só para a tela e a auditoria. */
  ferramentas: string[];
  /**
   * RESPOSTA: respondeu com dados. LIMITACAO: a pergunta não é suportada ou
   * faltou informação. RECUSA: pedido de operação de escrita.
   */
  tipo: "RESPOSTA" | "LIMITACAO" | "RECUSA";
  /** Qual provedor respondeu: a tela avisa quando é o modo de demonstração. */
  modo: "OPENAI" | "SIMULADO";
};

/** A frase da recusa, igual em todo canal. */
export const MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA =
  "Posso consultar essa informação, mas ainda não estou autorizado a executar essa operação.";

/**
 * A frase da consulta fora do perfil, igual em todo canal. É limitação de
 * leitura, não recusa de operação: quem bloqueia o dado é o catálogo do papel.
 */
export const MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL = "Essa consulta não está disponível para o seu perfil de acesso.";

// ---------------------------------------------------------------- WhatsApp (futuro)

/**
 * O que um adaptador de canal precisa implementar. NENHUM adaptador de
 * WhatsApp existe nesta fase — o tipo está aqui para que, quando existir, ele
 * se encaixe no núcleo sem mudar a inteligência:
 *
 *   webhook → `traduzir` (valida assinatura, resolve o vínculo da identidade,
 *   baixa e transcreve o áudio) → `AssistenteService.responder` →
 *   `entregar` (texto e, se o canal quiser, áudio).
 */
export interface AdaptadorDeCanal<EventoDoCanal> {
  canal: CanalDoAssistente;
  /** Nula quando o evento não vem de uma identidade vinculada e confirmada: o núcleo nem é chamado. */
  traduzir(evento: EventoDoCanal): Promise<EntradaDoAssistente | null>;
  entregar(destino: EventoDoCanal, resposta: RespostaDoAssistente): Promise<void>;
}

// ---------------------------------------------------------------- operações (futuro)

/**
 * Como uma operação de escrita entrará, quando for autorizada. NADA disso é
 * oferecido à IA nesta fase: o catálogo só expõe ferramentas de leitura, e um
 * teste garante isso.
 *
 * O desenho futuro: a IA nunca executa. Ela monta uma `PropostaDeOperacao`
 * (prévia legível, com os valores que vai gravar), a pessoa confirma
 * explicitamente no canal, o servidor revalida permissão e estado no momento
 * da confirmação, executa pelo MESMO serviço da tela correspondente e grava
 * auditoria (quem, quando, canal, prévia aceita).
 */
export type PropostaDeOperacao = {
  operacao: string;
  resumo: string;
  parametros: Record<string, unknown>;
  expiraEm: string;
};
