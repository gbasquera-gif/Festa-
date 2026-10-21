import { fromCentsInt, normalizarDataDaFesta, toCentsInt, type CorrigirPagamentoInput } from "@festae/shared";

/**
 * A decisão de uma correção de pagamento, sem banco.
 *
 * Fica separada do serviço para ser testada sozinha: é aqui que mora a regra
 * do que pode ser corrigido e do que não pode. O serviço só a chama sob a
 * trava do pedido, com os números relidos dentro dela.
 *
 * O que NÃO se corrige à mão:
 *  - pagamento que não está recebido (PENDING, FAILED, ANULADO): não é
 *    dinheiro que entrou;
 *  - pagamento do Mercado Pago (tem referência externa): o provedor é a
 *    fonte da verdade, e o painel não pode discordar dele em silêncio;
 *  - pagamento de reserva cancelada: o pago já foi distribuído em crédito,
 *    reembolso e retenção no cancelamento, e mudar o pago depois quebraria
 *    essa conta;
 *  - pagamento que chegou depois do cancelamento: tem tratamento próprio.
 */
export type SituacaoParaCorrecao = {
  pagamento: {
    status: string;
    externalReference: string | null;
    aposCancelamento: boolean;
    valor: number;
    recebidoEm: Date | null;
  };
  reservaCancelada: boolean;
  /** Os outros pagamentos recebidos do pedido, sem este. */
  outrosRecebidosEmCentavos: number;
  creditoEmCentavos: number;
  totalEmCentavos: number;
  agora: Date;
};

export type DecisaoDeCorrecao =
  | { ok: false; erro: string }
  | {
      ok: true;
      acao: "CORRECAO" | "ANULACAO";
      dados: { amount?: number; paidAt?: Date; status?: "ANULADO" };
      antes: Record<string, unknown>;
      depois: Record<string, unknown>;
    };

export function decidirCorrecao(s: SituacaoParaCorrecao, input: CorrigirPagamentoInput): DecisaoDeCorrecao {
  const p = s.pagamento;
  if (p.status !== "PAID") return { ok: false, erro: "Só pagamento recebido pode ser corrigido." };
  if (p.externalReference) {
    return {
      ok: false,
      erro: "Este pagamento veio do Mercado Pago e não se corrige à mão. Se houve erro, trate com o provedor.",
    };
  }
  if (p.aposCancelamento) {
    return { ok: false, erro: "Pagamento recebido depois do cancelamento tem tratamento próprio e não se corrige aqui." };
  }
  if (s.reservaCancelada) {
    return {
      ok: false,
      erro: "Reserva cancelada: o pago já foi distribuído no cancelamento (crédito, reembolso, retenção). Corrigir agora desfaria essa conta.",
    };
  }

  const antes = { valor: p.valor, recebidoEm: p.recebidoEm?.toISOString() ?? null, status: p.status };

  if (input.acao === "ANULAR") {
    return { ok: true, acao: "ANULACAO", dados: { status: "ANULADO" }, antes, depois: { status: "ANULADO" } };
  }

  const dados: { amount?: number; paidAt?: Date } = {};
  const depois: Record<string, unknown> = {};

  if (input.novoValor !== undefined) {
    const novo = toCentsInt(input.novoValor);
    if (novo === toCentsInt(p.valor) && input.novaData === undefined) {
      return { ok: false, erro: "O valor informado é o mesmo do lançamento. Nada a corrigir." };
    }
    const cabe = s.totalEmCentavos - s.outrosRecebidosEmCentavos - s.creditoEmCentavos;
    if (novo > cabe) {
      return {
        ok: false,
        erro: `Com esse valor o pedido passaria do total: o máximo para este lançamento é ${fromCentsInt(Math.max(0, cabe)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      };
    }
    dados.amount = fromCentsInt(novo);
    depois.valor = dados.amount;
  }

  if (input.novaData !== undefined) {
    const data = normalizarDataDaFesta(input.novaData);
    if (data.getTime() > s.agora.getTime() + 86_400_000) {
      return { ok: false, erro: "A data do recebimento não pode estar no futuro." };
    }
    dados.paidAt = data;
    depois.recebidoEm = data.toISOString();
  }

  return { ok: true, acao: "CORRECAO", dados, antes, depois };
}
