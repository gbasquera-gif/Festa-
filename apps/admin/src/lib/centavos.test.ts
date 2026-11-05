import { describe, expect, it } from "vitest";
import { brl } from "@/components/financeiro/formato";
import { centavosEmReais } from "./centavos";

describe("centavos para exibição", () => {
  it("zero negativo aparece como R$ 0,00", () => {
    expect(Object.is(centavosEmReais(-0), 0)).toBe(true);
    expect(brl(centavosEmReais(-0))).toBe(brl(0));
    expect(brl(centavosEmReais(-0))).not.toContain("-");
  });

  it("zero positivo continua R$ 0,00", () => {
    expect(Object.is(centavosEmReais(0), 0)).toBe(true);
    expect(brl(centavosEmReais(0))).toBe(brl(0));
  });

  it("os outros valores não mudam", () => {
    expect(centavosEmReais(869)).toBe(8.69);
    expect(brl(centavosEmReais(-150))).toBe(brl(-1.5));
    expect(brl(centavosEmReais(-1))).toBe(brl(-0.01));
    expect(brl(centavosEmReais(416913))).toBe(brl(4169.13));
  });
});
