import { describe, expect, it } from "vitest";
import { tratamentoNoLog } from "./reservations.service";

describe("log do cancelamento", () => {
  it("diz as partes do tratamento, sem valores", () => {
    const texto = tratamentoNoLog({ credito: 200, reembolso: 50.5, retencao: 30 });
    expect(texto).toBe("tratamento crédito + reembolso + retenção");
    expect(texto).not.toMatch(/\d/);
  });

  it("só as partes com valor", () => {
    expect(tratamentoNoLog({ credito: 0, reembolso: 120, retencao: 0 })).toBe("tratamento reembolso");
  });

  it("cancelamento sem nada recebido: diz que não havia o que tratar (antes saía 'tratamento .')", () => {
    expect(tratamentoNoLog({ credito: 0, reembolso: 0, retencao: 0 })).toBe("sem valores a tratar");
  });
});
