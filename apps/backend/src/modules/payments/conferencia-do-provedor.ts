import { toCentsInt } from "@festae/shared";

/** O pagamento como o Mercado Pago o devolve, só com o que a conferência usa. */
export type PagamentoNoProvedor = {
  /** Id do pagamento no Mercado Pago. */
  id: string;
  /** `external_reference`: o id da nossa cobrança, gravado na criação. */
  referencia: string | null;
  /** Status bruto (approved, pending, refunded, charged_back...). */
  status: string | null;
  /** `transaction_amount`, em reais. */
  valor: number | null;
  /** `transaction_amount_refunded`, em reais. */
  valorEstornado: number | null;
  /** `currency_id`. */
  moeda: string | null;
  /** `live_mode`: falso é pagamento de teste. */
  producao: boolean | null;
};

/** A nossa cobrança, só com o que a conferência usa. */
export type CobrancaParaConferir = {
  id: string;
  status: string;
  metodo: string;
  valor: number;
  /** Para Pix, o id do pagamento no Mercado Pago gravado na criação. */
  externalReference: string | null;
};

export type MotivoDoAlerta =
  /** O pagamento do provedor diz ser de outra cobrança. */
  | "REFERENCIA_DIVERGENTE"
  /** O Pix gravado na cobrança é outro. */
  | "ID_DIVERGENTE"
  | "VALOR_DIVERGENTE"
  | "MOEDA_DIVERGENTE"
  /** Pagamento de teste (`live_mode` falso) com a produção ligada. */
  | "PAGAMENTO_DE_TESTE"
  /** Estorno total ou parcial no provedor. */
  | "ESTORNO_NO_PROVEDOR"
  /** Contestação (chargeback) ou mediação aberta. */
  | "CONTESTACAO_NO_PROVEDOR"
  /** Recebido aqui, mas não aprovado lá (pendente, recusado, cancelado). */
  | "NAO_APROVADO_NO_PROVEDOR"
  /** Cobrança anulada aqui e aprovada lá. */
  | "COBRANCA_ANULADA";

export type DecisaoDoProvedor =
  | { acao: "LIQUIDAR" }
  /** Já registrado aqui, e aprovado lá no mesmo valor. */
  | { acao: "CONFERE" }
  | { acao: "RECUSAR" }
  | { acao: "NADA" }
  | { acao: "ALERTA"; motivo: MotivoDoAlerta };

/** O que cada alerta diz no log e na conciliação. Sem valores. */
export const TEXTO_DO_ALERTA: Record<MotivoDoAlerta, string> = {
  REFERENCIA_DIVERGENTE: "o pagamento no Mercado Pago aponta para outra cobrança",
  ID_DIVERGENTE: "o pagamento no Mercado Pago não é o Pix gerado para esta cobrança",
  VALOR_DIVERGENTE: "o valor pago no Mercado Pago é diferente do valor da cobrança",
  MOEDA_DIVERGENTE: "o pagamento no Mercado Pago não está em reais",
  PAGAMENTO_DE_TESTE: "o pagamento no Mercado Pago é de teste",
  ESTORNO_NO_PROVEDOR: "o Mercado Pago informa estorno deste pagamento",
  CONTESTACAO_NO_PROVEDOR: "o Mercado Pago informa contestação ou mediação deste pagamento",
  NAO_APROVADO_NO_PROVEDOR: "consta recebido aqui, mas não está aprovado no Mercado Pago",
  COBRANCA_ANULADA: "a cobrança foi anulada aqui, mas consta aprovada no Mercado Pago",
};

type Situacao = "APROVADO" | "PENDENTE" | "RECUSADO" | "ESTORNADO" | "CONTESTADO";

function situacao(p: PagamentoNoProvedor): Situacao {
  switch (p.status) {
    case "approved":
      // Estorno parcial mantém "approved": o que entrou não é mais o valor.
      return (p.valorEstornado ?? 0) > 0 ? "ESTORNADO" : "APROVADO";
    case "refunded":
      return "ESTORNADO";
    case "charged_back":
    case "in_mediation":
      return "CONTESTADO";
    case "rejected":
    case "cancelled":
      return "RECUSADO";
    default:
      // pending, in_process, authorized (cartão não capturado) e o que vier
      // de novo: não é dinheiro recebido.
      return "PENDENTE";
  }
}

/**
 * O que fazer com a resposta do Mercado Pago para uma cobrança nossa.
 *
 * A consulta à API diz o status, mas o status sozinho não prova que o
 * pagamento é o desta cobrança e deste valor. Quem tem a credencial da conta
 * consegue criar um Pix de R$ 0,01 com a referência de qualquer cobrança; sem
 * esta conferência, ele quitava a festa inteira. Então só se liquida quando:
 *  - a referência é esta cobrança, e, no Pix, o id é o do Pix que geramos;
 *  - o valor é exatamente o cobrado, em reais, sem estorno;
 *  - em produção, o pagamento não é de teste.
 *
 * Divergência não muda nada: vira alerta para conferência humana. Estorno e
 * contestação de algo já recebido também só alertam — desfazer um recebimento
 * mexe no caixa de um mês que pode estar fechado, e o reembolso de um
 * cancelamento já tem registro próprio; estornar aqui contaria duas vezes.
 *
 * Função pura e exportada: é decisão sobre dinheiro e merece teste próprio.
 */
