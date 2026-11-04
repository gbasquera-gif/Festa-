import { z } from "zod";
import { formatarDataDaFesta } from "./data-da-festa";
import { MAXIMO_DE_OPCOES } from "./orcamento";

/**
 * A conferência de disponibilidade de uma proposta, explicada.
 *
 * A decisão de "cabe ou não cabe" é do servidor e é a mesma da reserva: o
 * que já está comprometido no dia, mais o pedido, não pode passar do acervo.
 * Este módulo é o vocabulário para mostrar essa decisão a quem monta a
 * proposta — que item, quanto falta, por quê e quem está segurando —, e para
 * as telas e o servidor falarem a mesma língua.
 *
 * Nada daqui vai para o link da cliente. A página pública só sabe se a opção
 * cabe ou não; números do acervo e reservas de outras clientes ficam no
 * painel.
 */

/** Por que um item não cabe na data. */
export const MOTIVOS_DA_FALTA = [
  /** O estoque cadastrado do item é zero: não há peça nenhuma para alugar. */
  "SEM_UNIDADES_NO_ACERVO",
  /** A opção pede mais unidades do que o acervo inteiro tem, mesmo sem outra festa. */
  "PEDIDO_MAIOR_QUE_O_ACERVO",
  /** Outras reservas da mesma data já usam as unidades. */
  "RESERVADO_EM_OUTRA_FESTA",
  /** Propostas aprovadas aguardando sinal, na mesma data, seguram as unidades. */
  "SEGURADO_POR_PROPOSTA_APROVADA",
  /** As duas coisas juntas. */
  "RESERVA_E_PROPOSTA",
  /**
   * Só faltaria por causa de reserva da loja sem sinal, com o prazo de
   * pagamento vencido, que ainda não foi liberada.
   */
  "RESERVA_SEM_SINAL_VENCIDA",
  /** O sistema não consegue apontar a causa. */
  "NAO_IDENTIFICADO",
] as const;
export type MotivoDaFalta = (typeof MOTIVOS_DA_FALTA)[number];

/**
 * Conflito real de estoque ou inconsistência.
 *
 * - OUTRA_FESTA: as peças estão comprometidas com outra festa — conflito real.
 * - ACERVO: o acervo não tem unidades suficientes para a opção — conflito real.
 * - CADASTRO: o estoque cadastrado é zero — pode ser falta de verdade ou
 *   cadastro incompleto; a operação confere.
 * - TECNICA: a falta vem de uma reserva que já deveria ter sido liberada.
 * - NAO_IDENTIFICADA: sem causa apontável.
 */
export const NATUREZAS_DA_FALTA = ["OUTRA_FESTA", "ACERVO", "CADASTRO", "TECNICA", "NAO_IDENTIFICADA"] as const;
export type NaturezaDaFalta = (typeof NATUREZAS_DA_FALTA)[number];

export const NATUREZA_DO_MOTIVO: Record<MotivoDaFalta, NaturezaDaFalta> = {
  SEM_UNIDADES_NO_ACERVO: "CADASTRO",
  PEDIDO_MAIOR_QUE_O_ACERVO: "ACERVO",
  RESERVADO_EM_OUTRA_FESTA: "OUTRA_FESTA",
  SEGURADO_POR_PROPOSTA_APROVADA: "OUTRA_FESTA",
  RESERVA_E_PROPOSTA: "OUTRA_FESTA",
  RESERVA_SEM_SINAL_VENCIDA: "TECNICA",
  NAO_IDENTIFICADO: "NAO_IDENTIFICADA",
};

export const MOTIVO_DA_FALTA_LABEL: Record<MotivoDaFalta, string> = {
  SEM_UNIDADES_NO_ACERVO: "sem unidades no acervo — o estoque cadastrado deste item é 0. Confira o cadastro.",
  PEDIDO_MAIOR_QUE_O_ACERVO: "a opção pede mais unidades do que o acervo tem, mesmo sem outra festa na data.",
  RESERVADO_EM_OUTRA_FESTA: "item comprometido em outra reserva na mesma data.",
  SEGURADO_POR_PROPOSTA_APROVADA: "item segurado por proposta aprovada, aguardando sinal, na mesma data.",
  RESERVA_E_PROPOSTA: "item comprometido em outra reserva e em proposta aprovada aguardando sinal, na mesma data.",
  RESERVA_SEM_SINAL_VENCIDA:
    "item preso por reserva da loja sem sinal, com o prazo de pagamento vencido, que ainda não foi liberada.",
  NAO_IDENTIFICADO: "motivo não identificado.",
};

