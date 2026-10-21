import { describe, expect, it } from "vitest";
import { interpretarComparacao, interpretarPeriodoDeAnalise, umAnoAntes } from "./periodo-analitico";

// 21/10/2026, meio-dia em Chapecó.
const AGORA = new Date("2026-10-21T15:00:00Z");
const p = (e: string, agora = AGORA) => {
  const r = interpretarPeriodoDeAnalise(e, agora);
  if (!r.ok) throw new Error(r.erro);
  return { de: r.periodo.de, ate: r.periodo.ate };
};

describe("períodos das análises (regras da gestão)", () => {
  it("últimos 3 meses: o atual e os dois anteriores, até hoje", () => {
    expect(p("últimos 3 meses")).toEqual({ de: "2026-08-01", ate: "2026-10-21" });
    expect(p("nos últimos três meses")).toEqual({ de: "2026-08-01", ate: "2026-10-21" });
  });

  it("últimos 3 meses completos: julho, agosto e setembro", () => {
    expect(p("últimos 3 meses completos")).toEqual({ de: "2026-07-01", ate: "2026-09-30" });
    expect(p("ultimos 12 meses completos")).toEqual({ de: "2025-10-01", ate: "2026-09-30" });
  });

  it("últimos 90 dias: janela móvel terminando hoje", () => {
    expect(p("últimos 90 dias")).toEqual({ de: "2026-07-24", ate: "2026-10-21" });
  });

  it("este mês e este trimestre: o calendário inteiro (a análise corta o realizado em hoje)", () => {
    expect(p("este mês")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(p("neste trimestre")).toEqual({ de: "2026-10-01", ate: "2026-12-31" });
    expect(p("trimestre passado")).toEqual({ de: "2026-07-01", ate: "2026-09-30" });
    expect(p("1º trimestre de 2026")).toEqual({ de: "2026-01-01", ate: "2026-03-31" });
  });

  it("até agora: corta em hoje", () => {
    expect(p("este mês até agora")).toEqual({ de: "2026-10-01", ate: "2026-10-21" });
    expect(p("outubro de 2026 até hoje")).toEqual({ de: "2026-10-01", ate: "2026-10-21" });
    expect(p("este trimestre até agora")).toEqual({ de: "2026-10-01", ate: "2026-10-21" });
    expect(p("setembro até hoje")).toEqual({ de: "2026-09-01", ate: "2026-10-21" });
    expect(p("desde agosto")).toEqual({ de: "2026-08-01", ate: "2026-10-21" });
    expect(p("até hoje").ate).toBe("2026-10-21");
    expect(interpretarPeriodoDeAnalise("novembro até agora", AGORA).ok).toBe(false);
  });

  it("mês passado: o anterior completo; comuns continuam iguais", () => {
    expect(p("mês passado")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(p("outubro")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(p("este ano")).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(p("ontem")).toEqual({ de: "2026-10-20", ate: "2026-10-20" });
  });

  it("intervalos escolhidos", () => {
    expect(p("de 01/09 a 15/10")).toEqual({ de: "2026-09-01", ate: "2026-10-15" });
    expect(p("entre setembro e outubro")).toEqual({ de: "2026-09-01", ate: "2026-10-31" });
    expect(interpretarPeriodoDeAnalise("de 15/10 a 01/09", AGORA)).toMatchObject({ ok: false, erro: expect.stringContaining("fim vem antes") });
  });

  it("fuso de Chapecó: 23h30 de 31/10 ainda é outubro", () => {
    const quaseMeiaNoite = new Date("2026-11-01T02:30:00Z");
    expect(p("este mês até agora", quaseMeiaNoite)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(p("hoje", quaseMeiaNoite)).toEqual({ de: "2026-10-31", ate: "2026-10-31" });
  });

  it("períodos inválidos: erro claro, sem chute", () => {
    for (const e of ["últimos 0 meses", "últimos 99 meses", "anteontem de tarde", "", "quinto trimestre"]) {
      const r = interpretarPeriodoDeAnalise(e, AGORA);
      expect(r.ok, e).toBe(false);
    }
  });
});

describe("comparação", () => {
  const outubroAteHoje = { de: "2026-10-01", ate: "2026-10-21", rotulo: "outubro de 2026, até 21/10/2026" };

  it("mesmo período do ano anterior: os mesmos limites, um ano antes", () => {
    const r = interpretarComparacao("mesmo período do ano anterior", outubroAteHoje, AGORA);
    expect(r).toMatchObject({ ok: true, periodo: { de: "2025-10-01", ate: "2025-10-21" } });
    expect(umAnoAntes("2028-02-29")).toBe("2027-02-28");
  });

  it("mês anterior: relativo ao período principal", () => {
    expect(interpretarComparacao("mês anterior", { de: "2026-09-01", ate: "2026-09-30", rotulo: "setembro" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2026-08-01", ate: "2026-08-31" },
    });
  });

  it("período anterior: o bloco de mesmo tamanho logo antes", () => {
    expect(interpretarComparacao("período anterior", { de: "2026-08-01", ate: "2026-10-31", rotulo: "" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2026-05-01", ate: "2026-07-31" },
    });
    expect(interpretarComparacao("período anterior", { de: "2026-07-24", ate: "2026-10-21", rotulo: "" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2026-04-25", ate: "2026-07-23" },
    });
  });

  it("qualquer outra expressão é resolvida por si", () => {
    expect(interpretarComparacao("setembro", outubroAteHoje, AGORA)).toMatchObject({ ok: true, periodo: { de: "2026-09-01", ate: "2026-09-30" } });
  });
});
