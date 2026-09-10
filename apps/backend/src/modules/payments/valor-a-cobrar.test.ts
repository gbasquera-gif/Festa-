import { describe, expect, it } from "vitest";
import { valorACobrar } from "./payments.service";

/**
 * Estes testes protegem o bolso de uma cliente real.
 *
 * O sinal da Festaê caiu de 50% para 30%. Se o saldo continuasse sendo
 * calculado pela taxa vigente (`total − 30%`), toda festa cujo sinal de 50%
 * já tinha sido pago geraria um Pix de saldo maior do que a dívida — e a
 * cliente pagaria a mais sem ninguém perceber.
 */
describe("valorACobrar", () => {
  describe("sinal", () => {
    it("cobra a fração vigente do total", () => {
      expect(valorACobrar("DEPOSIT", 890, [])).toBe(267);
      expect(valorACobrar("DEPOSIT", 600, [])).toBe(180);
    });

    it("não desconta o que já foi pago: sinal é sinal, não saldo", () => {
      // Um sinal parcial já registrado não muda o valor do sinal em si.
      expect(valorACobrar("DEPOSIT", 600, [50])).toBe(180);
    });
  });

  describe("saldo", () => {
    it("O CASO QUE IMPORTA: quem pagou sinal de 50% deve só a diferença", () => {
      // Festa de R$ 600, sinal de 50% (R$ 300) pago antes da mudança.
      expect(valorACobrar("BALANCE", 600, [300])).toBe(300);
    });

    it("quem paga sinal de 30% agora deve os 70% restantes", () => {
      expect(valorACobrar("BALANCE", 600, [180])).toBe(420);
    });

    it("soma todos os pagamentos recebidos, não só o sinal", () => {
      expect(valorACobrar("BALANCE", 600, [180, 100, 20])).toBe(300);
    });

    it("quem já pagou tudo não recebe cobrança", () => {
      expect(valorACobrar("BALANCE", 600, [600])).toBe(0);
      expect(valorACobrar("BALANCE", 600, [300, 300])).toBe(0);
    });

    it("nunca gera cobrança negativa quando pagaram a mais", () => {
      expect(valorACobrar("BALANCE", 600, [700])).toBe(0);
    });

    it("fecha ao centavo em total ímpar", () => {
      const total = 570.01;
      const sinal = valorACobrar("DEPOSIT", total, []);
      const saldo = valorACobrar("BALANCE", total, [sinal]);
      expect(Math.round((sinal + saldo) * 100)).toBe(Math.round(total * 100));
    });
  });
});
