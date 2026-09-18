import { describe, expect, it } from "vitest";
import { filtroDeGastos, intervaloDoMes } from "./periodo";

describe("intervaloDoMes", () => {
  it("vai do primeiro dia ao primeiro dia do mês seguinte", () => {
    const { de, ate } = intervaloDoMes("2026-09");
    expect(de.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(ate.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("vira o ano em dezembro", () => {
    const { de, ate } = intervaloDoMes("2026-12");
    expect(de.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(ate.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("o fim é exclusivo, então 31/12 entra e 01/01 não", () => {
    const { de, ate } = intervaloDoMes("2026-12");
    const ultimoInstante = new Date("2026-12-31T23:59:59.999Z");
    expect(ultimoInstante >= de && ultimoInstante < ate).toBe(true);
    expect(new Date("2027-01-01T00:00:00.000Z") < ate).toBe(false);
  });
});

describe("filtroDeGastos", () => {
  it("sem filtro nenhum, devolve tudo", () => {
    expect(filtroDeGastos({})).toEqual({});
  });

  it("aceita uma natureza só — é a aba Aportes", () => {
    expect(filtroDeGastos({ natureza: "ACERVO" })).toEqual({ natureza: "ACERVO" });
  });

  it("aceita lista — é a aba Despesas, que soma consumo e custeio", () => {
    expect(filtroDeGastos({ natureza: ["CONSUMO", "CUSTEIO"] })).toEqual({
      natureza: { in: ["CONSUMO", "CUSTEIO"] },
    });
  });

  it("o mês alcança o que foi pago e o que vence sem ter sido pago", () => {
    // Sem o segundo ramo, uma conta a pagar só apareceria no mês em que fosse
    // quitada — e a lista de contas a pagar ficaria permanentemente vazia.
    const where = filtroDeGastos({ mes: "2026-09" }) as { OR: unknown[] };
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({
      pagoEm: { gte: new Date("2026-09-01T00:00:00.000Z"), lt: new Date("2026-10-01T00:00:00.000Z") },
    });
    expect(where.OR[1]).toMatchObject({ pagoEm: null });
  });

  it("combina mês e natureza sem um apagar o outro", () => {
    const where = filtroDeGastos({ mes: "2026-09", natureza: "ACERVO" });
    expect(where).toHaveProperty("natureza", "ACERVO");
    expect(where).toHaveProperty("OR");
  });
});
