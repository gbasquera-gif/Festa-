import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_FEE,
  DELIVERY_FEE,
  DELIVERY_WITH_ASSEMBLY_FEE,
  DEPOSIT_RATE,
  PERCENTUAL_DO_SALDO,
  PERCENTUAL_DO_SINAL,
  calculateOrderPricing,
  checkFulfillment,
  fromCentsInt,
  isDeliveryCity,
  saldoAPagar,
  splitPayment,
  toCents,
  toCentsInt,
  type PricingInput,
} from "./pricing";

/**
 * O sinal esperado, calculado pela regra e não digitado.
 *
 * Um teste que crava "250" está provando o número de hoje; este prova a
 * regra — e continua pegando erro de arredondamento quando a taxa muda.
 */
const sinalDe = (total: number) => fromCentsInt(Math.round(toCentsInt(total) * DEPOSIT_RATE));

/** O saldo é sempre a diferença, nunca um segundo cálculo da taxa. */
const saldoDe = (total: number) => fromCentsInt(toCentsInt(total) - toCentsInt(sinalDe(total)));

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
    expect(result.deposit).toBe(sinalDe(result.total));
    expect(result.balance).toBe(saldoDe(result.total));
  });

  // A equipe monta no local da festa mesmo quando foi a cliente quem buscou
  // os itens. As duas escolhas são independentes: a montagem é cobrada aqui
  // sem nenhuma taxa de entrega junto.
  it("B) retirada com montagem: produtos + R$ 50, sem taxa de entrega", () => {
    const result = calculateOrderPricing({ ...base, assembly: true });

    expect(result.deliveryFee).toBe(0);
    expect(result.assemblyFee).toBe(50);
    expect(result.total).toBe(550);
    expect(result.deposit).toBe(sinalDe(result.total));
    expect(result.balance).toBe(saldoDe(result.total));
  });

  it("C) entrega sem montagem: produtos + R$ 20", () => {
    const result = calculateOrderPricing({ ...base, fulfillment: "DELIVERY" });

    expect(result.deliveryFee).toBe(20);
    expect(result.assemblyFee).toBe(0);
    expect(result.total).toBe(520);
    expect(result.deposit).toBe(sinalDe(result.total));
    expect(result.balance).toBe(saldoDe(result.total));
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
    expect(result.deposit).toBe(sinalDe(result.total));
    expect(result.balance).toBe(saldoDe(result.total));
  });
});

/**
 * A tabela das quatro combinações, do jeito que a operação a enunciou.
 *
 * Fica separada e explícita porque é a regra comercial que mais mudou de
 * ideia neste projeto: já houve uma versão em que montagem exigia entrega.
 * Um teste que lista as quatro linhas com o total de cada uma é o lugar onde
 * a regra vigente fica escrita sem ambiguidade.
 */
