import { describe, expect, it } from "vitest";
import { RESERVATION_HOLD_MINUTES } from "@festae/shared";
import { prazoDoSinalVencido } from "./reserva-sem-sinal";

const agora = new Date("2026-11-02T15:00:00.000Z");
const minutosAtras = (m: number) => new Date(agora.getTime() - m * 60_000);
const reserva = (parcial: Partial<Parameters<typeof prazoDoSinalVencido>[0]> = {}) => ({
  status: "PENDING",
  requestedAt: minutosAtras(RESERVATION_HOLD_MINUTES + 1),
  temPagamentoConfirmado: false,
  temCreditoAplicado: false,
  ...parcial,
});

describe("reserva sem sinal com prazo vencido (critério da liberação automática)", () => {
  it("o prazo oficial é de 60 minutos", () => {
    expect(RESERVATION_HOLD_MINUTES).toBe(60);
  });

  it("pendente, sem pagamento e sem crédito, pedida há mais de 60 minutos: vencida", () => {
    expect(prazoDoSinalVencido(reserva(), agora)).toBe(true);
  });

  it("dentro do prazo não vence", () => {
    expect(prazoDoSinalVencido(reserva({ requestedAt: minutosAtras(RESERVATION_HOLD_MINUTES - 1) }), agora)).toBe(false);
    expect(prazoDoSinalVencido(reserva({ requestedAt: minutosAtras(RESERVATION_HOLD_MINUTES) }), agora)).toBe(false);
  });

  it("pagamento confirmado ou crédito aplicado garantem a data", () => {
    expect(prazoDoSinalVencido(reserva({ temPagamentoConfirmado: true }), agora)).toBe(false);
    expect(prazoDoSinalVencido(reserva({ temCreditoAplicado: true }), agora)).toBe(false);
  });

  it("nenhuma outra etapa é liberada", () => {
    for (const status of ["CONFIRMED", "PREPARING", "READY", "AGUARDANDO_DEVOLUCAO", "COMPLETED"]) {
      expect(prazoDoSinalVencido(reserva({ status }), agora)).toBe(false);
    }
  });
});
