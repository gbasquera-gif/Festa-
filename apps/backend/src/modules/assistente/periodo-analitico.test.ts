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

// ---------------------------------------------------------------- regressões da revisão (Entrega B)

describe("períodos — regressões da revisão", () => {
  const outubroAteHoje = { de: "2026-10-01", ate: "2026-10-21", rotulo: "outubro de 2026, até 21/10/2026" };

  it("#4 'último mês' é o mês passado completo, igual a interpretarPeriodo e a 'último trimestre'", () => {
    expect(p("último mês")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(p("no último mês")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(p("ultimo mes completo")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(p("último mês", new Date("2026-01-15T15:00:00Z"))).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    // "Últimos N meses" continua com o mês atual até hoje.
    expect(p("últimos 2 meses")).toEqual({ de: "2026-09-01", ate: "2026-10-21" });
  });

  it("#5 'mesmo período de 2024' volta até o ano escrito, não um ano só", () => {
    const r = interpretarComparacao("mesmo período de 2024", outubroAteHoje, AGORA);
    expect(r).toMatchObject({ ok: true, periodo: { de: "2024-10-01", ate: "2024-10-21", rotulo: "mesmo período de 2024 (01/10/2024 a 21/10/2024)" } });
    expect(interpretarComparacao("mesmo periodo do ano de 2025", outubroAteHoje, AGORA)).toMatchObject({ ok: true, periodo: { de: "2025-10-01" } });
    // Ano igual ou depois do principal: erro claro, sem período invertido.
    expect(interpretarComparacao("mesmo período de 2026", outubroAteHoje, AGORA)).toMatchObject({ ok: false });
    expect(interpretarComparacao("mesmo período de 2027", outubroAteHoje, AGORA)).toMatchObject({ ok: false });
    // 29/02 vira 28/02 no ano sem dia 29.
    expect(interpretarComparacao("mesmo período de 2023", { de: "2024-02-01", ate: "2024-02-29", rotulo: "" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2023-02-01", ate: "2023-02-28" },
    });
    // Revisão 2: principal que atravessa o ano conta pelo ano do fim — dez/2025–jan/2026 "de 2025" é dez/2024–jan/2025.
    expect(interpretarComparacao("mesmo período de 2025", { de: "2025-12-01", ate: "2026-01-31", rotulo: "" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2024-12-01", ate: "2025-01-31" },
    });
    // Principal que atravessa o ano: o rótulo diz os dois anos.
    expect(interpretarComparacao("mesmo período do ano anterior", { de: "2025-12-01", ate: "2026-01-31", rotulo: "" }, AGORA)).toMatchObject({
      ok: true,
      periodo: { de: "2024-12-01", ate: "2025-01-31", rotulo: "mesmo período de 2024/2025 (01/12/2024 a 31/01/2025)" },
    });
  });

  it("#10 comparação com 'com o'/'com' na frente: o resto é lido como período", () => {
    expect(interpretarComparacao("com o mês passado", outubroAteHoje, AGORA)).toMatchObject({ ok: true, periodo: { de: "2026-09-01", ate: "2026-09-30" } });
    expect(interpretarComparacao("com setembro", outubroAteHoje, AGORA)).toMatchObject({ ok: true, periodo: { de: "2026-09-01", ate: "2026-09-30" } });
    expect(interpretarComparacao("com o mês anterior", outubroAteHoje, AGORA)).toMatchObject({ ok: true, periodo: { de: "2026-09-01", ate: "2026-09-30" } });
    expect(interpretarComparacao("com o período sem nome", outubroAteHoje, AGORA)).toMatchObject({ ok: false });
  });

  it("#11 ano escrito numa só ponta do intervalo vale para as duas", () => {
    expect(p("de agosto a outubro de 2025")).toEqual({ de: "2025-08-01", ate: "2025-10-31" });
    expect(p("de 01/09 a 15/10/2025")).toEqual({ de: "2025-09-01", ate: "2025-10-15" });
    // Início que passaria do fim no mesmo ano: é do ano anterior.
    expect(p("de novembro a fevereiro de 2026")).toEqual({ de: "2025-11-01", ate: "2026-02-28" });
    // Ano só no início: o fim é do mesmo ano (ou do seguinte, se vier antes).
    expect(p("de agosto de 2025 a outubro")).toEqual({ de: "2025-08-01", ate: "2025-10-31" });
    expect(p("de novembro de 2025 a fevereiro")).toEqual({ de: "2025-11-01", ate: "2026-02-28" });
    // Sem ano nenhum, continua o ano atual; com os dois anos, vale o que foi escrito.
    expect(p("de 01/09 a 15/10")).toEqual({ de: "2026-09-01", ate: "2026-10-15" });
    expect(p("de agosto de 2024 a outubro de 2025")).toEqual({ de: "2024-08-01", ate: "2025-10-31" });
    expect(p("de setembro até hoje")).toEqual({ de: "2026-09-01", ate: "2026-10-21" });
  });
});

describe("períodos — revisão 3", () => {
  it("'último mês até hoje' é ambíguo: limitação clara, sem esticar o mês passado até hoje", () => {
    for (const e of ["último mês até hoje", "ultimo mes ate agora", "o último mês até agora"]) {
      const r = interpretarPeriodoDeAnalise(e, AGORA);
      expect(r.ok, e).toBe(false);
    }
    expect(p("este mês até hoje")).toEqual({ de: "2026-10-01", ate: "2026-10-21" });
    // "Desde o último mês" diz o começo sem ambiguidade: do mês passado até hoje.
    expect(p("desde o último mês")).toEqual({ de: "2026-09-01", ate: "2026-10-21" });
  });

  it("'mesmo período de AAAA' conta pelo ano do fim pedido, não do fim cortado em hoje", () => {
    // Pedido dez/2025–jan/2026 em 10/12/2025: o pago vai até 10/12/2025, mas o ano de referência é 2026.
    const efetivo = { de: "2025-12-01", ate: "2025-12-10", rotulo: "" };
    expect(interpretarComparacao("mesmo período de 2025", efetivo, new Date("2025-12-10T15:00:00Z"), "2026-01-31")).toMatchObject({
      ok: true,
      periodo: { de: "2024-12-01", ate: "2024-12-10" },
    });
  });
});
