import { describe, expect, it } from "vitest";
import { repeticaoDaVenda, repeticaoDoPedido } from "./ledger";
import { mascararEmail, mascararTelefone } from "./creditos.service";

describe("pedido de crédito repetido (idempotência)", () => {
  const gravado = { tipo: "CREDITO_UTILIZADO", reservationDestinoId: "reserva-1", valor: -200 };

  it("mesma reserva e mesmo valor: é o mesmo pedido, nada novo é gravado", () => {
    expect(repeticaoDoPedido(gravado, { reservationId: "reserva-1", valor: 200 })).toBe("MESMO_PEDIDO");
  });

  it("confere em centavos", () => {
    expect(repeticaoDoPedido({ ...gravado, valor: -0.3 }, { reservationId: "reserva-1", valor: 0.1 + 0.2 })).toBe(
      "MESMO_PEDIDO",
    );
  });

  it("venda manual repetida (sem reserva no pedido): basta o valor", () => {
    expect(repeticaoDoPedido(gravado, { valor: 200 })).toBe("MESMO_PEDIDO");
  });

  it("a mesma chave em outra reserva, outro valor ou outro tipo de movimento é recusada", () => {
    expect(repeticaoDoPedido(gravado, { reservationId: "reserva-2", valor: 200 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDoPedido(gravado, { reservationId: "reserva-1", valor: 100 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDoPedido({ ...gravado, tipo: "CREDITO_ESTORNADO", valor: 200 }, { reservationId: "reserva-1", valor: 200 })).toBe(
      "CHAVE_DE_OUTRA_OPERACAO",
    );
  });
});

describe("venda manual com crédito repetida", () => {
  const dia = new Date("2026-11-14T12:00:00Z");
  const gravada = {
    movimento: { tipo: "CREDITO_UTILIZADO", userId: "ana", reservationDestinoId: "reserva-1", valor: -120 },
    dataDaFesta: dia,
    total: 350,
  };
  const pedido = { clienteId: "ana", valorDoCredito: 120, dataDaFesta: new Date("2026-11-14T12:00:00Z"), total: 350 };

  it("mesmo crédito, mesma ficha, mesma data e mesmo total: é a mesma venda (devolve a já gravada)", () => {
    expect(repeticaoDaVenda(gravada, pedido)).toBe("MESMA_VENDA");
  });

  it("a operação corrigiu a data, o total ou o crédito antes de reenviar: recusada (a correção não pode sumir em silêncio)", () => {
    expect(repeticaoDaVenda(gravada, { ...pedido, dataDaFesta: new Date("2026-11-15T12:00:00Z") })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDaVenda(gravada, { ...pedido, total: 380 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDaVenda(gravada, { ...pedido, valorDoCredito: 100 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
  });

  it("a mesma chave com o crédito de outra ficha: recusada", () => {
    expect(repeticaoDaVenda(gravada, { ...pedido, clienteId: "outra" })).toBe("CHAVE_DE_OUTRA_OPERACAO");
  });
});

describe("contato mascarado das fichas possíveis", () => {
  it("telefone: só os 4 últimos dígitos", () => {
    expect(mascararTelefone("(00) 00000-1234")).toBe("••••1234");
    expect(mascararTelefone("12")).toBeNull();
    expect(mascararTelefone(null)).toBeNull();
  });

  it("e-mail: o começo e o domínio", () => {
    expect(mascararEmail("ana.paula@exemplo.invalid")).toBe("an•••@exemplo.invalid");
    expect(mascararEmail("semarroba")).toBeNull();
    expect(mascararEmail(null)).toBeNull();
  });
});