export const NATUREZA_DA_FALTA_LABEL: Record<NaturezaDaFalta, string> = {
  OUTRA_FESTA: "conflito de estoque",
  ACERVO: "conflito de estoque",
  CADASTRO: "possível inconsistência de cadastro",
  TECNICA: "inconsistência técnica",
  NAO_IDENTIFICADA: "não identificado",
};

/** A etapa de uma reserva, como o aviso a nomeia. */
export const ETAPA_DA_RESERVA_NO_AVISO: Record<string, string> = {
  PENDING: "aguardando sinal",
  CONFIRMED: "confirmada",
  PREPARING: "em preparação",
  READY: "pronta para retirada/entrega",
  AGUARDANDO_DEVOLUCAO: "aguardando devolução",
  COMPLETED: "concluída",
};

/** Quem está segurando as unidades que faltaram. Só no painel. */
export interface ResponsavelPelaFalta {
  tipo: "RESERVA" | "PROPOSTA";
  /** Para o painel abrir o registro. */
  id: string;
  /** "FE-0042" ou "Proposta nº 12". */
  numero: string;
  /** A etapa da reserva, ou a opção que a proposta aprovada segura. */
  detalhe: string;
  /** Quantas unidades deste item ela segura na data. */
  quantidade: number;
  /** Reserva da loja sem sinal com o prazo vencido, ainda não liberada. */
  semSinalVencida: boolean;
}

/** Um item que não cabe na data, com tudo que a operação precisa para decidir. */
export interface FaltaDeItem {
  productId: string;
  nome: string;
  /** O identificador do item no catálogo (o mesmo do endereço da peça). */
  identificador: string | null;
  /** Quanto a opção pede, somando o kit e as linhas avulsas. */
  necessario: number;
  /** Quanto está livre na data: acervo menos o comprometido, nunca negativo. */
  disponivel: number;
  faltante: number;
  estoque: number;
  /** Comprometido na data por reservas e propostas aprovadas. */
  comprometido: number;
  motivo: MotivoDaFalta;
  natureza: NaturezaDaFalta;
  responsaveis: ResponsavelPelaFalta[];
  /** Quanto do pedido vem do kit da opção, e quanto de linhas avulsas. */
  noKit: number;
  avulso: number;
  /** O kit de onde a peça vem, quando vem de um. */
  kit: string | null;
}

export interface OpcaoConferida {
  /** Nulo na simulação do editor (opção ainda não gravada). */
  id: string | null;
  /** A chave da opção no editor, na simulação. */
  chave: string | null;
  /** Posição da opção, a partir de 1. */
  ordem: number;
  nome: string;
  disponivel: boolean;
  faltas: FaltaDeItem[];
}

/** O selo da lista de orçamentos. Reflete a situação de agora, não a do envio. */
export const SITUACOES_DO_SELO = ["DISPONIVEL", "COM_CONFLITO", "NAO_VERIFICADO"] as const;
export type SituacaoDoSelo = (typeof SITUACOES_DO_SELO)[number];

export const MOTIVOS_SEM_VERIFICACAO = ["SEM_DATA", "DATA_PASSADA", "VIROU_RESERVA", "ENCERRADA"] as const;
export type MotivoSemVerificacao = (typeof MOTIVOS_SEM_VERIFICACAO)[number];

export const MOTIVO_SEM_VERIFICACAO_LABEL: Record<MotivoSemVerificacao, string> = {
  SEM_DATA: "sem data",
  DATA_PASSADA: "data já passou",
  VIROU_RESERVA: "virou reserva",
  ENCERRADA: "proposta encerrada",
};