export function decidirPeloProvedor(
  cobranca: CobrancaParaConferir,
  noProvedor: PagamentoNoProvedor,
  ambiente: { producao: boolean },
): DecisaoDoProvedor {
  if (noProvedor.referencia !== cobranca.id) return { acao: "ALERTA", motivo: "REFERENCIA_DIVERGENTE" };
  if (cobranca.metodo === "PIX" && noProvedor.id !== cobranca.externalReference) {
    return { acao: "ALERTA", motivo: "ID_DIVERGENTE" };
  }

  const s = situacao(noProvedor);

  if (cobranca.status === "PAID") {
    // Já registrado: confere de novo, com o mesmo rigor de quem registra. Um
    // recebimento gravado antes desta conferência existir (ou por engano)
    // aparece aqui como alerta, e nunca é desfeito sozinho.
    if (s === "ESTORNADO") return { acao: "ALERTA", motivo: "ESTORNO_NO_PROVEDOR" };
    if (s === "CONTESTADO") return { acao: "ALERTA", motivo: "CONTESTACAO_NO_PROVEDOR" };
    if (s !== "APROVADO") return { acao: "ALERTA", motivo: "NAO_APROVADO_NO_PROVEDOR" };
    const divergencia = divergenciaDoAprovado(cobranca, noProvedor, ambiente);
    return divergencia ? { acao: "ALERTA", motivo: divergencia } : { acao: "CONFERE" };
  }
  if (cobranca.status === "ANULADO") {
    return s === "APROVADO" ? { acao: "ALERTA", motivo: "COBRANCA_ANULADA" } : { acao: "NADA" };
  }

  // PENDING ou FAILED (Pix pago depois de vencer continua sendo dinheiro que
  // entrou e precisa ser registrado).
  switch (s) {
    case "APROVADO": {
      const divergencia = divergenciaDoAprovado(cobranca, noProvedor, ambiente);
      return divergencia ? { acao: "ALERTA", motivo: divergencia } : { acao: "LIQUIDAR" };
    }
    case "CONTESTADO":
      return { acao: "ALERTA", motivo: "CONTESTACAO_NO_PROVEDOR" };
    case "ESTORNADO":
      // Entrou e saiu antes de registrarmos: não há recebimento a gravar.
      // Um estorno parcial, porém, deixou dinheiro: conferência humana.
      if (noProvedor.status === "approved") return { acao: "ALERTA", motivo: "ESTORNO_NO_PROVEDOR" };
      return cobranca.status === "PENDING" ? { acao: "RECUSAR" } : { acao: "NADA" };
    case "RECUSADO":
      return cobranca.status === "PENDING" ? { acao: "RECUSAR" } : { acao: "NADA" };
    default:
      return { acao: "NADA" };
  }
}

/** Valor, moeda e ambiente de um pagamento aprovado. */
function divergenciaDoAprovado(
  cobranca: CobrancaParaConferir,
  noProvedor: PagamentoNoProvedor,
  ambiente: { producao: boolean },
): MotivoDoAlerta | null {
  if (noProvedor.moeda !== "BRL") return "MOEDA_DIVERGENTE";
  if (noProvedor.valor === null || toCentsInt(noProvedor.valor) !== toCentsInt(cobranca.valor)) {
    return "VALOR_DIVERGENTE";
  }
  if (ambiente.producao && noProvedor.producao === false) return "PAGAMENTO_DE_TESTE";
  return null;
}

export type DecisaoConsolidada = {
  acao: "LIQUIDAR" | "RECUSAR" | "NADA";
  /** Já registrado e conferido em pelo menos um pagamento do provedor. */
  confere: boolean;
  alertas: MotivoDoAlerta[];
};

/**
 * Junta as decisões de todos os pagamentos do provedor de uma cobrança.
 *
 * No cartão, a mesma cobrança pode ter várias tentativas: uma aprovação
 * conferida basta para liquidar (ou para conferir o que já foi registrado),
 * e recusar só quando todas recusam. Tentativas recusadas ao lado de uma
 * aprovada não são alerta. Os demais alertas valem sempre, mesmo quando
 * outra tentativa liquida — uma cobrança em dobro tem de aparecer.
 */
export function consolidarDecisoes(decisoes: readonly DecisaoDoProvedor[]): DecisaoConsolidada {
  const liquidar = decisoes.some((d) => d.acao === "LIQUIDAR");
  const confere = decisoes.some((d) => d.acao === "CONFERE");
  const alertas = decisoes
    .flatMap((d) => (d.acao === "ALERTA" ? [d.motivo] : []))
    .filter((m) => !(m === "NAO_APROVADO_NO_PROVEDOR" && (liquidar || confere)));
  const acao = liquidar
    ? "LIQUIDAR"
    : decisoes.length > 0 && decisoes.every((d) => d.acao === "RECUSAR")
      ? "RECUSAR"
      : "NADA";
  return { acao, confere, alertas: [...new Set(alertas)] };
}
