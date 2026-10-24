import { describe, expect, it } from "vitest";
import { agregar, agrupar, dividirCentavos, normalizarParaBusca } from "./analise";
import {
  analisarDespesas,
  MESES_NO_AGRUPAMENTO,
  mesesDoIntervalo,
  mesesEquivalentes,
  selecionarDespesas,
  type DespesaParaAnalise,
  type RecorteDeDespesas,
} from "./analise-de-despesas";
import { despesaDoMes, proLaboreDoMes, type GastoApurado } from "./financeiro";

// Dias gravados como o formulário grava: meia-noite UTC do dia digitado.
const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);
let n = 0;
function despesa(p: Partial<DespesaParaAnalise> & Pick<DespesaParaAnalise, "valor" | "natureza">): DespesaParaAnalise {
  n += 1;
  return { id: `g${n}`, descricao: `Lançamento ${n}`, pagoEm: null, venceEm: null, categoria: null, fornecedor: null, ...p };
}

const HOJE = "2026-10-21";
const base: DespesaParaAnalise[] = [
  despesa({ valor: 120.1, natureza: "CUSTEIO", fornecedor: "Meta Ads", pagoEm: dia("2026-10-01") }),
  despesa({ valor: 99.95, natureza: "CUSTEIO", fornecedor: "META ADS ", pagoEm: dia("2026-10-21") }),
  despesa({ valor: 300, natureza: "CONSUMO", fornecedor: "Loja de Balões", pagoEm: dia("2026-10-10") }),
  despesa({ valor: 45.5, natureza: "CONSUMO", fornecedor: "Papelaria", pagoEm: dia("2026-09-30") }),
  despesa({ valor: 1234.56, natureza: "PRO_LABORE", pagoEm: dia("2026-10-05") }),
  despesa({ valor: 800, natureza: "ACERVO", fornecedor: "Atacado", pagoEm: dia("2026-10-15") }),
  // Marcado como pago com data futura: não é realizado ainda.
  despesa({ valor: 70, natureza: "CUSTEIO", fornecedor: "Meta Ads", pagoEm: dia("2026-10-25") }),
  // A pagar: vencido, a vencer no mês, a vencer no mês seguinte, sem vencimento.
  despesa({ valor: 50, natureza: "CUSTEIO", fornecedor: "Meta Ads", venceEm: dia("2026-10-20") }),
  despesa({ valor: 60, natureza: "CONSUMO", venceEm: dia("2026-10-28") }),
  despesa({ valor: 65, natureza: "CONSUMO", venceEm: dia("2026-11-03") }),
  despesa({ valor: 15, natureza: "CONSUMO" }),
  // Dívida de setembro ainda não paga.
  despesa({ valor: 30, natureza: "CONSUMO", venceEm: dia("2026-09-28") }),
];

const outubro = (extra: Partial<RecorteDeDespesas> = {}): RecorteDeDespesas => ({
  de: "2026-10-01",
  ate: "2026-10-31",
  hoje: HOJE,
  situacao: "PAGO",
  naturezas: null,
  ...extra,
});

describe("núcleo de agregação", () => {
  it("soma, conta, média ao centavo, maior e menor", () => {
    const a = agregar([{ centavos: 1001 }, { centavos: 2000 }, { centavos: 1 }]);
    expect(a).toMatchObject({ totalCentavos: 3002, quantidade: 3, mediaCentavos: 1001 });
    expect(a.maior?.centavos).toBe(2000);
    expect(a.menor?.centavos).toBe(1);
    expect(agregar([]).mediaCentavos).toBeNull();
  });

  it("meio centavo arredonda para longe do zero", () => {
    expect(dividirCentavos(5, 2)).toBe(3);
    expect(dividirCentavos(-5, 2)).toBe(-3);
    expect(dividirCentavos(10, 3)).toBe(3);
  });

  it("recusa valor fora de centavos inteiros", () => {
    expect(() => agregar([{ centavos: 10.5 }])).toThrow();
  });

  it("agrupar: maiores grupos + outros fecham com o total", () => {
    const itens = [5, 4, 3, 2, 1].flatMap((v, i) => [{ centavos: v * 100, k: `g${i}` }, { centavos: v, k: `g${i}` }]);
    const { grupos, outros } = agrupar(itens, (x) => x.k, 2);
    expect(grupos.map((g) => g.chave)).toEqual(["g0", "g1"]);
    const soma = grupos.reduce((s, g) => s + g.totalCentavos, 0) + (outros?.totalCentavos ?? 0);
    expect(soma).toBe(agregar(itens).totalCentavos);
    expect(outros).toMatchObject({ grupos: 3, quantidade: 6 });
  });

  it("normalização para busca não muda o nome, só a chave", () => {
    expect(normalizarParaBusca("  META  ADS ")).toBe("meta ads");
    expect(normalizarParaBusca("Meta-Ads")).toBe("meta ads");
    expect(normalizarParaBusca("Balões & Cia.")).toBe("baloes cia");
  });
});