export interface SeloDeDisponibilidade {
  situacao: SituacaoDoSelo;
  /** Quantas opções foram conferidas, e quantas têm falta. */
  opcoes: number;
  comConflito: number;
  /** Por que não foi conferida. Só em NAO_VERIFICADO. */
  motivo: MotivoSemVerificacao | null;
}

/** O selo a partir das opções conferidas. */
export function seloDasOpcoes(opcoes: readonly { disponivel: boolean }[]): SeloDeDisponibilidade {
  const comConflito = opcoes.filter((o) => !o.disponivel).length;
  return {
    situacao: comConflito > 0 ? "COM_CONFLITO" : "DISPONIVEL",
    opcoes: opcoes.length,
    comConflito,
    motivo: null,
  };
}

export function seloSemVerificacao(motivo: MotivoSemVerificacao): SeloDeDisponibilidade {
  return { situacao: "NAO_VERIFICADO", opcoes: 0, comConflito: 0, motivo };
}

/** O texto curto do selo: "Disponível", "Com conflito · 1 de 3 opções", "Não verificado · sem data". */
export function textoDoSelo(selo: SeloDeDisponibilidade): string {
  if (selo.situacao === "DISPONIVEL") return "Disponível";
  if (selo.situacao === "COM_CONFLITO") {
    return selo.opcoes > 1 ? `Com conflito · ${selo.comConflito} de ${selo.opcoes} opções` : "Com conflito";
  }
  return `Não verificado · ${MOTIVO_SEM_VERIFICACAO_LABEL[selo.motivo ?? "SEM_DATA"]}`;
}

/** "1 unidade", "0 unidades", "3 unidades". */
export function unidades(n: number): string {
  return `${n} ${n === 1 ? "unidade" : "unidades"}`;
}

/** "Reserva FE-0042 (confirmada) — 1 unidade" ou "Proposta nº 12 (opção Premium) — 2 unidades". */
export function textoDoResponsavel(r: ResponsavelPelaFalta): string {
  const rotulo = r.tipo === "RESERVA" ? `Reserva ${r.numero}` : r.numero;
  const vencida = r.semSinalVencida ? ", prazo do sinal vencido" : "";
  return `${rotulo} (${r.detalhe}${vencida}) — ${unidades(r.quantidade)}`;
}

/**
 * A frase da recusa do envio, com todas as opções e todos os itens.
 *
 * Vai no corpo do erro e serve para quem não tem a tela do painel na frente
 * (notificação, registro, outra integração). A tela mostra o detalhe inteiro.
 */
export function mensagemDeEnvioBloqueado(data: string, opcoes: readonly OpcaoConferida[]): string {
  const comFalta = opcoes.filter((o) => o.faltas.length > 0);
  const partes = comFalta.map((o) => `${o.nome}: ${o.faltas.map((f) => f.nome).join(", ")}`);
  const quantas = comFalta.length === 1 ? "1 opção tem" : `${comFalta.length} opções têm`;
  return (
    `Este orçamento não pode ser enviado enquanto houver itens indisponíveis: ${quantas} ` +
    `falta de material para ${formatarDataDaFesta(`${data}T12:00:00.000Z`)} (${partes.join("; ")}).`
  );
}

/**
 * O pedido de simulação do editor: as opções como estão na tela, ainda não
 * gravadas. Só o que importa para o material — kit e peças de catálogo.
 */
export const simulacaoDeDisponibilidadeSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  /** A proposta sendo editada, para não conferir contra ela mesma. */
  orcamentoId: z.string().cuid().optional(),
  opcoes: z
    .array(
      z.object({
        chave: z.string().min(1).max(64),
        nome: z.string().max(80).default(""),
        kitId: z.string().cuid().optional().or(z.literal("")).or(z.null()),
        itens: z
          .array(
            z.object({
              productId: z.string().cuid().optional().or(z.literal("")).or(z.null()),
              quantidade: z.coerce.number().int().min(1).max(999),
            }),
          )
          .max(200),
      }),
    )
    .min(1)
    .max(MAXIMO_DE_OPCOES),
});
export type SimulacaoDeDisponibilidadeInput = z.infer<typeof simulacaoDeDisponibilidadeSchema>;
