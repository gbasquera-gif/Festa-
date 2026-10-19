import { describe, expect, it } from "vitest";
import { encontrarPeriodoNoTexto, interpretarPeriodo, situacaoDoPeriodo } from "./periodo";

// Segunda-feira, 19/10/2026, 15h em Chapecó.
const AGORA = new Date("2026-10-19T18:00:00Z");
// Sábado, 24/10/2026, à noite em Chapecó (já é domingo em UTC).
const SABADO_A_NOITE = new Date("2026-10-25T01:30:00Z");

function resolver(expressao: string, agora = AGORA) {
  const r = interpretarPeriodo(expressao, agora);
  if (!r.ok) throw new Error(r.erro);
  return r.periodo;
}

describe("interpretarPeriodo", () => {
  it("dias relativos no relógio de Chapecó", () => {
    expect(resolver("hoje")).toMatchObject({ tipo: "DIA", de: "2026-10-19", ate: "2026-10-19" });
    expect(resolver("amanhã")).toMatchObject({ de: "2026-10-20", rotulo: "terça-feira, 20/10/2026" });
    expect(resolver("depois de amanhã").de).toBe("2026-10-21");
    expect(resolver("ontem").de).toBe("2026-10-18");
    // 22h30 de sábado em Chapecó ainda é sábado, mesmo já sendo domingo em UTC.
    expect(resolver("hoje", SABADO_A_NOITE).de).toBe("2026-10-24");
    expect(resolver("amanhã", SABADO_A_NOITE).de).toBe("2026-10-25");
  });

  it("dia da semana: o próximo, e 'próximo' num sábado pula uma semana", () => {
    expect(resolver("sábado").de).toBe("2026-10-24");
    expect(resolver("próximo sábado").de).toBe("2026-10-24");
    expect(resolver("sexta-feira").de).toBe("2026-10-23");
    expect(resolver("segunda").de).toBe("2026-10-19");
    expect(resolver("próxima segunda").de).toBe("2026-10-26");
    expect(resolver("este sábado", SABADO_A_NOITE).de).toBe("2026-10-24");
    expect(resolver("próximo sábado", SABADO_A_NOITE).de).toBe("2026-10-31");
    expect(resolver("sábado que vem", SABADO_A_NOITE).de).toBe("2026-10-31");
  });

  it("semanas e fim de semana", () => {
    expect(resolver("esta semana")).toMatchObject({ tipo: "INTERVALO", de: "2026-10-19", ate: "2026-10-25" });
    expect(resolver("semana que vem")).toMatchObject({ de: "2026-10-26", ate: "2026-11-01", meses: ["2026-10", "2026-11"] });
    expect(resolver("semana passada")).toMatchObject({ de: "2026-10-12", ate: "2026-10-18" });
    expect(resolver("fim de semana")).toMatchObject({ de: "2026-10-24", ate: "2026-10-25" });
    expect(resolver("fim de semana", SABADO_A_NOITE)).toMatchObject({ de: "2026-10-24", ate: "2026-10-25" });
  });

  it("meses relativos e virada de ano", () => {
    expect(resolver("este mês")).toMatchObject({ tipo: "MES", de: "2026-10-01", ate: "2026-10-31", rotulo: "outubro de 2026" });
    expect(resolver("neste mês").de).toBe("2026-10-01");
    expect(resolver("mês passado")).toMatchObject({ de: "2026-09-01", ate: "2026-09-30" });
    expect(resolver("mês que vem")).toMatchObject({ de: "2026-11-01", ate: "2026-11-30" });
    const janeiro = new Date("2027-01-10T15:00:00Z");
    expect(resolver("mês passado", janeiro)).toMatchObject({ de: "2026-12-01", rotulo: "dezembro de 2026" });
    const dezembro = new Date("2026-12-10T15:00:00Z");
    expect(resolver("próximo mês", dezembro)).toMatchObject({ de: "2027-01-01", rotulo: "janeiro de 2027" });
  });

  it("nome do mês: ano corrente, com aviso quando já passou", () => {
    const novembro = resolver("novembro");
    expect(novembro).toMatchObject({ de: "2026-11-01", ate: "2026-11-30", rotulo: "novembro de 2026" });
    expect(novembro.observacao).toBeUndefined();
    const janeiro = resolver("janeiro");
    expect(janeiro.de).toBe("2026-01-01");
    expect(janeiro.observacao).toContain("janeiro de 2027");
    expect(resolver("fevereiro de 2027")).toMatchObject({ de: "2027-02-01", ate: "2027-02-28" });
    expect(resolver("em março")).toMatchObject({ de: "2026-03-01" });
    expect(resolver("2026-09")).toMatchObject({ tipo: "MES", rotulo: "setembro de 2026" });
    expect(resolver("11/2026").de).toBe("2026-11-01");
  });

  it("datas digitadas e faladas", () => {
    expect(resolver("14/11")).toMatchObject({ tipo: "DIA", de: "2026-11-14", rotulo: "sábado, 14/11/2026" });
    expect(resolver("dia 14/11").de).toBe("2026-11-14");
    expect(resolver("no dia 14/11").de).toBe("2026-11-14");
    expect(resolver("14/11/2027").de).toBe("2027-11-14");
    expect(resolver("14/11/27").de).toBe("2027-11-14");
    expect(resolver("14 de novembro").de).toBe("2026-11-14");
    expect(resolver("dia 14 de novembro de 2027").de).toBe("2027-11-14");
    expect(resolver("2026-11-14").de).toBe("2026-11-14");
    expect(resolver("dia 25").de).toBe("2026-10-25");
    expect(resolver("dia 5").observacao).toContain("já passou");
    expect(resolver("05/03").observacao).toContain("2027");
  });

  it("anos", () => {
    expect(resolver("este ano")).toMatchObject({ tipo: "ANO", de: "2026-01-01", ate: "2026-12-31" });
    expect(resolver("ano passado").rotulo).toBe("2025");
    expect(resolver("2027").meses).toHaveLength(12);
  });

  it("recusa o que não é data, em vez de adivinhar", () => {
    expect(interpretarPeriodo("31/02", AGORA).ok).toBe(false);
    expect(interpretarPeriodo("dia 31", new Date("2026-11-10T15:00:00Z")).ok).toBe(false);
    expect(interpretarPeriodo("quando der", AGORA).ok).toBe(false);
    expect(interpretarPeriodo("", AGORA).ok).toBe(false);
  });
});

