import { describe, expect, it } from "vitest";
import { formasDoTelefone, normalizarTelefone } from "./telefone";

describe("normalizarTelefone", () => {
  it("o mesmo celular com máscaras diferentes vira o mesmo número", () => {
    const formas = [
      "(49) 99999-0000",
      "49 99999 0000",
      "49999990000",
      "+55 (49) 99999-0000",
      "55 49 99999-0000",
      "049 99999-0000",
      " 49.99999.0000 ",
    ];
    for (const f of formas) expect(normalizarTelefone(f)).toBe("49999990000");
  });

  it("fixo de 8 dígitos também", () => {
    expect(normalizarTelefone("(49) 3322-1100")).toBe("4933221100");
    expect(normalizarTelefone("+55 49 3322-1100")).toBe("4933221100");
    expect(normalizarTelefone("0 49 3322-1100")).toBe("4933221100");
  });

  it("não confunde o DDD 55 com o código do país", () => {
    // Santa Maria (RS): DDD 55 + celular. Onze dígitos — nada sobra.
    expect(normalizarTelefone("(55) 99999-0000")).toBe("55999990000");
    // Com o país na frente, o primeiro 55 sai e o DDD fica.
    expect(normalizarTelefone("+55 55 99999-0000")).toBe("55999990000");
  });

  it("o que não parece telefone brasileiro volta só com os dígitos", () => {
    expect(normalizarTelefone("123")).toBe("123");
    expect(normalizarTelefone("")).toBe("");
    expect(normalizarTelefone(null)).toBe("");
  });
});

describe("formasDoTelefone", () => {
  it("cobre como o número pode estar gravado em cadastros antigos", () => {
    expect(formasDoTelefone("(49) 99999-0000")).toEqual([
      "49999990000",
      "5549999990000",
      "049999990000",
    ]);
  });

  it("número curto demais não busca nada", () => {
    expect(formasDoTelefone("9999")).toEqual([]);
  });
});
