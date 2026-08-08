import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_FEE,
  DELIVERY_FEE,
  calculateOrderPricing,
  checkFulfillment,
  isDeliveryCity,
  toCents,
  type PricingInput,
} from "./pricing";

/**
 * Erro de cálculo aqui é dinheiro cobrado a mais ou a menos de um cliente
 * real. Estes testes existem para que nenhuma alteração futura em taxa,
 * arredondamento ou regra de cidade passe despercebida.
 */

/** Cenário base: R$ 500 em produtos, em Chapecó. */
const base: PricingInput = {
  subtotalKit: 400,
  subtotalExtras: 100,
  fulfillment: "PICKUP",
  assembly: false,
  city: "Chapecó",
};

describe("as quatro combinações oficiais de logística e montagem", () => {
  it("A) retirada sem montagem: só os produtos", () => {
    const result = calculateOrderPricing(base);

    expect(result.subtotalProducts).toBe(500);
    expect(result.deliveryFee).toBe(0);
    expect(result.assemblyFee).toBe(0);
    expect(result.total).toBe(500);
    expect(result.deposit).toBe(250);
    expect(result.balance).toBe(250);
  });

  it("B) retirada com montagem: produtos + R$ 50", () => {
    const result = calculateOrderPricing({ ...base, assembly: true });

    expect(result.deliveryFee).toBe(0);
    expect(result.assemblyFee).toBe(50);
    expect(result.total).toBe(550);
    expect(result.deposit).toBe(275);
    expect(result.balance).toBe(275);
  });

  it("C) entrega sem montagem: produtos + R$ 20", () => {
    const result = calculateOrderPricing({ ...base, fulfillment: "DELIVERY" });

    expect(result.deliveryFee).toBe(20);
    expect(result.assemblyFee).toBe(0);
    expect(result.total).toBe(520);
    expect(result.deposit).toBe(260);
    expect(result.balance).toBe(260);
  });

  it("D) entrega com montagem: o exemplo do documento oficial", () => {
    // Produtos 500 + entrega 20 + montagem 50 = 570; sinal 285, restante 285.
    const result = calculateOrderPricing({
      ...base,
      fulfillment: "DELIVERY",
      assembly: true,
    });

    expect(result.subtotalProducts).toBe(500);
    expect(result.deliveryFee).toBe(20);
    expect(result.assemblyFee).toBe(50);
    expect(result.total).toBe(570);
    expect(result.deposit).toBe(285);
    expect(result.balance).toBe(285);
  });
});

describe("subtotal dos produtos", () => {
  it("soma kit e extras", () => {
    const result = calculateOrderPricing({ ...base, subtotalKit: 349.9, subtotalExtras: 75.5 });
    expect(result.subtotalProducts).toBe(425.4);
  });

  it("aceita pedido só de extras, sem kit", () => {
    const result = calculateOrderPricing({ ...base, subtotalKit: 0, subtotalExtras: 120 });
    expect(result.subtotalProducts).toBe(120);
    expect(result.total).toBe(120);
  });

  it("aceita pedido só de kit, sem extras", () => {
    const result = calculateOrderPricing({ ...base, subtotalKit: 300, subtotalExtras: 0 });
    expect(result.total).toBe(300);
  });

  it("pedido vazio não gera valor negativo nem NaN", () => {
    const result = calculateOrderPricing({ ...base, subtotalKit: 0, subtotalExtras: 0 });
    expect(result.total).toBe(0);
    expect(result.deposit).toBe(0);
    expect(result.balance).toBe(0);
  });
});

describe("sinal de 50% e saldo restante", () => {
  it("sinal mais saldo sempre fecha o total exato", () => {
    // Valores escolhidos para produzir metades quebradas de propósito.
    const valores = [0, 0.01, 33.33, 99.99, 500, 570, 1234.57, 7777.77];

    for (const subtotalKit of valores) {
      const result = calculateOrderPricing({ ...base, subtotalKit, subtotalExtras: 0 });
      expect(toCents(result.deposit + result.balance)).toBe(result.total);
    }
  });

  it("em total ímpar, o centavo sobra no sinal e o saldo fecha a conta", () => {
    // 570,01 → 285,005 arredonda para 285,01; o saldo é a diferença.
    const result = calculateOrderPricing({
      ...base,
      subtotalKit: 500.01,
      subtotalExtras: 0,
      fulfillment: "DELIVERY",
      assembly: true,
    });

    expect(result.total).toBe(570.01);
    expect(result.deposit).toBe(285.01);
    expect(result.balance).toBe(285);
    expect(toCents(result.deposit + result.balance)).toBe(570.01);
  });

  it("não deixa resto de ponto flutuante escapar para o total", () => {
    // 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004.
    const result = calculateOrderPricing({ ...base, subtotalKit: 0.1, subtotalExtras: 0.2 });
    expect(result.total).toBe(0.3);
  });
});

describe("regra de entrega por cidade", () => {
  it("cobra entrega em Chapecó", () => {
    const result = calculateOrderPricing({ ...base, fulfillment: "DELIVERY", city: "Chapecó" });
    expect(result.deliveryFee).toBe(DELIVERY_FEE);
  });

  it("não cobra entrega em outra cidade, mesmo se a escolha vazar até aqui", () => {
    const result = calculateOrderPricing({ ...base, fulfillment: "DELIVERY", city: "Xanxerê" });
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(500);
  });

  it("reconhece a cidade sem acento, em caixa alta e com espaço sobrando", () => {
    expect(isDeliveryCity("chapeco")).toBe(true);
    expect(isDeliveryCity("CHAPECÓ")).toBe(true);
    expect(isDeliveryCity("  Chapecó  ")).toBe(true);
    expect(isDeliveryCity("Chapecó ")).toBe(true);
  });

  it("não confunde outra cidade com Chapecó", () => {
    expect(isDeliveryCity("Xanxerê")).toBe(false);
    expect(isDeliveryCity("São Miguel do Oeste")).toBe(false);
    expect(isDeliveryCity("")).toBe(false);
    expect(isDeliveryCity(null)).toBe(false);
    expect(isDeliveryCity(undefined)).toBe(false);
  });

  it("bloqueia entrega fora de Chapecó com a mensagem oficial", () => {
    const bloqueado = checkFulfillment("DELIVERY", "Xanxerê");
    expect(bloqueado.allowed).toBe(false);
    expect(bloqueado.allowed === false && bloqueado.reason).toContain("somente em Chapecó");
  });

  it("libera entrega em Chapecó e retirada em qualquer lugar", () => {
    expect(checkFulfillment("DELIVERY", "Chapecó").allowed).toBe(true);
    expect(checkFulfillment("PICKUP", "Xanxerê").allowed).toBe(true);
    expect(checkFulfillment("PICKUP", null).allowed).toBe(true);
  });
});

describe("taxas oficiais", () => {
  it("entrega custa R$ 20 e montagem custa R$ 50", () => {
    // Trava os valores acordados: mudar a taxa deve exigir mudar o teste,
    // e mudar o teste é a hora de conferir se o texto legal também mudou.
    expect(DELIVERY_FEE).toBe(20);
    expect(ASSEMBLY_FEE).toBe(50);
  });

  it("montagem e entrega são independentes", () => {
    const soMontagem = calculateOrderPricing({ ...base, assembly: true });
    const soEntrega = calculateOrderPricing({ ...base, fulfillment: "DELIVERY" });
    const ambos = calculateOrderPricing({ ...base, fulfillment: "DELIVERY", assembly: true });

    expect(ambos.total).toBe(soMontagem.total + soEntrega.total - base.subtotalKit - base.subtotalExtras);
  });
});
