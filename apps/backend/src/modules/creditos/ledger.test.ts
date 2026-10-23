import { describe, expect, it } from "vitest";
import { repeticaoDoPedido } from "./ledger";
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

  it("a mesma chave em outra reserva, outro valor ou outro tipo de movimento é recusada", () => {
    expect(repeticaoDoPedido(gravado, { reservationId: "reserva-2", valor: 200 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDoPedido(gravado, { reservationId: "reserva-1", valor: 100 })).toBe("CHAVE_DE_OUTRA_OPERACAO");
    expect(repeticaoDoPedido({ ...gravado, tipo: "CREDITO_ESTORNADO", valor: 200 }, { reservationId: "reserva-1", valor: 200 })).toBe(
      "CHAVE_DE_OUTRA_OPERACAO",
    );
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
    // Nome curto: nunca aparece inteiro.
    expect(mascararEmail("ab@exemplo.invalid")).toBe("a•••@exemplo.invalid");
    expect(mascararEmail("ana@exemplo.invalid")).toBe("a•••@exemplo.invalid");
    expect(mascararEmail("semarroba")).toBeNull();
    expect(mascararEmail(null)).toBeNull();
  });
});
