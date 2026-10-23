import { describe, expect, it } from "vitest";
import {
  consolidarDecisoes,
  decidirPeloProvedor,
  type CobrancaParaConferir,
  type PagamentoNoProvedor,
} from "./conferencia-do-provedor";

/** Sinal de R$ 105,00, Pix gerado com o id 555 no Mercado Pago. */
const cobranca = (mudar: Partial<CobrancaParaConferir> = {}): CobrancaParaConferir => ({
  id: "cobranca-1",
  status: "PENDING",
  metodo: "PIX",
  valor: 105,
  externalReference: "555",
  ...mudar,
});

const noProvedor = (mudar: Partial<PagamentoNoProvedor> = {}): PagamentoNoProvedor => ({
  id: "555",
  referencia: "cobranca-1",
  status: "approved",
  valor: 105,
  valorEstornado: 0,
  moeda: "BRL",
  producao: true,
  ...mudar,
});

const producao = { producao: true };

describe("conferência do pagamento no Mercado Pago", () => {
  it("liquida o Pix certo, no valor certo, em reais", () => {
    expect(decidirPeloProvedor(cobranca(), noProvedor(), producao)).toEqual({ acao: "LIQUIDAR" });
  });

  it("registra Pix pago depois de vencer: o dinheiro entrou", () => {
    expect(decidirPeloProvedor(cobranca({ status: "FAILED" }), noProvedor(), producao)).toEqual({
      acao: "LIQUIDAR",
    });
  });

  describe("notificações fraudulentas e vínculo", () => {
    it("Pix de R$ 0,01 criado com a referência da cobrança não quita a festa", () => {
      // O ataque com a credencial vazada: outro Pix, com a nossa referência.
      expect(
        decidirPeloProvedor(cobranca(), noProvedor({ id: "999", valor: 0.01 }), producao),
      ).toEqual({ acao: "ALERTA", motivo: "ID_DIVERGENTE" });
    });

    it("outro Pix com o valor cheio e a nossa referência também não quita", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ id: "999" }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "ID_DIVERGENTE",
      });
    });

    it("pagamento que aponta para outra cobrança não mexe nesta", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ referencia: "cobranca-2" }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "REFERENCIA_DIVERGENTE",
      });
      expect(decidirPeloProvedor(cobranca(), noProvedor({ referencia: null }), producao).acao).toBe("ALERTA");
    });

    it("Pix sem id gravado na cobrança não se liquida", () => {
      expect(decidirPeloProvedor(cobranca({ externalReference: null }), noProvedor(), producao)).toEqual({
        acao: "ALERTA",
        motivo: "ID_DIVERGENTE",
      });
    });

    it("cartão não tem id antes de pagar: vale referência, valor e moeda", () => {
      const cartao = cobranca({ metodo: "CARTAO", externalReference: "cobranca-1" });
      expect(decidirPeloProvedor(cartao, noProvedor({ id: "777" }), producao)).toEqual({ acao: "LIQUIDAR" });
      expect(decidirPeloProvedor(cartao, noProvedor({ id: "777", valor: 1 }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "VALOR_DIVERGENTE",
      });
    });
  });

  describe("valor e moeda", () => {
    it("pagamento parcial não quita", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ valor: 50 }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "VALOR_DIVERGENTE",
      });
    });

    it("pagamento acima do cobrado também não quita sozinho", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ valor: 105.01 }), producao).acao).toBe("ALERTA");
    });

    it("confere em centavos, sem erro de ponto flutuante", () => {
      expect(
        decidirPeloProvedor(cobranca({ valor: 0.1 + 0.2 }), noProvedor({ valor: 0.3 }), producao),
      ).toEqual({ acao: "LIQUIDAR" });
    });

    it("sem valor informado, não quita", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ valor: null }), producao).acao).toBe("ALERTA");
    });

    it("moeda diferente de real não quita", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ moeda: "USD" }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "MOEDA_DIVERGENTE",
      });
      expect(decidirPeloProvedor(cobranca(), noProvedor({ moeda: null }), producao).acao).toBe("ALERTA");
    });

    it("pagamento de teste não quita em produção, e quita fora dela", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ producao: false }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "PAGAMENTO_DE_TESTE",
      });
      expect(decidirPeloProvedor(cobranca(), noProvedor({ producao: false }), { producao: false })).toEqual({
        acao: "LIQUIDAR",
      });
    });
  });

  describe("estornos e contestações", () => {
    it("estorno de algo já recebido só alerta: nada é desfeito sozinho", () => {
      expect(
        decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ status: "refunded", valorEstornado: 105 }), producao),
      ).toEqual({ acao: "ALERTA", motivo: "ESTORNO_NO_PROVEDOR" });
    });

    it("estorno parcial de algo já recebido só alerta", () => {
      expect(
        decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ valorEstornado: 20 }), producao),
      ).toEqual({ acao: "ALERTA", motivo: "ESTORNO_NO_PROVEDOR" });
    });

    it("chargeback e mediação de algo já recebido só alertam", () => {
      for (const status of ["charged_back", "in_mediation"]) {
        expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ status }), producao)).toEqual({
          acao: "ALERTA",
          motivo: "CONTESTACAO_NO_PROVEDOR",
        });
      }
    });

    it("estorno parcial antes de registrar: não quita, alerta", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ valorEstornado: 20 }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "ESTORNO_NO_PROVEDOR",
      });
    });

    it("estorno total antes de registrar: a cobrança pendente vira recusada", () => {
      expect(
        decidirPeloProvedor(cobranca(), noProvedor({ status: "refunded", valorEstornado: 105 }), producao),
      ).toEqual({ acao: "RECUSAR" });
    });

    it("contestação antes de registrar: não quita nem recusa, alerta", () => {
      expect(decidirPeloProvedor(cobranca(), noProvedor({ status: "charged_back" }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "CONTESTACAO_NO_PROVEDOR",
      });
    });

    it("pagamento já recebido e aprovado lá no mesmo valor: confere (webhook repetido)", () => {
      expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor(), producao)).toEqual({ acao: "CONFERE" });
    });
  });

  describe("recebimento já registrado é conferido com o mesmo rigor", () => {
    it("registrado aqui com valor diferente do aprovado lá (ex.: Pix de R$ 0,01 aceito antes da correção)", () => {
      expect(
        decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ valor: 0.01 }), producao),
      ).toEqual({ acao: "ALERTA", motivo: "VALOR_DIVERGENTE" });
    });

    it("registrado aqui por um Pix que não é o da cobrança", () => {
      expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ id: "999" }), producao)).toEqual({
        acao: "ALERTA",
        motivo: "ID_DIVERGENTE",
      });
    });

    it("registrado aqui e não aprovado lá", () => {
      for (const status of ["pending", "rejected", "cancelled", "authorized"]) {
        expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ status }), producao)).toEqual({
          acao: "ALERTA",
          motivo: "NAO_APROVADO_NO_PROVEDOR",
        });
      }
    });

    it("registrado aqui por pagamento de teste ou em outra moeda", () => {
      expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ producao: false }), producao).acao).toBe("ALERTA");
      expect(decidirPeloProvedor(cobranca({ status: "PAID" }), noProvedor({ moeda: "USD" }), producao).acao).toBe("ALERTA");
    });
  });

  describe("várias tentativas da mesma cobrança (cartão)", () => {
    const cartao = (status: string) => cobranca({ status, metodo: "CARTAO", externalReference: "cobranca-1" });
    const tentativa = (id: string, mudar: Partial<PagamentoNoProvedor> = {}) => noProvedor({ id, ...mudar });
    const decidir = (status: string, tentativas: PagamentoNoProvedor[]) =>
      consolidarDecisoes(tentativas.map((t) => decidirPeloProvedor(cartao(status), t, producao)));

    it("uma recusada e uma aprovada: liquida, sem alerta", () => {
      expect(decidir("PENDING", [tentativa("1", { status: "rejected" }), tentativa("2")])).toEqual({
        acao: "LIQUIDAR",
        confere: false,
        alertas: [],
      });
    });

    it("só uma recusada: não recusa enquanto houver outra pendente", () => {
      expect(decidir("PENDING", [tentativa("1", { status: "rejected" }), tentativa("2", { status: "pending" })]).acao).toBe("NADA");
      expect(decidir("PENDING", [tentativa("1", { status: "rejected" })]).acao).toBe("RECUSAR");
    });

    it("já registrada: a tentativa recusada ao lado da aprovada não é alerta", () => {
      expect(decidir("PAID", [tentativa("1", { status: "rejected" }), tentativa("2")])).toEqual({
        acao: "NADA",
        confere: true,
        alertas: [],
      });
    });

    it("cobrança em dobro ou contestada aparece mesmo quando outra tentativa liquida", () => {
      expect(decidir("PENDING", [tentativa("1"), tentativa("2", { valor: 50 })])).toEqual({
        acao: "LIQUIDAR",
        confere: false,
        alertas: ["VALOR_DIVERGENTE"],
      });
      expect(decidir("PAID", [tentativa("1"), tentativa("2", { status: "charged_back" })]).alertas).toEqual([
        "CONTESTACAO_NO_PROVEDOR",
      ]);
    });

    it("nenhuma tentativa encontrada: nada a fazer", () => {
      expect(decidir("PENDING", [])).toEqual({ acao: "NADA", confere: false, alertas: [] });
    });
  });

  describe("outras situações", () => {
    it("cobrança anulada aqui e aprovada lá: alerta, não volta sozinha", () => {
      expect(decidirPeloProvedor(cobranca({ status: "ANULADO" }), noProvedor(), producao)).toEqual({
        acao: "ALERTA",
        motivo: "COBRANCA_ANULADA",
      });
    });

    it("recusado ou cancelado lá: a pendente vira recusada; a recusada fica", () => {
      for (const status of ["rejected", "cancelled"]) {
        expect(decidirPeloProvedor(cobranca(), noProvedor({ status }), producao)).toEqual({ acao: "RECUSAR" });
        expect(decidirPeloProvedor(cobranca({ status: "FAILED" }), noProvedor({ status }), producao)).toEqual({
          acao: "NADA",
        });
      }
    });

    it("pendente, em processamento ou só autorizado: não é dinheiro recebido", () => {
      for (const status of ["pending", "in_process", "authorized", "algo_novo", null]) {
        expect(decidirPeloProvedor(cobranca(), noProvedor({ status }), producao)).toEqual({ acao: "NADA" });
      }
    });

    it("o vínculo é conferido antes de qualquer status, até para recusar", () => {
      expect(
        decidirPeloProvedor(cobranca(), noProvedor({ id: "999", status: "rejected" }), producao),
      ).toEqual({ acao: "ALERTA", motivo: "ID_DIVERGENTE" });
    });
  });
});