describe("tabela oficial: retirada grátis, entrega R$ 20, montagem R$ 50", () => {
  const casos: { nome: string; entrega: boolean; montagem: boolean; total: number }[] = [
    { nome: "retirada sem montagem", entrega: false, montagem: false, total: 500 },
    { nome: "retirada com montagem", entrega: false, montagem: true, total: 550 },
    { nome: "entrega sem montagem", entrega: true, montagem: false, total: 520 },
    { nome: "entrega com montagem", entrega: true, montagem: true, total: 570 },
  ];

  for (const caso of casos) {
    it(`${caso.nome} → ${caso.total}`, () => {
      const r = calculateOrderPricing({
        ...base,
        fulfillment: caso.entrega ? "DELIVERY" : "PICKUP",
        assembly: caso.montagem,
      });
      expect(r.total).toBe(caso.total);
      expect(r.deliveryFee).toBe(caso.entrega ? DELIVERY_FEE : 0);
      expect(r.assemblyFee).toBe(caso.montagem ? ASSEMBLY_FEE : 0);
      expect(r.deposit + r.balance).toBe(caso.total);
      expect(checkFulfillment(caso.entrega ? "DELIVERY" : "PICKUP", "Chapecó", caso.montagem).allowed).toBe(
        true,
      );
    });
  }
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

describe("sinal e saldo restante", () => {
  it("sinal mais saldo sempre fecha o total exato", () => {
    // Valores escolhidos para produzir metades quebradas de propósito.
    const valores = [0, 0.01, 33.33, 99.99, 500, 570, 1234.57, 7777.77];

    for (const subtotalKit of valores) {
      const result = calculateOrderPricing({ ...base, subtotalKit, subtotalExtras: 0 });
      expect(toCents(result.deposit + result.balance)).toBe(result.total);
    }
  });

  it("em total ímpar, o centavo sobra no sinal e o saldo fecha a conta", () => {
    // Total ímpar de propósito: a fração do sinal cai num meio-centavo e
    // o saldo tem que absorver a diferença sem o total escapar.
    const result = calculateOrderPricing({
      ...base,
      subtotalKit: 500.01,
      subtotalExtras: 0,
      fulfillment: "DELIVERY",
      assembly: true,
    });

    expect(result.total).toBe(570.01);
    expect(result.deposit).toBe(sinalDe(570.01));
    expect(toCents(result.deposit + result.balance)).toBe(570.01);
    // O centavo tem que cair em algum lado, e não pode sumir nem duplicar.
    expect(toCents(result.deposit + result.balance)).toBe(result.total);
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

  // As três opções que a loja oferece hoje, com o preço que a cliente lê.
  it("as três opções custam grátis, R$ 20 e R$ 70", () => {
    const produtos = base.subtotalKit + base.subtotalExtras;

    const retirada = calculateOrderPricing(base);
    const retiradaComMontagem = calculateOrderPricing({ ...base, assembly: true });
    const entrega = calculateOrderPricing({ ...base, fulfillment: "DELIVERY" });
    const entregaComMontagem = calculateOrderPricing({
      ...base,
      fulfillment: "DELIVERY",
      assembly: true,
    });

    expect(retirada.total - produtos).toBe(0);
    expect(retiradaComMontagem.total - produtos).toBe(ASSEMBLY_FEE);
    expect(entrega.total - produtos).toBe(DELIVERY_FEE);
    expect(entregaComMontagem.total - produtos).toBe(DELIVERY_WITH_ASSEMBLY_FEE);
    expect(DELIVERY_WITH_ASSEMBLY_FEE).toBe(70);
  });

  // A regra antiga exigia entrega para haver montagem. Foi revista: a equipe
  // monta no local mesmo quando a cliente buscou os itens.
  it("montagem com retirada é permitida", () => {
    expect(checkFulfillment("PICKUP", "Chapecó", true).allowed).toBe(true);
  });

  it("montagem com entrega é permitida", () => {
    expect(checkFulfillment("DELIVERY", "Chapecó", true).allowed).toBe(true);
  });

  // Montagem não depende de retirada ou entrega, mas depende da cidade: a
  // equipe que não vai entregar em Xanxerê também não vai montar lá. Cobrar
  // a taxa seria vender um serviço que ninguém presta.
  it("cidade sem entrega não cobra entrega nem montagem", () => {
    const fora = calculateOrderPricing({
      ...base,
      fulfillment: "DELIVERY",
      assembly: true,
      city: "Xanxerê",
    });

    expect(fora.deliveryFee).toBe(0);
    expect(fora.assemblyFee).toBe(0);
    expect(fora.total).toBe(base.subtotalKit + base.subtotalExtras);
  });
});

/**
 * O saldo é dívida, e dívida se mede pelo que entrou.
 *
 * Enquanto o sinal foi 50% para todo mundo, `total − sinal` e `total − pago`
 * davam sempre o mesmo número, e ninguém precisou separar as duas contas.
 * Baixar o sinal para 30% separou: refazer a divisão pela taxa de hoje
 * cobraria a mais de toda cliente que pagou 50% antes da mudança.
 */
describe("saldo de quem já pagou", () => {
  it("a cliente que pagou sinal de 50% deve só a diferença, não 70% do total", () => {
    const total = 600;
    const sinalAntigo = 300; // 50%, pago antes da mudança de taxa

    expect(saldoAPagar(total, sinalAntigo)).toBe(300);
    // A conta errada, que este teste existe para impedir:
    expect(splitPayment(total).balance).toBe(420);
  });

  it("quem ainda não pagou nada deve o total inteiro", () => {
    expect(saldoAPagar(500, 0)).toBe(500);
  });

  it("quem pagou tudo não deve nada", () => {
    expect(saldoAPagar(500, 500)).toBe(0);
  });

  it("nunca devolve cobrança negativa", () => {
    expect(saldoAPagar(500, 620)).toBe(0);
  });

  it("fecha ao centavo, sem herdar erro de ponto flutuante", () => {
    expect(saldoAPagar(570.01, 285.01)).toBe(285);
    expect(saldoAPagar(0.03, 0.01)).toBe(0.02);
  });

  it("sinal novo mais saldo fecha o total, para quem entra agora", () => {
    for (const total of [0.01, 33.33, 99.99, 500, 570.01, 1234.57]) {
      const { deposit } = splitPayment(total);
      expect(toCents(deposit + saldoAPagar(total, deposit))).toBe(total);
    }
  });
});

describe("os textos da porcentagem saem da constante", () => {
  it("nunca divergem da taxa que o sistema cobra", () => {
    expect(PERCENTUAL_DO_SINAL).toBe(`${Math.round(DEPOSIT_RATE * 100)}%`);
    expect(PERCENTUAL_DO_SALDO).toBe(`${Math.round((1 - DEPOSIT_RATE) * 100)}%`);
  });

  it("hoje a Festaê cobra 30% de sinal", () => {
    expect(DEPOSIT_RATE).toBe(0.3);
    expect(PERCENTUAL_DO_SINAL).toBe("30%");
    expect(PERCENTUAL_DO_SALDO).toBe("70%");
  });
});
