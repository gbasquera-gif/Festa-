import { describe, expect, it } from "vitest";
import {
  SITUACAO_DO_RECEBIMENTO_LABEL,
  estaQuitado,
  situacaoDoRecebimento,
} from "./recebimento";

/**
 * Os casos reais que estes testes existem para não deixar voltar:
 *
 *   1. uma cliente pagou R$ 200,00 de uma vez, o lançamento entrou como
 *      DEPOSIT, e o painel exibia "Sinal recebido" num contrato quitado;
 *   2. um contrato migrado, quitado com um lançamento INDETERMINADO, aparecia
 *      como "Aguardando pagamento" com o dinheiro todo na conta.
 *
 * Nos dois, a tela decidia pelo tipo do lançamento. A regra é o dinheiro.
 */

describe("situacaoDoRecebimento", () => {
  it("pagamento único que cobre o total é quitado, não sinal", () => {
    // O caso real: total 200, um DEPOSIT de 200. O tipo não entra na conta.
    expect(situacaoDoRecebimento(200, 200)).toBe("QUITADO");
    expect(SITUACAO_DO_RECEBIMENTO_LABEL[situacaoDoRecebimento(200, 200)])
      .toBe("Pago integralmente");
  });

  it("vale para qualquer tipo de lançamento, porque não olha o tipo", () => {
    // DEPOSIT, BALANCE ou INDETERMINADO chegam aqui como o mesmo número.
    for (const recebido of [400, 400, 400]) {
      expect(situacaoDoRecebimento(400, recebido)).toBe("QUITADO");
    }
  });

  it("parte recebida é parcial", () => {
    expect(situacaoDoRecebimento(200, 60)).toBe("PARCIAL");
    expect(SITUACAO_DO_RECEBIMENTO_LABEL[situacaoDoRecebimento(200, 60)])
      .toBe("Parcialmente recebido");
  });

  it("nada recebido é aguardando", () => {
    expect(situacaoDoRecebimento(200, 0)).toBe("AGUARDANDO");
  });

  it("receber a mais continua quitado, não vira outra coisa", () => {
    expect(situacaoDoRecebimento(200, 250)).toBe("QUITADO");
  });

  it("compara em centavos, não em ponto flutuante", () => {
    // 0.1 + 0.2 = 0.30000000000000004. Em centavos, 30 >= 30.
    expect(situacaoDoRecebimento(0.3, 0.1 + 0.2)).toBe("QUITADO");
    // E um centavo a menos não quita.
    expect(situacaoDoRecebimento(200, 199.99)).toBe("PARCIAL");
  });

  it("pedido sem dinheiro nenhum nunca é exibido como pago", () => {
    // Nem quando o total é zero: um contrato sem recebimento não é uma boa
    // notícia para estampar como quitado.
    expect(situacaoDoRecebimento(0, 0)).toBe("AGUARDANDO");
  });

  it("estaQuitado é a mesma decisão, em booleano", () => {
    expect(estaQuitado(200, 200)).toBe(true);
    expect(estaQuitado(200, 199.99)).toBe(false);
    expect(estaQuitado(200, 0)).toBe(false);
  });
});
