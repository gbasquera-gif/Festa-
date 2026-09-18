import { describe, expect, it } from "vitest";
import { pendentesAEncerrar, quitaOPedido } from "./encerrar-pendencias";

/**
 * O defeito que estes testes existem para não deixar voltar, observado no
 * contrato nº 8 em produção: uma venda paga integralmente ficou com uma
 * cobrança de sinal PENDING pendurada, porque a regra antiga só encerrava
 * pendências do mesmo tipo do pagamento registrado.
 */

const sinalPendente = { id: "p1", type: "DEPOSIT", status: "PENDING" };
const saldoPendente = { id: "p2", type: "BALANCE", status: "PENDING" };
const sinalPago = { id: "p3", type: "DEPOSIT", status: "PAID" };
const saldoFalho = { id: "p4", type: "BALANCE", status: "FAILED" };

describe("quitaOPedido", () => {
  it("compara em centavos, não em ponto flutuante", () => {
    // 0.1 + 0.2 = 0.30000000000000004 em float. Em centavos, 30 >= 30.
    expect(quitaOPedido(0.1, 0.2, 0.3)).toBe(true);
  });

  it("um centavo a menos não quita", () => {
    expect(quitaOPedido(100, 119.99, 220)).toBe(false);
    expect(quitaOPedido(100, 120, 220)).toBe(true);
  });

  it("pagar a mais também quita", () => {
    expect(quitaOPedido(0, 250, 220)).toBe(true);
  });
});

describe("pendentesAEncerrar", () => {
  it("o caso do contrato nº 8: saldo que quita encerra o sinal pendente", () => {
    // Era isto que não acontecia: tipos diferentes, pendência sobrevivia.
    expect(pendentesAEncerrar([sinalPendente], { tipo: "BALANCE", valor: 220 }, 220, 0))
      .toEqual(["p1"]);
  });

  it("pagamento parcial de outro tipo NÃO encerra a pendência", () => {
    // 0 + 50 < 220: não quita, e o tipo não bate. Nada é encerrado — a
    // cobrança do sinal continua valendo, porque ainda há o que cobrar.
    expect(pendentesAEncerrar([sinalPendente], { tipo: "BALANCE", valor: 50 }, 220, 0))
      .toEqual([]);
  });

  it("pagamento parcial do MESMO tipo encerra a pendência daquele tipo", () => {
    // Comportamento que já existia e tem de continuar: a cliente pagou o
    // sinal por fora, o Pix daquele sinal não pode seguir aguardando.
    expect(pendentesAEncerrar([sinalPendente], { tipo: "DEPOSIT", valor: 50 }, 220, 0))
      .toEqual(["p1"]);
  });

  it("quitar encerra TODAS as pendências, de qualquer tipo", () => {
    expect(pendentesAEncerrar([sinalPendente, saldoPendente], { tipo: "BALANCE", valor: 220 }, 220, 0))
      .toEqual(["p1", "p2"]);
  });

  it("nunca devolve um pagamento PAID", () => {
    const ids = pendentesAEncerrar([sinalPago, sinalPendente], { tipo: "DEPOSIT", valor: 220 }, 220, 0);
    expect(ids).not.toContain("p3");
    expect(ids).toEqual(["p1"]);
  });

  it("nunca devolve um pagamento já FAILED", () => {
    const ids = pendentesAEncerrar([saldoFalho, sinalPendente], { tipo: "BALANCE", valor: 220 }, 220, 0);
    expect(ids).not.toContain("p4");
  });

  it("o já pago entra na conta de quitação", () => {
    // 200 já pagos + 20 agora fecham os 220: quita, e encerra o sinal.
    expect(pendentesAEncerrar([sinalPendente], { tipo: "BALANCE", valor: 20 }, 220, 200))
      .toEqual(["p1"]);
    // Mas 200 + 19 não fecham.
    expect(pendentesAEncerrar([sinalPendente], { tipo: "BALANCE", valor: 19 }, 220, 200))
      .toEqual([]);
  });

  it("sem pendência nenhuma, não há o que encerrar", () => {
    expect(pendentesAEncerrar([sinalPago], { tipo: "BALANCE", valor: 220 }, 220, 0)).toEqual([]);
    expect(pendentesAEncerrar([], { tipo: "DEPOSIT", valor: 100 }, 220, 0)).toEqual([]);
  });
});