describe("situacaoDoPeriodo", () => {
  it("encerrado, em andamento e futuro", () => {
    expect(situacaoDoPeriodo(resolver("mês passado"), AGORA)).toBe("ENCERRADO");
    expect(situacaoDoPeriodo(resolver("este mês"), AGORA)).toBe("EM_ANDAMENTO");
    expect(situacaoDoPeriodo(resolver("novembro"), AGORA)).toBe("FUTURO");
    expect(situacaoDoPeriodo(resolver("hoje"), AGORA)).toBe("EM_ANDAMENTO");
  });
});

describe("encontrarPeriodoNoTexto", () => {
  it("acha a expressão dentro da pergunta", () => {
    expect(encontrarPeriodoNoTexto("Quantas festas temos em novembro?")).toBe("novembro");
    expect(encontrarPeriodoNoTexto("Temos alguma festa no dia 14/11?")).toBe("dia 14/11");
    expect(encontrarPeriodoNoTexto("Quais festas estão previstas para amanhã?")).toBe("amanha");
    expect(encontrarPeriodoNoTexto("e depois de amanhã?")).toBe("depois de amanha");
    expect(encontrarPeriodoNoTexto("Qual o faturamento de outubro de 2026?")).toBe("outubro de 2026");
    expect(encontrarPeriodoNoTexto("Quanto recebemos de pagamentos neste mês?")).toBe("neste mes");
    expect(encontrarPeriodoNoTexto("Quantas festas no próximo sábado?")).toBe("proximo sabado");
    expect(encontrarPeriodoNoTexto("resultado do mês passado")).toBe("mes passado");
    expect(encontrarPeriodoNoTexto("Quanto temos a receber?")).toBeNull();
  });
});
