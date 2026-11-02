import { RESERVATION_HOLD_MINUTES } from "@festae/shared";

/**
 * A reserva da loja que segura material sem sinal, com o prazo vencido.
 *
 * É o mesmo critério da liberação automática (`releaseUnpaidHolds`, em
 * `availability.service.ts`): só reserva PENDING, pedida há mais de
 * RESERVATION_HOLD_MINUTES, sem pagamento confirmado e sem crédito Festaê
 * aplicado. Reserva confirmada, paga ou com crédito nunca entra aqui.
 *
 * Esta função só classifica — não libera nada. A liberação continua sendo a
 * rotina oficial, que cancela sob a trava do pedido. Aqui ela serve para a
 * conferência da proposta dizer "esta falta vem de uma reserva que já
 * deveria ter sido liberada", em vez de chamá-la de conflito real.
 *
 * Se o critério da rotina mudar, este muda junto: o teste de integração dos
 * orçamentos confere que os dois apontam as mesmas reservas.
 */
export interface SituacaoDoSinal {
  status: string;
  requestedAt: Date;
  /** Há pagamento confirmado no pedido. */
  temPagamentoConfirmado: boolean;
  /** Há crédito Festaê aplicado na reserva. */
  temCreditoAplicado: boolean;
}

export function prazoDoSinalVencido(r: SituacaoDoSinal, agora: Date): boolean {
  const limite = agora.getTime() - RESERVATION_HOLD_MINUTES * 60_000;
  return r.status === "PENDING" && r.requestedAt.getTime() < limite && !r.temPagamentoConfirmado && !r.temCreditoAplicado;
}
