import { describe, expect, it } from "vitest";
import * as operacoes from "./operations";
import { PIX_EXPIRATION_MINUTES, RESERVATION_HOLD_MINUTES } from "./operations";

describe("parâmetros operacionais", () => {
  it("não existe limite de reservas por dia", () => {
    // A trava existiu e foi removida: uma data comporta festa completa,
    // balões, itens avulsos e retirada ao mesmo tempo. Este teste existe para
    // que ela não volte por descuido — o que limita uma data é material.
    expect("DEFAULT_MAX_RESERVATIONS_PER_DAY" in operacoes).toBe(false);
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
