import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_RESERVATIONS_PER_DAY,
  PIX_EXPIRATION_MINUTES,
  RESERVATION_HOLD_MINUTES,
} from "./operations";

describe("parâmetros operacionais", () => {
  it("a capacidade de lançamento é de 2 festas por dia", () => {
    // Decisão oficial do negócio. Mudar este número é mudar a operação —
    // o teste existe para que isso seja uma escolha, nunca um descuido.
    expect(DEFAULT_MAX_RESERVATIONS_PER_DAY).toBe(2);
  });

  it("o Pix vence dentro do mínimo aceito pelo Mercado Pago", () => {
    // O Mercado Pago aceita de 30 minutos a 30 dias.
    expect(PIX_EXPIRATION_MINUTES).toBeGreaterThanOrEqual(30);
    expect(PIX_EXPIRATION_MINUTES).toBeLessThanOrEqual(30 * 24 * 60);
  });

  it("a data só é liberada depois de o Pix já ter vencido", () => {
    // Esta é a invariante que impede o pior caso: liberar a data enquanto o
    // QR ainda é pagável deixaria alguém pagando por uma vaga já dada a
    // outra pessoa. A janela de retenção tem que ser maior que a do Pix.
    expect(RESERVATION_HOLD_MINUTES).toBeGreaterThan(PIX_EXPIRATION_MINUTES);
  });
});