describe("seleção de despesas", () => {
  it("pago: pela data do pagamento, só até hoje; o lançamento com data futura fica à parte", () => {
    const s = selecionarDespesas(base, outubro());
    expect(s.principais.map((l) => l.valor).sort((a, b) => a - b)).toEqual([99.95, 120.1, 300, 800, 1234.56]);
    expect(s.pagasComDataFutura.map((l) => l.valor)).toEqual([70]);
    expect(s.aPagarSemVencimento).toEqual([]);
  });

  it("a pagar: pelo vencimento no período inteiro (inclusive depois de hoje); sem vencimento à parte", () => {
    const s = selecionarDespesas(base, outubro({ situacao: "A_PAGAR" }));
    expect(s.principais.map((l) => l.valor).sort((a, b) => a - b)).toEqual([50, 60]);
    expect(s.principais.find((l) => l.valor === 50)?.vencida).toBe(true);
    expect(s.principais.find((l) => l.valor === 60)?.vencida).toBe(false);
    expect(s.aPagarSemVencimento.map((l) => l.valor)).toEqual([15]);
    // Vencida em setembro: não entra no "a pagar de outubro", vem separada.
    expect(s.vencidasAntesDoPeriodo.map((l) => l.valor)).toEqual([30]);
  });

  it("vencido: a pagar com vencimento antes de hoje", () => {
    expect(selecionarDespesas(base, outubro({ situacao: "VENCIDO" })).principais.map((l) => l.valor)).toEqual([50]);
  });

  it("todos: pago + a pagar, separados por situação", () => {
    const a = analisarDespesas(base, outubro({ situacao: "TODOS", naturezas: ["CONSUMO", "CUSTEIO"] }));
    expect(a.porSituacao.pago).toEqual({ totalCentavos: 12010 + 9995 + 30000, quantidade: 3 });
    expect(a.porSituacao.vencido).toEqual({ totalCentavos: 5000, quantidade: 1 });
    expect(a.porSituacao.aVencer).toEqual({ totalCentavos: 6000, quantidade: 1 });
    expect(a.agregado.totalCentavos).toBe(12010 + 9995 + 30000 + 5000 + 6000);
  });

  it("filtro de natureza é rigoroso; sem filtro, tudo vem separado por natureza", () => {
    const so = analisarDespesas(base, outubro({ naturezas: ["CONSUMO"] }));
    expect(so.porNatureza.map((g) => g.chave)).toEqual(["CONSUMO"]);
    const todas = analisarDespesas(base, outubro());
    expect(todas.porNatureza.map((g) => g.chave).sort()).toEqual(["ACERVO", "CONSUMO", "CUSTEIO", "PRO_LABORE"]);
    // Despesa operacional é só consumo + custeio: acervo e pró-labore não entram.
    expect(todas.despesaOperacional.totalCentavos).toBe(12010 + 9995 + 30000);
  });

  it("filtro extra (fornecedor resolvido por quem chama) e reconciliação: total = soma das linhas", () => {
    const meta = new Set(["meta ads"]);
    const a = analisarDespesas(base, outubro({ incluir: (d) => meta.has(normalizarParaBusca(d.fornecedor ?? "")) }));
    expect(a.agregado).toMatchObject({ totalCentavos: 22005, quantidade: 2 });
    expect(a.linhas.reduce((s, l) => s + l.centavos, 0)).toBe(a.agregado.totalCentavos);
    expect(a.foraDoTotal.pagasComDataFutura).toEqual({ totalCentavos: 7000, quantidade: 1 });
  });

  it("agrupamento por fornecedor junta grafias que só diferem em maiúsculas e espaços", () => {
    const a = analisarDespesas(base, outubro({ naturezas: ["CUSTEIO", "CONSUMO"] }), { agruparPor: "FORNECEDOR", limite: 5 });
    const meta = a.agrupado!.grupos.find((g) => g.chave === "meta ads");
    expect(meta).toEqual({ chave: "meta ads", totalCentavos: 22005, quantidade: 2 });
    const soma = a.agrupado!.grupos.reduce((s, g) => s + g.totalCentavos, 0) + (a.agrupado!.outros?.totalCentavos ?? 0);
    expect(soma).toBe(a.agregado.totalCentavos);
  });

  it("meses do calendário de um intervalo", () => {
    expect(mesesDoIntervalo("2026-08-01", "2026-10-21")).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(mesesDoIntervalo("2026-12-01", "2027-01-31")).toEqual(["2026-12", "2027-01"]);
    expect(mesesDoIntervalo("2026-11-15", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(mesesDoIntervalo("2026-10-02", "2026-10-01")).toEqual([]);
  });

  // Achado #7: a média dividia por todo mês tocado (11 dias ÷ 2; 90 dias ÷ 4).
  it("média mensal: total ÷ meses equivalentes (fração de dias de cada mês), só em PAGO", () => {
    expect(mesesEquivalentes("2026-07-01", "2026-09-30")).toBe(3);
    expect(mesesEquivalentes("2026-08-01", "2026-10-21")).toBeCloseTo(2 + 21 / 31, 12);
    expect(mesesEquivalentes("2026-09-25", "2026-10-05")).toBeCloseTo(6 / 30 + 5 / 31, 12);
    // "últimos 90 dias" em 21/10 (24/07 a 21/10): perto de 3 meses, não 4.
    expect(mesesEquivalentes("2026-07-24", "2026-10-21")).toBeCloseTo(8 / 31 + 2 + 21 / 31, 12);
    expect(mesesEquivalentes("2026-10-02", "2026-10-01")).toBe(0);

    const a = analisarDespesas(base, { de: "2026-08-01", ate: "2026-10-31", hoje: HOJE, situacao: "PAGO", naturezas: ["CONSUMO"] });
    expect(a.mesesEquivalentes).toBeCloseTo(2 + 21 / 31, 12);
    expect(a.mediaMensalCentavos).toBe(Math.round((4550 + 30000) / (2 + 21 / 31)));
  });

  it("média mensal: nula em período menor que um mês e fora de PAGO", () => {
    const curto = analisarDespesas(base, { de: "2026-09-25", ate: "2026-10-05", hoje: HOJE, situacao: "PAGO", naturezas: null });
    expect(curto.agregado.quantidade).toBeGreaterThan(0);
    expect(curto.mediaMensalCentavos).toBeNull();
    // Vencido "este trimestre" em outubro: o vencido para em hoje; não há ritmo mensal a dividir.
    const vencido = analisarDespesas(base, { de: "2026-10-01", ate: "2026-12-31", hoje: HOJE, situacao: "VENCIDO", naturezas: null });
    expect(vencido.agregado.quantidade).toBe(1);
    expect(vencido.mesesEquivalentes).toBe(0);
    expect(vencido.mediaMensalCentavos).toBeNull();
  });

  it("período futuro: nada realizado", () => {
    const a = analisarDespesas(base, { de: "2026-11-01", ate: "2026-11-30", hoje: HOJE, situacao: "PAGO", naturezas: null });
    expect(a.agregado.quantidade).toBe(0);
    expect(a.mesesEquivalentes).toBe(0);
    expect(a.mediaMensalCentavos).toBeNull();
  });

  // Achado #2: conta que vence antes do período, mas depois de hoje, não é dívida vencida.
  it("período futuro a pagar: só o que já venceu aparece como vencido antes do período", () => {
    const s = selecionarDespesas(base, { de: "2026-11-01", ate: "2026-11-30", hoje: HOJE, situacao: "A_PAGAR", naturezas: null });
    expect(s.principais.map((l) => l.valor)).toEqual([65]);
    // 50 (venceu 20/10) e 30 (venceu 28/09) estão vencidas; 60 vence 28/10, depois de hoje: não entra.
    expect(s.vencidasAntesDoPeriodo.map((l) => l.valor).sort((a, b) => a - b)).toEqual([30, 50]);
    expect(s.vencidasAntesDoPeriodo.every((l) => l.vencida)).toBe(true);
  });

  // Achado extra (revisão): o agrupamento por mês reusava o ranking por valor.
  it("agrupamento por mês: ordem do calendário, todos os meses (com zero), sem 'outros' por valor", () => {
    const a = analisarDespesas(base, { de: "2026-08-01", ate: "2026-10-31", hoje: HOJE, situacao: "PAGO", naturezas: null }, { agruparPor: "MES", limite: 1 });
    expect(a.agrupado!.grupos.map((g) => g.chave)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(a.agrupado!.grupos[0]).toEqual({ chave: "2026-08", totalCentavos: 0, quantidade: 0 });
    expect(a.agrupado!.grupos[1]).toEqual({ chave: "2026-09", totalCentavos: 4550, quantidade: 1 });
    expect(a.agrupado!.outros).toBeNull();
    expect(a.agrupado!.grupos.reduce((s, g) => s + g.totalCentavos, 0)).toBe(a.agregado.totalCentavos);
  });

  // Revisão 2: vencido por mês não lista meses futuros, que não podem ter vencido.
  it("agrupamento por mês do vencido para no mês de hoje", () => {
    const a = analisarDespesas(base, { de: "2026-10-01", ate: "2026-12-31", hoje: HOJE, situacao: "VENCIDO", naturezas: null }, { agruparPor: "MES" });
    expect(a.agrupado!.grupos).toEqual([{ chave: "2026-10", totalCentavos: 5000, quantidade: 1 }]);
    const aPagar = analisarDespesas(base, { de: "2026-10-01", ate: "2026-12-31", hoje: HOJE, situacao: "A_PAGAR", naturezas: null }, { agruparPor: "MES" });
    expect(aPagar.agrupado!.grupos.map((g) => g.chave)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("agrupamento por mês acima do teto: os meses mais antigos somam em 'outros' e tudo fecha com o total", () => {
    const a = analisarDespesas(base, { de: "2024-05-01", ate: "2026-10-31", hoje: HOJE, situacao: "PAGO", naturezas: null }, { agruparPor: "MES" });
    expect(a.agrupado!.grupos).toHaveLength(MESES_NO_AGRUPAMENTO);
    expect(a.agrupado!.grupos[0].chave).toBe("2024-11");
    expect(a.agrupado!.grupos.at(-1)!.chave).toBe("2026-10");
    expect(a.agrupado!.outros).toEqual({ totalCentavos: 0, quantidade: 0, grupos: 6 });
    expect(a.agrupado!.grupos.reduce((s, g) => s + g.totalCentavos, 0) + a.agrupado!.outros!.totalCentavos).toBe(a.agregado.totalCentavos);
  });
});

describe("reconciliação com o Financeiro", () => {
  const apurados: GastoApurado[] = base.map((d) => ({ valor: d.valor, natureza: d.natureza, pagoEm: d.pagoEm }));

  it("mês encerrado: consumo + custeio pagos = despesaDoMes do Resultado Operacional", () => {
    const setembro = analisarDespesas(base, { de: "2026-09-01", ate: "2026-09-30", hoje: HOJE, situacao: "PAGO", naturezas: ["CONSUMO", "CUSTEIO"] });
    expect(setembro.agregado.totalCentavos / 100).toBe(despesaDoMes(apurados, "2026-09"));
  });

  it("mês em andamento: realizado + pagos com data futura = despesaDoMes (a diferença é dita, não escondida)", () => {
    const a = analisarDespesas(base, outubro({ naturezas: ["CONSUMO", "CUSTEIO"] }));
    expect((a.agregado.totalCentavos + a.foraDoTotal.pagasComDataFutura.totalCentavos) / 100).toBe(despesaDoMes(apurados, "2026-10"));
  });

  it("pró-labore: igual ao proLaboreDoMes", () => {
    const a = analisarDespesas(base, outubro({ naturezas: ["PRO_LABORE"] }));
    expect(a.agregado.totalCentavos / 100).toBe(proLaboreDoMes(apurados, "2026-10"));
  });

  it("dia 1º não cai no mês anterior (data gravada à meia-noite UTC, lida como o dia gravado)", () => {
    const a = analisarDespesas(base, outubro({ incluir: (d) => d.valor === 120.1 }));
    expect(a.agregado.quantidade).toBe(1);
    expect(a.linhas[0].dia).toBe("2026-10-01");
  });
});
