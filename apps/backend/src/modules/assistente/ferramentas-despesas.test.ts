import { describe, expect, it, vi } from "vitest";
import { despesaDoMes, type DespesaParaAnalise, type NaturezaDoGasto } from "@festae/shared";
import { lerConfiguracao } from "./configuracao";
import { MetricasDoAssistente } from "./controle";
import { MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA, type EntradaDoAssistente } from "./contrato";
import { ferramentasDoPapel, type ServicosDoAssistente } from "./ferramentas";
import { consultarDespesas } from "./ferramentas-despesas";
import { conteudoParaModelo, NucleoDoAssistente, valoresConferem } from "./nucleo";
import type { ChamadaDeFerramenta, MensagemDoModelo, PassoDoModelo, ProvedorDeIA } from "./provedor";
import { ProvedorSimulado } from "./provedor-simulado";
import { Pseudonimos } from "./pseudonimos";

// 21/10/2026, meio-dia em Chapecó. Lançamentos fictícios e controlados.
const AGORA = new Date("2026-10-21T15:00:00Z");
const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);
let n = 0;
function g(valor: number, natureza: NaturezaDoGasto, extra: Partial<DespesaParaAnalise> = {}): DespesaParaAnalise {
  n += 1;
  return { id: `g${n}`, descricao: `Lançamento ${n}`, natureza, valor, pagoEm: null, venceEm: null, categoria: null, fornecedor: null, ...extra };
}
const DESPESAS: DespesaParaAnalise[] = [
  g(150, "CUSTEIO", { fornecedor: "Meta Ads", categoria: "Marketing", descricao: "Anúncios Instagram", pagoEm: dia("2026-10-03") }),
  g(99.9, "CUSTEIO", { fornecedor: "META ADS ", categoria: "marketing", descricao: "Impulsionamento", pagoEm: dia("2026-10-15") }),
  g(80, "CUSTEIO", { fornecedor: "Meta Ads", categoria: "Marketing", pagoEm: dia("2026-09-12") }),
  g(120, "CUSTEIO", { fornecedor: "Meta Ads", categoria: "Marketing", venceEm: dia("2026-10-25") }),
  g(50, "CUSTEIO", { fornecedor: "Meta Ads", categoria: "Marketing", pagoEm: dia("2026-10-28") }),
  g(1000, "CUSTEIO", { fornecedor: "Meta Imóveis", descricao: "Aluguel do depósito", pagoEm: dia("2026-10-05") }),
  g(60, "CUSTEIO", { fornecedor: "Facebook Ads", pagoEm: dia("2026-10-07") }),
  g(45.5, "CUSTEIO", { descricao: "Impulsionamento Google Ads outubro", pagoEm: dia("2026-10-09") }),
  g(300, "CONSUMO", { fornecedor: "Loja de Balões", pagoEm: dia("2026-10-10") }),
  g(200, "CONSUMO", { fornecedor: "Loja de Balões", pagoEm: dia("2026-09-20") }),
  g(100, "CONSUMO", { fornecedor: "Loja de Balões", pagoEm: dia("2026-08-15") }),
  g(35.25, "CONSUMO", { fornecedor: "Papelaria Central", pagoEm: dia("2026-10-12") }),
  g(40, "CONSUMO", { fornecedor: "Papelaria Central", venceEm: dia("2026-10-18") }),
  g(30, "CONSUMO", { fornecedor: "Gráfica Antiga", venceEm: dia("2026-09-28") }),
  g(1500, "PRO_LABORE", { pagoEm: dia("2026-10-05") }),
  g(800, "ACERVO", { fornecedor: "Atacado Festa", pagoEm: dia("2026-10-11") }),
];
const NOMES_DE_FORNECEDOR = ["Meta Ads", "META ADS", "Meta Imóveis", "Facebook Ads", "Loja de Balões", "Papelaria Central", "Gráfica Antiga", "Atacado Festa"];
const DESCRICOES = ["Anúncios Instagram", "Impulsionamento", "Aluguel do depósito", "Google Ads outubro"];

/** Como o serviço real: pagos no intervalo e todos os a pagar; nomes com contagem. Panorama do Financeiro para as perguntas mistas. */
function servicos(lista: DespesaParaAnalise[] = DESPESAS, falhar = false): ServicosDoAssistente {
  const contar = (campo: "fornecedor" | "categoria") => {
    const m = new Map<string, number>();
    for (const d of lista) if (d[campo]) m.set(d[campo]!, (m.get(d[campo]!) ?? 0) + 1);
    return [...m].map(([nome, lancamentos]) => ({ nome, lancamentos }));
  };
  return {
    financeiro: {
      panorama: vi.fn(async () => ({
        operacional: { faturamento: 1234.5, retencao: 0, despesas: 200, resultado: 1034.5, margem: 0.838 },
        caixa: { entradas: 900, reembolsos: 0, liquido: 900, reembolsosARealizar: 0 },
        creditoEmAberto: 150,
        ytd: { faturamento: 1, retencao: 0, despesas: 0, resultado: 1, margem: 1, acervo: 0 },
        aReceber: 3210,
        acervoAcumulado: 500,
        ticketMedio: 617.25,
        festasNoMes: 2,
        meta: null,
      })) as never,
      despesasPorNatureza: vi.fn(async (mes: string) => ({ mes, consumo: 120, custeio: 80, total: 200, acervo: 50, proLabore: 1500 })),
      despesasParaAnalise: vi.fn(async (de: string, ate: string) => {
        if (falhar) throw new Error("conexão recusada pelo banco: host interno, senha e detalhes");
        return lista.filter((d) => !d.pagoEm || (d.pagoEm.toISOString().slice(0, 10) >= de && d.pagoEm.toISOString().slice(0, 10) <= ate));
      }),
      nomesNasDespesas: vi.fn(async () => ({ fornecedores: contar("fornecedor"), categorias: contar("categoria") })),
    },
    retiradas: { listar: vi.fn() as never },
    comercial: { visaoGeral: vi.fn() as never },
    panoramaDeOrcamentos: { panorama: vi.fn() as never },
    orcamentos: { seguradoPorAprovadas: vi.fn() as never },
    acervo: { performance: vi.fn() as never },
    disponibilidade: { conflitosDeItens: vi.fn() as never },
    produtos: { findAll: vi.fn() as never },
    carteira: vi.fn(async () => []),
  };
}

type Dados = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/**
 * Chama a ferramenta como o núcleo chama. `d` é o que vai para a IA (com
 * códigos); `claro` é o mesmo com os nomes de volta, como a pessoa vê.
 */
async function consultar(args: Record<string, unknown>, opcoes: { papel?: "ADMIN" | "OPS"; lista?: DespesaParaAnalise[]; pseudonimos?: Pseudonimos } = {}) {
  const pseudonimos = opcoes.pseudonimos ?? new Pseudonimos();
  const validados = consultarDespesas.parametros.parse(args);
  const r = await consultarDespesas.executar(validados, { papel: opcoes.papel ?? "ADMIN", agora: AGORA, servicos: servicos(opcoes.lista), pseudonimos });
  const claro = JSON.parse(pseudonimos.revelar(JSON.stringify(r.dados))) as Dados;
  return { ...r, d: r.dados as Dados, claro, pseudonimos };
}

describe("consultarDespesas — cenários da homologação", () => {
  it("1. Meta Ads em outubro: soma exata e quantidade; grafias iguais juntas; futuro e a pagar fora", async () => {
    const { d, claro, tipo } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads" });
    expect(tipo).toBeUndefined();
    expect(d.resultado).toMatchObject({ total: "R$ 249,90", lancamentos: 2 });
    // "Meta Ads" e "META ADS " são o mesmo nome: um código só.
    expect(d.filtrosAplicados.fornecedor).toMatchObject({ campoUsado: "fornecedor", nomesConsiderados: ["[F1]"] });
    expect(claro.filtrosAplicados.fornecedor.nomesConsiderados).toEqual(["Meta Ads"]);
    expect(d.periodo).toMatchObject({ rotulo: "outubro de 2026, até 21/10/2026", consideradoAte: "21/10/2026" });
    expect(d.foraDoTotal.pagosComDataFutura).toMatchObject({ total: "R$ 50,00", lancamentos: 1 });
    expect(claro.resumo).toBe(
      "Outubro de 2026, até 21/10/2026: 2 lançamentos do fornecedor Meta Ads, total R$ 249,90 (pagos). " +
        "Maior: R$ 150,00 (03/10/2026); menor: R$ 99,90 (15/10/2026). " +
        "À parte, marcados como pagos com data depois de hoje: R$ 50,00 (1 lançamento).",
    );
  });

  it("2. natureza diferente da perguntada: nenhum total, e o aviso de onde estão", async () => {
    const { d, claro } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads", natureza: ["CONSUMO"] });
    expect(d.resultado).toBeUndefined();
    expect(d.semCorrespondencia.emOutrasNaturezas).toEqual([{ natureza: "custeio", lancamentos: 2 }]);
    expect(JSON.stringify(d)).not.toMatch(/R\$/);
    expect(claro.resumo).toContain("Não encontrei lançamentos pagos do fornecedor Meta Ads");
    expect(d.resumo).toContain("2 lançamentos em custeio");
  });

  it("3. fornecedor só na descrição: responde e diz o campo", async () => {
    const { d, claro } = await consultar({ periodo: "outubro", fornecedor: "Google Ads" });
    expect(d.resultado).toMatchObject({ total: "R$ 45,50", lancamentos: 1 });
    expect(d.filtrosAplicados.fornecedor.campoUsado).toContain("descrição");
    expect(claro.resumo).toContain("citando Google Ads na descrição");
  });

  it("4. nomes semelhantes: opções sem total; depois da confirmação, o total", async () => {
    const amb = await consultar({ periodo: "outubro", fornecedor: "meta" });
    expect(amb.tipo).toBe("LIMITACAO");
    expect(amb.claro.precisaConfirmar.opcoes.map((o: Dados) => o.nome)).toEqual(["Meta Ads", "Meta Imóveis"]);
    expect(amb.d.precisaConfirmar.opcoes.map((o: Dados) => o.nome)).toEqual(["[F2]", "[F3]"]);
    expect(JSON.stringify(amb.d)).not.toMatch(/R\$/);
    const ok = await consultar({ periodo: "outubro", fornecedor: "meta", fornecedoresConfirmados: ["Meta Ads"] });
    expect(ok.d.resultado).toMatchObject({ total: "R$ 249,90", lancamentos: 2 });
    expect(ok.d.filtrosAplicados.fornecedor.criterio).toBe("nomes confirmados na conversa");
  });

  it("4b. FACEBOOK ADS não entra em Meta Ads", async () => {
    const { claro } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads", listarLancamentos: true });
    expect(claro.resultado.listaDeLancamentos.map((l: Dados) => l.fornecedor)).not.toContain("Facebook Ads");
  });

  it("5. comparação setembro × outubro, com variação calculada no servidor", async () => {
    const { d } = await consultar({ periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" });
    expect(d.comparacao).toMatchObject({ total: "R$ 80,00", lancamentos: 1, diferenca: "R$ 169,90 a mais em outubro de 2026, até 21/10/2026", variacaoPercentual: "+212,4%" });
    expect(d.comparacao.atencao).toContain("em andamento");
  });

  it("5b. base zero: sem percentual inventado", async () => {
    const { d } = await consultar({ periodo: "outubro", compararCom: "agosto", fornecedor: "Meta Ads" });
    expect(d.comparacao).toMatchObject({ total: "R$ 0,00", lancamentos: 0, variacaoPercentual: null });
    expect(d.comparacao.semPercentual).toContain("base zero");
  });

  it("6. pagos × pendentes: TODOS separa; A_PAGAR olha o vencimento até o fim do mês; VENCIDO", async () => {
    const todos = await consultar({ periodo: "outubro", fornecedor: "Meta Ads", situacao: "TODOS" });
    expect(todos.d.resultado).toMatchObject({ total: "R$ 369,90", lancamentos: 3 });
    expect(todos.d.resultado.porSituacao).toEqual({
      pago: { total: "R$ 249,90", lancamentos: 2 },
      vencido: { total: "R$ 0,00", lancamentos: 0 },
      aVencer: { total: "R$ 120,00", lancamentos: 1 },
    });
    const aPagar = await consultar({ periodo: "este mês", situacao: "A_PAGAR" });
    expect(aPagar.d.resultado).toMatchObject({ total: "R$ 160,00", lancamentos: 2 });
    // Dívida vencida em setembro: fora do total de outubro, dita à parte.
    expect(aPagar.d.foraDoTotal.vencidosAntesDoPeriodo).toMatchObject({ total: "R$ 30,00", lancamentos: 1 });
    expect(aPagar.d.resumo).toContain("À parte, vencidos antes de 01/10/2026: R$ 30,00");
    const vencido = await consultar({ periodo: "este mês", situacao: "VENCIDO" });
    expect(vencido.d.resultado).toMatchObject({ total: "R$ 40,00", lancamentos: 1 });
  });

  it("7. períodos relativos: últimos 3 meses (com outubro até hoje) e média mensal pelos meses equivalentes", async () => {
    const { d } = await consultar({ periodo: "últimos 3 meses", fornecedor: "Loja de Balões" });
    expect(d.periodo).toMatchObject({ de: "2026-08-01", ate: "2026-10-21" });
    // 01/08 a 21/10 = 2 + 21/31 meses: R$ 600,00 ÷ 2,677... = R$ 224,10.
    expect(d.resultado).toMatchObject({ total: "R$ 600,00", lancamentos: 3, mediaMensal: { valor: "R$ 224,10", meses: "2,68 meses" } });
    expect(d.resumo).toContain("Média mensal: R$ 224,10 (2,68 meses).");
    const completos = await consultar({ periodo: "últimos 3 meses completos", fornecedor: "Loja de Balões" });
    expect(completos.d.resultado).toMatchObject({ total: "R$ 300,00", lancamentos: 2, mediaMensal: { valor: "R$ 100,00", meses: "3,00 meses" } });
  });

  it("8. ranking de fornecedores: grupos + outros fecham com o total", async () => {
    const { d, claro } = await consultar({ periodo: "outubro", natureza: ["CONSUMO", "CUSTEIO"], agruparPor: "FORNECEDOR", limite: 2 });
    expect(claro.resultado.grupos).toEqual([
      { nome: "Meta Imóveis", total: "R$ 1.000,00", lancamentos: 1 },
      { nome: "Loja de Balões", total: "R$ 300,00", lancamentos: 1 },
    ]);
    const centavos = (v: string) => Number(v.replace(/[^\d]/g, ""));
    const soma = d.resultado.grupos.reduce((s: number, x: Dados) => s + centavos(x.total), 0) + centavos(d.resultado.outros.total);
    expect(soma).toBe(centavos(d.resultado.total));
    expect(claro.resumo).toContain("Por fornecedor: Meta Imóveis R$ 1.000,00; Loja de Balões R$ 300,00; outros (");
  });

  it("9. reconciliação: sem filtro de nome, consumo + custeio pagos + pagos com data futura = despesaDoMes do Financeiro", async () => {
    const { d } = await consultar({ periodo: "outubro", natureza: ["CONSUMO", "CUSTEIO"] });
    const centavos = (v: string) => Number(v.replace(/[^\d]/g, ""));
    const apurados = DESPESAS.map((x) => ({ valor: x.valor, natureza: x.natureza, pagoEm: x.pagoEm }));
    expect((centavos(d.resultado.total) + centavos(d.foraDoTotal.pagosComDataFutura.total)) / 100).toBe(despesaDoMes(apurados, "2026-10"));
    // Sem natureza: tudo, separado, e a despesa operacional à parte de acervo e pró-labore.
    const todas = await consultar({ periodo: "outubro" });
    expect(todas.d.resultado.porNatureza.map((x: Dados) => x.natureza).sort()).toEqual(["acervo (investimento)", "consumo", "custeio", "pró-labore"]);
    expect(todas.d.resultado.despesaOperacional.total).toBe(d.resultado.total);
  });

  it("10. maior e menor despesa no período", async () => {
    const { claro } = await consultar({ periodo: "este trimestre", natureza: ["CUSTEIO"] });
    expect(claro.resultado.maior).toMatchObject({ valor: "R$ 1.000,00", fornecedor: "Meta Imóveis", dia: "05/10/2026" });
    expect(claro.resultado.menor).toMatchObject({ valor: "R$ 45,50" });
  });

  it("11. períodos inválidos: limitação clara, sem cálculo", async () => {
    const r = await consultar({ periodo: "últimos 99 meses" });
    expect(r.tipo).toBe("LIMITACAO");
    expect(r.d.resultado).toBeUndefined();
    expect(() => consultarDespesas.parametros.parse({ periodo: "outubro", situacao: "DELETAR" })).toThrow();
    expect(() => consultarDespesas.parametros.parse({ periodo: "outubro", limite: 500 })).toThrow();
  });

  it("12. sem nada no cadastro nem na descrição", async () => {
    const { d } = await consultar({ periodo: "outubro", fornecedor: "Amazon" });
    expect(d.resultado).toBeUndefined();
    expect(d.resumo).toContain("nem no cadastro de fornecedores, nem na descrição");
  });
});

// ---------------------------------------------------------------- regressões da revisão (achados da Entrega B)

describe("consultarDespesas — regressões da revisão", () => {
  it("#2 período futuro a pagar: só o que já venceu é dívida; conta que vence antes do período mas depois de hoje não", async () => {
    const { d } = await consultar({ periodo: "novembro", situacao: "A_PAGAR" });
    // Vencidos: Papelaria (18/10) + Gráfica (28/09) = R$ 70,00. Meta Ads R$ 120,00 vence 25/10: ainda não venceu.
    expect(d.foraDoTotal.vencidosAntesDoPeriodo).toMatchObject({ total: "R$ 70,00", lancamentos: 2 });
    expect(d.resumo).toContain("À parte, vencidos antes de 01/11/2026: R$ 70,00 (2 lançamentos).");
    expect(JSON.stringify(d)).not.toContain("R$ 190,00");
  });

  it("#3 filtro de nome sem lançamento no período: mantém pago com data futura e a comparação", async () => {
    const zeta = [g(80, "CUSTEIO", { fornecedor: "Zeta", pagoEm: dia("2026-09-12") }), g(50, "CUSTEIO", { fornecedor: "Zeta", pagoEm: dia("2026-10-28") })];
    const { d, claro } = await consultar({ periodo: "outubro", compararCom: "setembro", fornecedor: "Zeta" }, { lista: zeta });
    expect(d.resultado).toBeUndefined();
    expect(d.foraDoTotal.pagosComDataFutura).toMatchObject({ total: "R$ 50,00", lancamentos: 1 });
    expect(d.comparacao).toMatchObject({ total: "R$ 80,00", lancamentos: 1, variacaoPercentual: "−100,0%" });
    expect(claro.resumo).toContain("Não encontrei lançamentos pagos do fornecedor Zeta em outubro de 2026, até 21/10/2026.");
    expect(claro.resumo).toContain("À parte, marcados como pagos com data depois de hoje: R$ 50,00 (1 lançamento).");
    expect(claro.resumo).toContain("Em setembro de 2026: R$ 80,00 (1 lançamento); variação de −100,0%.");
  });

  it("#3 a pagar sem conta no período: a dívida vencida antes do período aparece", async () => {
    const { d, claro } = await consultar({ periodo: "este mês", situacao: "A_PAGAR", fornecedor: "Gráfica Antiga" });
    expect(d.semCorrespondencia).toBeDefined();
    expect(d.foraDoTotal.vencidosAntesDoPeriodo).toMatchObject({ total: "R$ 30,00", lancamentos: 1 });
    expect(claro.resumo).toContain("Não encontrei lançamentos a pagar do fornecedor Gráfica Antiga");
    expect(claro.resumo).toContain("À parte, vencidos antes de 01/10/2026: R$ 30,00 (1 lançamento).");
  });

  it("#6 período que termina hoje está em andamento: a comparação com o mês inteiro avisa", async () => {
    const { d } = await consultar({ periodo: "este mês até agora", compararCom: "mês anterior", fornecedor: "Loja de Balões" });
    expect(d.periodo).toMatchObject({ ate: "2026-10-21", emAndamento: true });
    expect(d.periodo.consideradoAte).toBeUndefined();
    expect(d.comparacao).toMatchObject({ total: "R$ 200,00", variacaoPercentual: "+50,0%" });
    expect(d.comparacao.atencao).toContain("em andamento");
    expect(d.resumo).toContain("Atenção: Período em andamento");
    // Setembro inteiro, no passado: não está em andamento.
    const setembro = await consultar({ periodo: "setembro", fornecedor: "Loja de Balões" });
    expect(setembro.d.periodo.emAndamento).toBeUndefined();
  });

  it("#7 média mensal só quando o período vale mais de um mês", async () => {
    const curto = await consultar({ periodo: "de 25/09 a 05/10" });
    expect(curto.d.resultado.lancamentos).toBeGreaterThan(0);
    expect(curto.d.resultado.mediaMensal).toBeUndefined();
    const esteMes = await consultar({ periodo: "este mês" });
    expect(esteMes.d.resultado.mediaMensal).toBeUndefined();
    const aPagar = await consultar({ periodo: "este trimestre", situacao: "A_PAGAR" });
    expect(aPagar.d.resultado.mediaMensal).toBeUndefined();
  });

  it("#8 com a lista, a quantidade continua em 'lancamentos'; a lista é outro campo e diz que é amostra", async () => {
    const { d } = await consultar({ periodo: "este ano", listarLancamentos: true });
    expect(d.resultado.lancamentos).toBe(12);
    expect(d.resultado.listaDeLancamentos).toHaveLength(10);
    expect(d.resultado.listaCortada).toBe("Amostra com os 10 lançamentos mais recentes, de 12 lançamentos no total.");
  });

  it("#12 PAGO de período que ainda não começou: comparação vira limitação, sem datas invertidas", async () => {
    for (const compararCom of ["período anterior", "mesmo período do ano anterior", "setembro"]) {
      const { d } = await consultar({ periodo: "novembro", compararCom });
      expect(d.comparacao).toEqual({ limitacao: "Novembro de 2026 ainda não começou: não há valor pago para comparar." });
      expect(JSON.stringify(d)).not.toMatch(/-\d+ dias|2025-11-01/);
    }
    // A pagar de novembro compara normalmente: o vencimento olha o período inteiro.
    const aPagar = await consultar({ periodo: "novembro", situacao: "A_PAGAR", compararCom: "mês anterior" });
    expect(aPagar.d.comparacao.periodo).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
  });

  it("#14 privacidade: nenhum nome de fornecedor nem descrição vai para a IA; a pessoa vê os nomes", async () => {
    const cenarios = [
      { periodo: "outubro", listarLancamentos: true },
      { periodo: "este trimestre", agruparPor: "FORNECEDOR", limite: 10 },
      { periodo: "outubro", fornecedor: "meta" },
      { periodo: "outubro", fornecedor: "Google Ads" },
      { periodo: "outubro", fornecedor: "Meta Ads" },
      { periodo: "este mês", situacao: "TODOS", listarLancamentos: true },
    ];
    for (const args of cenarios) {
      const { d } = await consultar(args);
      const json = JSON.stringify(d);
      for (const nome of NOMES_DE_FORNECEDOR) expect(json, `${nome} em ${JSON.stringify(args)}`).not.toContain(nome);
      for (const texto of DESCRICOES) expect(json).not.toContain(texto);
      expect(json).not.toMatch(/"descricao"|"id"|formaDePagamento|observac/);
    }
    const { d, claro } = await consultar({ periodo: "outubro", listarLancamentos: true });
    for (const l of d.resultado.listaDeLancamentos) expect(Object.keys(l).sort()).toEqual(["dia", "fornecedor", "natureza", "situacao", "valor"]);
    expect(claro.resultado.listaDeLancamentos.map((l: Dados) => l.fornecedor)).toContain("Meta Imóveis");
  });

  it("revisão 2: agrupamento sem grupo nenhum não deixa 'Por fornecedor: .' no resumo", async () => {
    for (const agruparPor of ["FORNECEDOR", "MES"]) {
      const { d } = await consultar({ periodo: "dezembro", agruparPor });
      expect(d.resumo).not.toMatch(/Por (fornecedor|mês): ?\./);
      expect(d.resumo).toContain("0 lançamentos");
    }
  });

  it("revisão 2: fornecedor com nome longo (até 120 caracteres) passa na validação", () => {
    const nome = "Fornecedor de Decoração e Eventos Especiais Número Um Comércio Ltda ME";
    expect(nome.length).toBeGreaterThan(60);
    expect(() => consultarDespesas.parametros.parse({ periodo: "outubro", fornecedor: nome })).not.toThrow();
    expect(() => consultarDespesas.parametros.parse({ periodo: "outubro", fornecedor: "x".repeat(121) })).toThrow();
  });

  it("extra: agrupamento por mês em ordem de calendário, com os meses sem lançamento", async () => {
    const { d } = await consultar({ periodo: "este ano", agruparPor: "MES" });
    expect(d.resultado.grupos.map((x: Dados) => x.nome)).toEqual(["01/2026", "02/2026", "03/2026", "04/2026", "05/2026", "06/2026", "07/2026", "08/2026", "09/2026", "10/2026"]);
    expect(d.resultado.grupos[7]).toEqual({ nome: "08/2026", total: "R$ 100,00", lancamentos: 1 });
    expect(d.resultado.outros).toBeUndefined();
  });

  it("extra: o maior resultado da revisão (TODOS + ranking 10 + lista + comparação) cabe no limite, inteiro", async () => {
    const longos = Array.from({ length: 12 }, (_, i) =>
      g(100 + i, "CUSTEIO", { fornecedor: `Fornecedor de Decoração e Eventos Especiais Número ${i + 1} Ltda`, pagoEm: dia(`2026-10-${String(i + 1).padStart(2, "0")}`) }),
    );
    const { d } = await consultar(
      { periodo: "outubro", situacao: "TODOS", agruparPor: "FORNECEDOR", limite: 10, listarLancamentos: true, compararCom: "setembro" },
      { lista: [...DESPESAS, ...longos] },
    );
    const cfg = lerConfiguracao({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(JSON.stringify(d).length).toBeLessThan(cfg.limites.caracteresPorResultado);
  });
});

// ---------------------------------------------------------------- núcleo: permissões, conferência e continuidade

const uso = { entrada: 100, entradaEmCache: 0, saida: 20 };
class Roteiro implements ProvedorDeIA {
  readonly modo = "OPENAI" as const;
  recebidas: MensagemDoModelo[][] = [];
  constructor(private readonly passos: PassoDoModelo[]) {}
  async conversar(mensagens: MensagemDoModelo[]) {
    this.recebidas.push(structuredClone(mensagens));
    const p = this.passos.shift();
    if (!p) throw new Error("roteiro acabou");
    return p;
  }
  async transcrever() {
    return "";
  }
  async falar() {
    return { audio: Buffer.from(""), mimeType: "audio/mpeg" };
  }
}
const chama = (args: Record<string, unknown>): PassoDoModelo => ({ texto: null, chamadas: [{ id: "c1", nome: "consultarDespesas", argumentos: JSON.stringify(args) }], uso });
const chamaVarias = (...chamadas: [string, Record<string, unknown>][]): PassoDoModelo => ({
  texto: null,
  chamadas: chamadas.map(([nome, args], i): ChamadaDeFerramenta => ({ id: `c${i + 1}`, nome, argumentos: JSON.stringify(args) })),
  uso,
});
const diz = (texto: string): PassoDoModelo => ({ texto, chamadas: [], uso });

function montar(provedor: ProvedorDeIA, opcoes: { lista?: DespesaParaAnalise[]; falhar?: boolean; caracteresPorResultado?: number } = {}) {
  const linhas: string[] = [];
  const cfg = lerConfiguracao({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
  if (provedor.modo === "OPENAI") cfg.modo = "OPENAI";
  if (opcoes.caracteresPorResultado) cfg.limites.caracteresPorResultado = opcoes.caracteresPorResultado;
  const s = servicos(opcoes.lista, opcoes.falhar);
  const nucleo = new NucleoDoAssistente(cfg, provedor, s, new MetricasDoAssistente(cfg.precos, (l) => linhas.push(l)), () => AGORA);
  return { nucleo, linhas, servicos: s };
}
const entrada = (mensagem: string, extra: Partial<EntradaDoAssistente> = {}): EntradaDoAssistente => ({
  canal: "PAINEL_TEXTO",
  identidade: { usuarioId: "u-admin", papel: "ADMIN", comprovadaPor: "JWT_PAINEL" },
  mensagem,
  origem: "DIGITADA",
  ...extra,
});
/** O que o modelo recebeu de volta da ferramenta numa volta. */
const resultadoRecebido = (roteiro: Roteiro, volta: number) =>
  roteiro.recebidas[volta].filter((m): m is Extract<MensagemDoModelo, { papel: "ferramenta" }> => m.papel === "ferramenta").map((m) => m.conteudo);

describe("núcleo com consultarDespesas", () => {
  it("permissões: ADMIN tem a ferramenta; OPS não a recebe e, se o modelo a forjar, é bloqueado", async () => {
    expect(ferramentasDoPapel("ADMIN").map((f) => f.nome)).toContain("consultarDespesas");
    expect(ferramentasDoPapel("OPS").map((f) => f.nome)).not.toContain("consultarDespesas");
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("Não tenho esse dado.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads?", { identidade: { usuarioId: "u-ops", papel: "OPS", comprovadaPor: "JWT_PAINEL" } }));
    const resultado = roteiro.recebidas[1].at(-1) as { conteudo: string };
    expect(resultado.conteudo).toContain("não disponível para este perfil");
    expect(resultado.conteudo).not.toMatch(/R\$/);
    expect(r.tipo).toBe("LIMITACAO");
  });

  it("resposta com os valores da ferramenta é mantida, e a pessoa vê o nome no lugar do código", async () => {
    const roteiro = new Roteiro([
      chama({ periodo: "outubro", fornecedor: "Meta Ads" }),
      diz("Em outubro de 2026 (até 21/10), 2 lançamentos de [F1] somam R$ 249,90, pagos. Há ainda R$ 50,00 com data de pagamento futura, fora do total."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r.texto).toBe("Em outubro de 2026 (até 21/10), 2 lançamentos de Meta Ads somam R$ 249,90, pagos. Há ainda R$ 50,00 com data de pagamento futura, fora do total.");
    expect(r.tipo).toBe("RESPOSTA");
    expect(linhas.at(-1)).toContain('"conferencia":"CONFERIDA"');
  });

  it("indicador geral no lugar do filtro (o caso real: R$ 839,69) é trocado pelo resumo do servidor", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", natureza: ["CONSUMO"] }), diz("O consumo de outubro com Meta Ads foi R$ 839,69.")]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual foi o total de gastos de consumo em outubro com Meta Ads até agora?"));
    expect(r.texto).not.toContain("839,69");
    expect(r.texto).toContain("Não encontrei lançamentos pagos do fornecedor Meta Ads");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("conta feita pelo modelo (soma ou percentual que a ferramenta não deu) também é trocada", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("Somando com o futuro dá R$ 299,90, 20% a mais.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r.texto).toBe(
      "Outubro de 2026, até 21/10/2026: 2 lançamentos do fornecedor Meta Ads, total R$ 249,90 (pagos). " +
        "Maior: R$ 150,00 (03/10/2026); menor: R$ 99,90 (15/10/2026). " +
        "À parte, marcados como pagos com data depois de hoje: R$ 50,00 (1 lançamento).",
    );
  });

  it("valoresConferem: formatação não importa; número novo, arredondado ou com a direção trocada importa", () => {
    const dados = [{ resultado: { total: "R$ 1.234,50" }, comparacao: { variacaoPercentual: "+12,3%" } }];
    expect(valoresConferem("Total de R$ 1.234,50, alta de 12,3%.", dados)).toBe(true);
    expect(valoresConferem("Total de R$1234,5.", dados)).toBe(true);
    expect(valoresConferem("Total de R$ 1.234,51.", dados)).toBe(false);
    expect(valoresConferem("Alta de 12%.", dados)).toBe(false);
  });

  it("#1 pergunta mista: valores de outra ferramenta do mesmo turno contam como fatos; a resposta fica", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      diz("Em outubro, o faturamento por competência é R$ 1.234,50. Com [F1], foram R$ 249,90 pagos até 21/10."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual o faturamento de outubro e quanto gastamos com Meta Ads?"));
    expect(r.ferramentas).toEqual(["consultarFinanceiro", "consultarDespesas"]);
    expect(r.texto).toContain("R$ 1.234,50");
    expect(r.texto).toContain("Com Meta Ads, foram R$ 249,90");
    expect(linhas.at(-1)).toContain('"conferencia":"CONFERIDA"');
  });

  it("#1 pergunta mista com número inventado: sai o resumo das despesas e o aviso de que o resto não foi conferido", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      diz("Faturamento de R$ 1.234,50 e R$ 300,00 com Meta Ads."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual o faturamento de outubro e quanto gastamos com Meta Ads?"));
    expect(r.texto).not.toContain("R$ 300,00");
    expect(r.texto).toContain("total R$ 249,90");
    expect(r.texto).toContain("Os valores das outras consultas desta pergunta não puderam ser conferidos");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("#9 ferramenta falhou (parâmetro inválido) e o modelo inventou: nada de número, limitação dita, métrica BLOQUEADA", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", limite: 20 }), diz("Foram R$ 839,69 com Meta Ads.")]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads?"));
    expect(r.texto).not.toMatch(/\d+,\d{2}/);
    expect(r.texto).toContain("Não consegui conferir os valores desta resposta (parâmetros inválidos para a consulta)");
    expect(r.tipo).toBe("LIMITACAO");
    expect(linhas.at(-1)).toContain('"conferencia":"BLOQUEADA"');
  });

  it("#9 leitura falhou: o detalhe do erro interno não vai a lugar nenhum, e o número inventado não sai", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("Foram R$ 249,90.")]);
    const { nucleo, linhas } = montar(roteiro, { falhar: true });
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads?"));
    expect(resultadoRecebido(roteiro, 1).join()).not.toMatch(/conexão|senha|host/);
    expect(r.texto).not.toContain("249,90");
    expect(r.texto).toContain("não consegui ler esses dados agora");
    expect(linhas.at(-1)).toContain('"conferencia":"BLOQUEADA"');
  });

  it("#9 ferramenta falhou e o modelo só disse que não conseguiu: a resposta sai como está", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", limite: 20 }), diz("Não consegui consultar as despesas agora.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads?"));
    expect(r.texto).toBe("Não consegui consultar as despesas agora.");
  });

  it("#13 direção invertida (queda no lugar de alta) e valor sem R$ são pegos", async () => {
    const pergunta = "Quanto gastamos com Meta Ads em outubro comparado a setembro?";
    const inverteu = new Roteiro([chama({ periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" }), diz("Houve queda de 212,4% em relação a setembro.")]);
    const r1 = await montar(inverteu).nucleo.responder(entrada(pergunta));
    expect(r1.texto).not.toContain("queda");
    expect(r1.texto).toContain("variação de +212,4%");
    const semCifrao = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("O gasto foi de 839,69 reais.")]);
    const r2 = await montar(semCifrao).nucleo.responder(entrada(pergunta));
    expect(r2.texto).not.toContain("839,69");
    const certo = new Roteiro([chama({ periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" }), diz("Alta de 212,4%: R$ 169,90 a mais que setembro (R$ 80,00).")]);
    const r3 = await montar(certo).nucleo.responder(entrada(pergunta));
    expect(r3.texto).toBe("Alta de 212,4%: R$ 169,90 a mais que setembro (R$ 80,00).");
  });

  it("#8 a resposta que confunde o tamanho da lista com a quantidade é trocada", async () => {
    // 13 lançamentos em outubro; a lista leva 10.
    const muitos = Array.from({ length: 13 }, (_, i) => g(10 + i, "CONSUMO", { fornecedor: "Atacado", pagoEm: dia(`2026-10-${String(i + 1).padStart(2, "0")}`) }));
    const roteiro = new Roteiro([chama({ periodo: "outubro", listarLancamentos: true }), diz("Em outubro foram 10 lançamentos.")]);
    const { nucleo } = montar(roteiro, { lista: muitos });
    const r = await nucleo.responder(entrada("Quantas despesas pagamos em outubro?"));
    expect(r.texto).toContain("13 lançamentos");
    expect(r.texto).not.toContain("foram 10 lançamentos");
  });

  it("#14 a IA nunca recebe nome de fornecedor nem descrição; o histórico guarda os códigos; a confirmação volta pelo código", async () => {
    const roteiro = new Roteiro([
      chama({ periodo: "outubro", fornecedor: "meta" }),
      diz("Encontrei [F2] (5 lançamentos) e [F3] (1 lançamento). Quais devo considerar?"),
      chama({ periodo: "outubro", fornecedor: "meta", fornecedoresConfirmados: ["[F2]"] }),
      diz("Em outubro (até 21/10), 2 lançamentos de [F2]: R$ 249,90."),
    ]);
    const { nucleo } = montar(roteiro);
    const r1 = await nucleo.responder(entrada("Quanto gastamos com meta em outubro?"));
    expect(r1.texto).toBe("Encontrei Meta Ads (5 lançamentos) e Meta Imóveis (1 lançamento). Quais devo considerar?");
    const r2 = await nucleo.responder(entrada("Só a primeira opção.", { conversaId: r1.conversaId }));
    expect(r2.texto).toBe("Em outubro (até 21/10), 2 lançamentos de Meta Ads: R$ 249,90.");
    // Tudo o que foi para a IA: resultados das ferramentas e o histórico.
    const paraIA = JSON.stringify(roteiro.recebidas);
    for (const nome of NOMES_DE_FORNECEDOR.filter((x) => x !== "META ADS")) expect(paraIA).not.toContain(nome);
    for (const texto of DESCRICOES) expect(paraIA).not.toContain(texto);
    const historico = roteiro.recebidas[2].filter((m) => m.papel === "assistente").map((m) => m.texto).join();
    expect(historico).toContain("[F2]");
  });

  it("revisão 2: a resposta pode falar do tamanho da amostra; na troca, a lista vai junto", async () => {
    const muitos = Array.from({ length: 13 }, (_, i) => g(10 + i, "CONSUMO", { fornecedor: "Atacado", pagoEm: dia(`2026-10-${String(i + 1).padStart(2, "0")}`) }));
    const amostra = new Roteiro([chama({ periodo: "outubro", listarLancamentos: true }), diz("Em outubro foram 13 lançamentos; aqui estão os 10 lançamentos mais recentes.")]);
    const ok = await montar(amostra, { lista: muitos }).nucleo.responder(entrada("Liste as despesas de outubro"));
    expect(ok.texto).toBe("Em outubro foram 13 lançamentos; aqui estão os 10 lançamentos mais recentes.");
    const inventou = new Roteiro([chama({ periodo: "outubro", listarLancamentos: true }), diz("Total de R$ 999,99.")]);
    const trocada = await montar(inventou, { lista: muitos }).nucleo.responder(entrada("Liste as despesas de outubro"));
    expect(trocada.texto).toContain("13 lançamentos");
    expect(trocada.texto).toContain("Lançamentos considerados, os mais recentes: 13/10/2026 · R$ 22,00 · Atacado (pago)");
  });

  it("revisão 2: código de fornecedor com nome de mais de 60 caracteres funciona na pergunta seguinte", async () => {
    const nome = "Fornecedor de Decoração e Eventos Especiais Número Um Comércio Ltda ME";
    const lista = [g(500, "CONSUMO", { fornecedor: nome, pagoEm: dia("2026-10-02") }), g(200, "CONSUMO", { fornecedor: nome, pagoEm: dia("2026-09-02") })];
    const roteiro = new Roteiro([
      chama({ periodo: "outubro", agruparPor: "FORNECEDOR" }),
      diz("O maior fornecedor de outubro foi [F1]: R$ 500,00."),
      chama({ periodo: "setembro", fornecedor: "[F1]" }),
      diz("Em setembro, [F1] somou R$ 200,00."),
    ]);
    const { nucleo } = montar(roteiro, { lista });
    const r1 = await nucleo.responder(entrada("Qual o maior fornecedor de outubro?"));
    expect(r1.texto).toBe(`O maior fornecedor de outubro foi ${nome}: R$ 500,00.`);
    const r2 = await nucleo.responder(entrada("E quanto ele somou em setembro?", { conversaId: r1.conversaId }));
    expect(r2.texto).toBe(`Em setembro, ${nome} somou R$ 200,00.`);
    expect(JSON.stringify(roteiro.recebidas)).not.toContain(nome);
  });

  it("extra: resultado maior que o limite vai inteiro e válido (sem corte no meio), com o resumo", async () => {
    const roteiro = new Roteiro([chama({ periodo: "este trimestre", situacao: "TODOS", agruparPor: "FORNECEDOR", limite: 10, listarLancamentos: true, compararCom: "trimestre passado" }), diz("ok")]);
    const { nucleo } = montar(roteiro, { caracteresPorResultado: 1500 });
    await nucleo.responder(entrada("Despesas do trimestre por fornecedor, com a lista"));
    const [conteudo] = resultadoRecebido(roteiro, 1);
    expect(conteudo.length).toBeLessThanOrEqual(1500);
    const dados = JSON.parse(conteudo);
    expect(dados.resumo).toContain("total R$");
    expect(dados.detalhesOmitidos).toContain("não coube");
  });

  it("conteudoParaModelo: tira primeiro a lista, depois as quebras; no limite, só o essencial; nunca JSON quebrado", () => {
    const dados = { resultado: { total: "R$ 1,00", listaDeLancamentos: Array.from({ length: 50 }, (_, i) => ({ valor: `R$ ${i},00` })), grupos: [{ nome: "x".repeat(200) }] }, resumo: "Resumo.", criterios: ["c"] };
    const semLista = JSON.parse(conteudoParaModelo(dados, 700));
    expect(semLista.resultado.listaDeLancamentos).toBeUndefined();
    expect(semLista.resultado.grupos).toHaveLength(1);
    expect(semLista.detalhesOmitidos).toContain("não coube");
    const semQuebras = JSON.parse(conteudoParaModelo(dados, 320));
    expect(semQuebras.resultado).toEqual({ total: "R$ 1,00" });
    const grande = { resultado: { total: "R$ 1,00", observacaoLonga: "y".repeat(500) }, resumo: "Resumo.", criterios: ["c"] };
    const essencial = JSON.parse(conteudoParaModelo(grande, 400));
    expect(essencial).toMatchObject({ resumo: "Resumo.", criterios: ["c"] });
    expect(essencial.resultado).toBeUndefined();
    expect(JSON.parse(conteudoParaModelo(grande, 20))).toEqual({ limitacao: expect.stringContaining("grande demais") });
    expect(conteudoParaModelo({ a: 1 }, 100)).toBe('{"a":1}');
  });

  it("instruções: as regras de despesas só vão para o ADMIN", async () => {
    const roteiro = new Roteiro([diz("ok"), diz("ok")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("oi"));
    await nucleo.responder(entrada("oi", { identidade: { usuarioId: "u-ops", papel: "OPS", comprovadaPor: "JWT_PAINEL" } }));
    const sistema = (i: number) => (roteiro.recebidas[i][0] as { texto: string }).texto;
    expect(sistema(0)).toContain("consultarDespesas");
    expect(sistema(0)).toContain("[F1]");
    expect(sistema(1)).not.toContain("consultarDespesas");
  });
});

describe("provedor simulado com consultarDespesas", () => {
  it("continuidade: 'e no mês passado?' e 'e quanto disso já foi pago?' preservam os filtros", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r1 = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r1.ferramentas).toEqual(["consultarDespesas"]);
    expect(r1.texto).toContain("R$ 249,90");
    const r2 = await nucleo.responder(entrada("E no mês passado?", { conversaId: r1.conversaId }));
    expect(r2.texto).toContain("Setembro de 2026: 1 lançamento do fornecedor Meta Ads");
    expect(r2.texto).toContain("R$ 80,00");
    const r3 = await nucleo.responder(entrada("E em outubro, quanto disso já foi pago?", { conversaId: r1.conversaId }));
    expect(r3.texto).toContain("R$ 369,90");
    expect(r3.texto).toContain("Pago: R$ 249,90");
  });

  it("o caso real: consumo com Meta Ads não vira total geral de consumo", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r = await nucleo.responder(entrada("Qual foi o total de gastos de consumo no mês de outubro com Meta ADS até agora?"));
    expect(r.ferramentas).toEqual(["consultarDespesas"]);
    expect(r.texto).toContain("Não encontrei lançamentos pagos do fornecedor Meta Ads");
    expect(r.texto).toContain("2 lançamentos em custeio");
  });

  it("#15 continuação 'e …' sobre outro assunto sai das despesas; 'e com a Loja X?' troca o fornecedor", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r1 = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    const loja = await nucleo.responder(entrada("E com a Loja de Balões?", { conversaId: r1.conversaId }));
    expect(loja.ferramentas).toEqual(["consultarDespesas"]);
    expect(loja.texto).toContain("do fornecedor Loja de Balões, total R$ 300,00");
    const festas = await nucleo.responder(entrada("E quantas festas temos em novembro?", { conversaId: r1.conversaId }));
    expect(festas.ferramentas).toEqual(["consultarFestas"]);
  });

  it("revisão 2: 'e comparando com setembro?' compara, sem virar fornecedor; 'e com produtos de limpeza?' troca o fornecedor", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r1 = await nucleo.responder(entrada("Quanto gastamos com Loja de Balões em outubro?"));
    const r2 = await nucleo.responder(entrada("E comparando com setembro?", { conversaId: r1.conversaId }));
    expect(r2.ferramentas).toEqual(["consultarDespesas"]);
    expect(r2.texto).toContain("do fornecedor Loja de Balões, total R$ 300,00");
    expect(r2.texto).toContain("Em setembro de 2026: R$ 200,00 (1 lançamento); variação de +50,0%.");
    const r3 = await nucleo.responder(entrada("E com produtos de limpeza?", { conversaId: r1.conversaId }));
    expect(r3.ferramentas).toEqual(["consultarDespesas"]);
    expect(r3.texto).toContain("Não encontrei lançamentos pagos do fornecedor produtos de limpeza");
    // Outro assunto sem período: pergunta o período, não repete a despesa.
    const r4 = await nucleo.responder(entrada("E quantas festas?", { conversaId: r1.conversaId }));
    expect(r4.ferramentas).toEqual([]);
    expect(r4.texto).toContain("Para qual período?");
  });

  it("extra: festas com pagamento vencido são festas; brindes para clientes são despesa; gasto de cada cliente não é suportado", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const vencidas = await nucleo.responder(entrada("Quais festas estão com pagamento vencido em novembro?"));
    expect(vencidas.ferramentas).toEqual(["consultarFestas"]);
    const brindes = await nucleo.responder(entrada("Quanto gastamos com brindes para clientes em outubro?"));
    expect(brindes.ferramentas).toEqual(["consultarDespesas"]);
    const cliente = await nucleo.responder(entrada("Quanto cada cliente gastou em outubro?"));
    expect(cliente.ferramentas).toEqual([]);
    expect(cliente.texto).toContain("Ainda não sei responder");
  });
});

// ---------------------------------------------------------------- validação final: confiabilidade financeira

describe("confiabilidade financeira — validação final", () => {
  it("pergunta mista: a frase conferida do Financeiro fica; a das despesas com valor errado sai, e entra o resumo do servidor", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      diz("O faturamento por competência de outubro é R$ 1.234,50. Com [F1], gastamos R$ 300,00."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual o faturamento de outubro e quanto gastamos com Meta Ads?"));
    expect(r.texto.startsWith("O faturamento por competência de outubro é R$ 1.234,50.")).toBe(true);
    expect(r.texto).not.toContain("R$ 300,00");
    expect(r.texto).toContain("2 lançamentos do fornecedor Meta Ads, total R$ 249,90");
    expect(r.texto).toContain("Retirei da resposta os trechos com valores que não conferem");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("pergunta mista com a despesa falhando: a frase conferida do Financeiro fica e a falha é dita; nenhum número inventado", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads", limite: 20 }]),
      diz("O faturamento de outubro é R$ 1.234,50. Com Meta Ads, R$ 249,90."),
    ]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Faturamento de outubro e gasto com Meta Ads?"));
    expect(r.texto).toContain("O faturamento de outubro é R$ 1.234,50.");
    expect(r.texto).not.toContain("249,90");
    expect(r.texto).toContain("Parte da consulta não pôde ser feita (parâmetros inválidos para a consulta)");
    expect(r.tipo).toBe("LIMITACAO");
  });

  it("interpretação contrária sem número ('caíram' quando a comparação deu alta) não passa; a correta passa", async () => {
    const pergunta = "Os gastos com Meta Ads em outubro, comparados a setembro?";
    const errada = new Roteiro([chama({ periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" }), diz("Os gastos com [F1] caíram em relação a setembro.")]);
    const r1 = await montar(errada).nucleo.responder(entrada(pergunta));
    expect(r1.texto).not.toContain("caíram");
    expect(r1.texto).toContain("variação de +212,4%");
    const certa = new Roteiro([chama({ periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" }), diz("Os gastos com [F1] subiram 212,4% em relação a setembro (R$ 169,90 a mais).")]);
    const r2 = await montar(certa).nucleo.responder(entrada(pergunta));
    expect(r2.texto).toBe("Os gastos com Meta Ads subiram 212,4% em relação a setembro (R$ 169,90 a mais).");
  });

  it("a troca pelo resumo não esconde o que importa: período e observação, média, comparação, fora do total", async () => {
    const roteiro = new Roteiro([chama({ periodo: "últimos 3 meses", compararCom: "período anterior", fornecedor: "Loja de Balões" }), diz("Foram R$ 999,00.")]);
    const r = await montar(roteiro).nucleo.responder(entrada("Quanto gastamos com a Loja de Balões nos últimos 3 meses, comparado ao período anterior?"));
    expect(r.texto).toContain("Últimos 3 meses (01/08/2026 a 21/10/2026): 3 lançamentos do fornecedor Loja de Balões, total R$ 600,00 (pagos).");
    expect(r.texto).toContain("Média mensal: R$ 224,10 (2,68 meses).");
    expect(r.texto).toContain("Nos 82 dias anteriores (11/05/2026 a 31/07/2026): nenhum lançamento; sem base para percentual.");
    // Revisão 3: janelas do mesmo tamanho (82 × 82 dias) não ganham o aviso de período parcial.
    expect(r.texto).not.toContain("Atenção");
    expect(r.texto).toContain("Obs.: Inclui o mês atual até hoje");
    const fora = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("Foram R$ 1,00.")]);
    const r2 = await montar(fora).nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r2.texto).toContain("À parte, marcados como pagos com data depois de hoje: R$ 50,00");
  });

  /**
   * Validação independente: 300 despesas fictícias geradas com semente fixa;
   * cada resposta da ferramenta é comparada com uma conta feita aqui, de outro
   * jeito (laços simples, inteiros, arredondamento por inteiros) — não com as
   * funções da análise.
   */
  describe("conta independente sobre 300 despesas fictícias", () => {
    let semente = 20261022;
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente / 2147483648;
    };
    const escolher = <T,>(xs: readonly T[]) => xs[Math.floor(aleatorio() * xs.length)];
    const diaAleatorio = () => {
      const t = Date.UTC(2025, 0, 1) + Math.floor(aleatorio() * 730) * 86_400_000;
      return new Date(t).toISOString().slice(0, 10);
    };
    // Nomes sem semelhança entre si: "Fornecedor Alfa" e "Fornecedor Beta" seriam parecidos e a ferramenta pediria confirmação (regra aprovada).
    const FORNECEDORES = ["Alfa Decorações", "Bento Gráfica", "Casa Gama", "Loja Delta", "Épsilon Serviços", null];
    const NATUREZAS: NaturezaDoGasto[] = ["CONSUMO", "CUSTEIO", "ACERVO", "PRO_LABORE"];
    const LISTA: DespesaParaAnalise[] = Array.from({ length: 300 }, () => {
      const pago = aleatorio() < 0.7;
      const semVencimento = !pago && aleatorio() < 0.1;
      return g(Math.floor(aleatorio() * 500_000 + 1) / 100, escolher(NATUREZAS), {
        fornecedor: escolher(FORNECEDORES),
        pagoEm: pago ? dia(diaAleatorio()) : null,
        venceEm: !pago && !semVencimento ? dia(diaAleatorio()) : null,
      });
    });
    const HOJE = "2026-10-21";
    const centavos = (v: number) => Math.round(v * 100);
    const reais = (c: number) => `R$ ${String(Math.floor(Math.abs(c) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(Math.abs(c) % 100).padStart(2, "0")}`;
    const diaDe = (d: DespesaParaAnalise) => (d.pagoEm ?? d.venceEm)?.toISOString().slice(0, 10) ?? null;

    function esperado(de: string, ate: string, situacao: "PAGO" | "A_PAGAR" | "VENCIDO" | "TODOS", filtro: (d: DespesaParaAnalise) => boolean = () => true) {
      const fimPago = ate < HOJE ? ate : HOJE;
      let total = 0;
      let quantidade = 0;
      for (const d of LISTA) {
        if (!filtro(d)) continue;
        const x = diaDe(d);
        if (!x) continue;
        const pagoNoPeriodo = d.pagoEm !== null && x >= de && x <= fimPago;
        const aPagarNoPeriodo = d.pagoEm === null && x >= de && x <= ate;
        const conta =
          situacao === "PAGO" ? pagoNoPeriodo : situacao === "A_PAGAR" ? aPagarNoPeriodo : situacao === "VENCIDO" ? aPagarNoPeriodo && x < HOJE : pagoNoPeriodo || aPagarNoPeriodo;
        if (conta) {
          total += centavos(d.valor);
          quantidade += 1;
        }
      }
      return { total, quantidade };
    }
    /** Arredondamento comercial por inteiros: a/b com meio para cima (a, b ≥ 0). */
    const dividir = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));

    const casos: { args: Record<string, unknown>; de: string; ate: string; situacao: "PAGO" | "A_PAGAR" | "VENCIDO" | "TODOS"; filtro?: (d: DespesaParaAnalise) => boolean }[] = [
      { args: { periodo: "outubro" }, de: "2026-10-01", ate: "2026-10-31", situacao: "PAGO" },
      { args: { periodo: "setembro", natureza: ["CONSUMO", "CUSTEIO"] }, de: "2026-09-01", ate: "2026-09-30", situacao: "PAGO", filtro: (d) => d.natureza === "CONSUMO" || d.natureza === "CUSTEIO" },
      { args: { periodo: "este ano", fornecedor: "Alfa Decorações" }, de: "2026-01-01", ate: "2026-12-31", situacao: "PAGO", filtro: (d) => d.fornecedor === "Alfa Decorações" },
      { args: { periodo: "de 15/03/2025 a 20/08/2025", situacao: "TODOS" }, de: "2025-03-15", ate: "2025-08-20", situacao: "TODOS" },
      { args: { periodo: "este trimestre", situacao: "A_PAGAR" }, de: "2026-10-01", ate: "2026-12-31", situacao: "A_PAGAR" },
      { args: { periodo: "este ano", situacao: "VENCIDO", natureza: ["PRO_LABORE"] }, de: "2026-01-01", ate: "2026-12-31", situacao: "VENCIDO", filtro: (d) => d.natureza === "PRO_LABORE" },
      { args: { periodo: "últimos 3 meses completos", fornecedor: "Casa Gama", situacao: "TODOS" }, de: "2026-07-01", ate: "2026-09-30", situacao: "TODOS", filtro: (d) => d.fornecedor === "Casa Gama" },
    ];

    for (const c of casos) {
      it(`total e quantidade: ${JSON.stringify(c.args)}`, async () => {
        const e = esperado(c.de, c.ate, c.situacao, c.filtro);
        const { d } = await consultar(c.args, { lista: LISTA });
        expect(e.quantidade).toBeGreaterThan(0);
        expect(d.resultado).toMatchObject({ total: reais(e.total), lancamentos: e.quantidade });
      });
    }

    it("comparação: diferença e variação (uma casa, meio para cima) contra a conta independente", async () => {
      for (const [atual, base, rotulo] of [
        [["2026-09-01", "2026-09-30"], ["2026-08-01", "2026-08-31"], "setembro × agosto"],
        [["2025-06-01", "2025-06-30"], ["2025-05-01", "2025-05-31"], "junho × maio de 2025"],
      ] as const) {
        const a = esperado(atual[0], atual[1], "PAGO");
        const b = esperado(base[0], base[1], "PAGO");
        const args = rotulo === "setembro × agosto" ? { periodo: "setembro", compararCom: "agosto" } : { periodo: "junho de 2025", compararCom: "maio de 2025" };
        const { d } = await consultar(args, { lista: LISTA });
        const diferenca = a.total - b.total;
        const decimos = dividir(Math.abs(diferenca) * 1000, Math.abs(b.total));
        const sinal = diferenca > 0 ? "+" : diferenca < 0 ? "−" : "";
        expect(d.comparacao.total, rotulo).toBe(reais(b.total));
        expect(d.comparacao.variacaoPercentual, rotulo).toBe(`${sinal}${Math.floor(decimos / 10)},${decimos % 10}%`);
        expect(d.comparacao.diferenca, rotulo).toContain(`${reais(Math.abs(diferenca))} ${diferenca > 0 ? "a mais" : "a menos"}`);
      }
    });

    it("média mensal: total ÷ meses equivalentes, contra a conta independente em dias", async () => {
      // Este ano até hoje: janeiro a setembro inteiros + 21 dias de outubro = 9 + 21/31 meses.
      const ano = esperado("2026-01-01", "2026-12-31", "PAGO");
      const { d } = await consultar({ periodo: "este ano" }, { lista: LISTA });
      expect(d.resultado.mediaMensal.valor).toBe(reais(dividir(ano.total * 31, 9 * 31 + 21)));
      expect(d.resultado.mediaMensal.meses).toBe("9,68 meses");
      // Três meses fechados: total ÷ 3.
      const tri = esperado("2026-07-01", "2026-09-30", "PAGO");
      const fechado = await consultar({ periodo: "últimos 3 meses completos" }, { lista: LISTA });
      expect(fechado.d.resultado.mediaMensal.valor).toBe(reais(dividir(tri.total, 3)));
    });

    it("datas: o pago do dia 1º e o do último dia ficam no mês certo; o futuro fica fora do realizado", async () => {
      const bordas = [
        g(11.11, "CONSUMO", { fornecedor: "Borda", pagoEm: dia("2026-09-01") }),
        g(22.22, "CONSUMO", { fornecedor: "Borda", pagoEm: dia("2026-09-30") }),
        g(33.33, "CONSUMO", { fornecedor: "Borda", pagoEm: dia("2026-10-01") }),
        g(44.44, "CONSUMO", { fornecedor: "Borda", pagoEm: dia("2026-10-21") }),
        g(55.55, "CONSUMO", { fornecedor: "Borda", pagoEm: dia("2026-10-22") }),
      ];
      const set = await consultar({ periodo: "setembro" }, { lista: bordas });
      expect(set.d.resultado).toMatchObject({ total: "R$ 33,33", lancamentos: 2 });
      const out = await consultar({ periodo: "outubro" }, { lista: bordas });
      expect(out.d.resultado).toMatchObject({ total: "R$ 77,77", lancamentos: 2 });
      expect(out.d.foraDoTotal.pagosComDataFutura).toMatchObject({ total: "R$ 55,55", lancamentos: 1 });
    });
  });
});

// ---------------------------------------------------------------- revisão 3 (estado final)

describe("revisão 3 — achados sobre o estado final", () => {
  it("total geral de outra ferramenta não passa como total do fornecedor", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      // R$ 200,00 é a despesa total do Financeiro, não a do fornecedor.
      diz("Com [F1] foram R$ 200,00 em outubro."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com a Meta Ads em outubro?"));
    expect(r.texto).not.toContain("R$ 200,00");
    expect(r.texto).toContain("total R$ 249,90");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
    // Sem o código, mas com o nome que a pessoa usou: também é frase do filtro.
    const semCodigo = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      diz("Com a Meta Ads foram R$ 200,00."),
    ]);
    const r2 = await montar(semCodigo).nucleo.responder(entrada("Quanto gastamos com a Meta Ads em outubro?"));
    expect(r2.texto).not.toContain("R$ 200,00");
  });

  it("valor negativo de outra ferramenta não desliga a conferência de direção", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", compararCom: "setembro", fornecedor: "Meta Ads" }]),
      diz("Os gastos com [F1] caíram em relação a setembro."),
    ]);
    const { nucleo, servicos: s } = montar(roteiro);
    // Resultado Operacional negativo no Financeiro ("−R$ 500,00"): um fato com direção que não é comparação.
    s.financeiro.panorama = vi.fn(async () => ({
      operacional: { faturamento: 100, retencao: 0, despesas: 600, resultado: -500, margem: -5 },
      caixa: { entradas: 0, reembolsos: 0, liquido: 0, reembolsosARealizar: 0 },
      creditoEmAberto: 0,
      ytd: { faturamento: 1, retencao: 0, despesas: 0, resultado: 1, margem: 1, acervo: 0 },
      aReceber: 0,
      acervoAcumulado: 0,
      ticketMedio: null,
      festasNoMes: 1,
      meta: null,
    })) as never;
    const r = await nucleo.responder(entrada("Os gastos com Meta Ads caíram?"));
    expect(JSON.stringify(roteiro.recebidas)).toContain("−R$ 500,00");
    expect(r.texto).not.toContain("caíram");
    expect(r.texto).toContain("variação de +212,4%");
  });

  it("amostra: 'os últimos 10 lançamentos' passa; '10 lançamentos' como contagem, mesmo citando a lista, não", async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => g(10 + i, "CONSUMO", { fornecedor: "Atacado", pagoEm: dia(`2026-10-${String((i % 20) + 1).padStart(2, "0")}`) }));
    const certo = new Roteiro([chama({ periodo: "outubro", listarLancamentos: true }), diz("Foram 25 lançamentos; estes são os últimos 10 lançamentos.")]);
    const r1 = await montar(certo, { lista: muitos }).nucleo.responder(entrada("Liste as despesas de outubro"));
    expect(r1.texto).toBe("Foram 25 lançamentos; estes são os últimos 10 lançamentos.");
    const errado = new Roteiro([chama({ periodo: "outubro", listarLancamentos: true }), diz("Na lista, o Atacado tem 10 lançamentos no período.")]);
    const r2 = await montar(errado, { lista: muitos }).nucleo.responder(entrada("Quantas despesas com o Atacado?"));
    expect(r2.texto).toContain("25 lançamentos");
    expect(r2.texto).not.toContain("tem 10 lançamentos");
  });

  it("nome sem letra latina também vira código e nunca vai em claro para a IA", async () => {
    const lista = [g(100, "CONSUMO", { fornecedor: "Иван", pagoEm: dia("2026-10-02") }), g(50, "CONSUMO", { fornecedor: "日本商店", pagoEm: dia("2026-10-03") })];
    const roteiro = new Roteiro([chama({ periodo: "outubro", agruparPor: "FORNECEDOR", listarLancamentos: true }), diz("Maior: [F1], R$ 100,00.")]);
    const r = await montar(roteiro, { lista }).nucleo.responder(entrada("Maiores fornecedores de outubro?"));
    expect(JSON.stringify(roteiro.recebidas)).not.toMatch(/Иван|日本商店/);
    expect(r.texto).toBe("Maior: Иван, R$ 100,00.");
  });

  it("o modelo não consegue transformar um número dele em fato pelo eco do servidor", async () => {
    const roteiro = new Roteiro([chama({ periodo: "R$ 9.999,99" }), diz("Gastamos R$ 9.999,99.")]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos?"));
    expect(r.texto).not.toContain("9.999,99 .");
    expect(r.texto.startsWith("Gastamos R$ 9.999,99")).toBe(false);
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("direção: um número que não é valor ('2 mil') e uma vírgula separam as cláusulas", async () => {
    const { extrairValores } = await import("./conferencia");
    expect(extrairValores("O total foi R$ 1.000,00, 2 mil a menos.")[0].direcao).toBeNull();
    expect(extrairValores("Gastamos R$ 1.000,00 (mais do que em setembro, R$ 800,00).").map((v) => v.direcao)).toEqual([null, null]);
    expect(extrairValores("Foram R$ 169,90 a mais; queda de 3,0% no outro.").map((v) => v.direcao)).toEqual(["MAIS", "MENOS"]);
  });

  it("lista retirada para caber no limite leva junto a nota da amostra", () => {
    const dados = { resultado: { total: "R$ 1,00", lancamentos: 25, listaCortada: "Amostra com os 10 lançamentos mais recentes, de 25 lançamentos no total.", listaDeLancamentos: Array.from({ length: 30 }, (_, i) => ({ valor: `R$ ${i},00` })) }, resumo: "Resumo." };
    const reduzido = JSON.parse(conteudoParaModelo(dados, 400));
    expect(reduzido.resultado.listaDeLancamentos).toBeUndefined();
    expect(reduzido.resultado.listaCortada).toBeUndefined();
    expect(reduzido.resultado.lancamentos).toBe(25);
  });

  it("provedor simulado: 'mesmo período do ano passado' compara; 'pago com pix' não troca o fornecedor; 'quais delas' continua", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r1 = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    const ano = await nucleo.responder(entrada("E comparado com o mesmo período do ano passado?", { conversaId: r1.conversaId }));
    expect(ano.texto).toContain("mesmo período de 2025 (01/10/2025 a 21/10/2025)");
    const pix = await nucleo.responder(entrada("E quanto disso já foi pago com pix?", { conversaId: r1.conversaId }));
    expect(pix.texto).toContain("do fornecedor Meta Ads");
    const delas = await nucleo.responder(entrada("Quais delas estão vencidas?", { conversaId: r1.conversaId }));
    expect(delas.ferramentas).toEqual(["consultarDespesas"]);
    expect(delas.texto).toContain("do fornecedor Meta Ads");
  });
});

describe("revisão de segurança — códigos só nos campos de fornecedor", () => {
  it("código colocado no período ou na categoria não vira nome e não volta em claro para a IA", async () => {
    const roteiro = new Roteiro([
      chama({ periodo: "outubro", agruparPor: "FORNECEDOR" }),
      diz("O maior foi [F1]."),
      chama({ periodo: "[F1]", categoria: "[F1]" }),
      diz("Não entendi."),
    ]);
    const { nucleo } = montar(roteiro);
    const r1 = await nucleo.responder(entrada("Maiores fornecedores de outubro?"));
    const nome = r1.texto.replace("O maior foi ", "").replace(/\.$/, "");
    expect(NOMES_DE_FORNECEDOR).toContain(nome);
    await nucleo.responder(entrada("E esse?", { conversaId: r1.conversaId }));
    expect(JSON.stringify(roteiro.recebidas)).not.toContain(nome);
  });
});

// ---------------------------------------------------------------- revisão 4 (diff final, antes do commit)

describe("revisão 4 — diff final", () => {
  it("número do modelo repetido pelo servidor, mesmo encurtado ou curto, não vira fato", async () => {
    const encurtado = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", compararCom: "com R$ 999,99" }), diz("Com [F1], gastamos R$ 999,99 em outubro.")]);
    const r1 = await montar(encurtado).nucleo.responder(entrada("Quanto gastamos com Meta Ads?"));
    expect(r1.texto).not.toContain("999,99 em outubro");
    expect(r1.texto).toContain("total R$ 249,90");
    const curto = new Roteiro([chama({ periodo: "outubro", categoria: "9%" }), diz("Os gastos subiram 9%.")]);
    const r2 = await montar(curto).nucleo.responder(entrada("Os gastos subiram?"));
    expect(r2.texto).not.toContain("subiram 9%");
  });

  it("recusa com número de despesa junto: o número é conferido e a recusa continua", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz(`Com [F1], gastamos R$ 9.999,99 em outubro. ${MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA}`)]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads e registre o pagamento"));
    expect(r.texto).not.toContain("9.999,99");
    expect(r.texto).toContain("total R$ 249,90");
    expect(r.texto).toContain(MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA);
    expect(r.tipo).toBe("RECUSA");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("duas consultas de despesas (com e sem fornecedor): o total sem filtro não passa como total do fornecedor", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }], ["consultarDespesas", { periodo: "outubro" }]),
      diz("Com [F1], gastamos R$ 3.990,65 em outubro (9 lançamentos)."),
    ]);
    const r = await montar(roteiro).nucleo.responder(entrada("Quanto gastamos com Meta Ads e no total?"));
    expect(r.texto).not.toContain("Com Meta Ads, gastamos R$ 3.990,65");
    // A frase certa, com cada valor no seu recorte, passa.
    const certo = new Roteiro([
      chamaVarias(["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }], ["consultarDespesas", { periodo: "outubro" }]),
      diz("Com [F1], R$ 249,90. No total de outubro, R$ 3.990,65 (9 lançamentos)."),
    ]);
    const ok = await montar(certo).nucleo.responder(entrada("Quanto gastamos com Meta Ads e no total?"));
    expect(ok.texto).toBe("Com Meta Ads, R$ 249,90. No total de outubro, R$ 3.990,65 (9 lançamentos).");
  });

  it("código de cliente ou sócio no campo de fornecedor não vira busca pelo nome da pessoa", async () => {
    const lista = [g(77, "CONSUMO", { descricao: "Reembolso Renata festa", pagoEm: dia("2026-10-04") })];
    const roteiro = new Roteiro([
      { texto: null, chamadas: [{ id: "c1", nome: "consultarFestas", argumentos: JSON.stringify({ periodo: "novembro" }) }], uso },
      diz("[C1] tem festa em novembro."),
      chama({ periodo: "outubro", fornecedor: "[C1]" }),
      diz("ok"),
    ]);
    const { nucleo, servicos: s } = montar(roteiro, { lista });
    s.carteira = vi.fn(async () => [
      {
        linha: {
          comercial: { numero: 7, vigente: true, festaEm: "2026-11-14", status: "CONFIRMED", situacao: "PARCIAL", valor: 1000, saldo: 500, cliente: { nome: "Renata Alves", telefone: null, email: null } },
          apurado: {},
        },
        canceladaEm: null,
      },
    ]) as never;
    const r1 = await nucleo.responder(entrada("Quem tem festa em novembro?"));
    expect(r1.texto).toBe("Renata tem festa em novembro.");
    await nucleo.responder(entrada("E as despesas dela?", { conversaId: r1.conversaId }));
    // O [C1] chegou cru ao campo de fornecedor: nada achado pela descrição "Renata", nenhum valor dela.
    const conteudo = resultadoRecebido(roteiro, 3).join();
    expect(conteudo).not.toContain("77,00");
    expect(JSON.stringify(roteiro.recebidas)).not.toContain("Renata");
  });

  it("«F1» também marca a frase como do fornecedor", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]),
      diz("Com «F1», gastamos R$ 200,00 em outubro."),
    ]);
    const r = await montar(roteiro).nucleo.responder(entrada("Quanto gastamos com Meta Ads?"));
    expect(r.texto).not.toContain("R$ 200,00 em outubro");
  });

  it("amostra só vale colada às palavras da amostra", async () => {
    const muitos = Array.from({ length: 15 }, (_, i) => g(10 + i, "CUSTEIO", { fornecedor: "Meta Ads", pagoEm: dia(`2026-10-${String(i + 1).padStart(2, "0")}`) }));
    const errado = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", listarLancamentos: true }), diz("Em outubro foram 10 lançamentos de [F1], os mais recentes abaixo.")]);
    const r1 = await montar(errado, { lista: muitos }).nucleo.responder(entrada("Quantas despesas com Meta Ads?"));
    expect(r1.texto).toContain("15 lançamentos");
    expect(r1.texto).not.toContain("foram 10 lançamentos");
    const certo = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", listarLancamentos: true }), diz("Foram 15 lançamentos de [F1]; aqui estão os 10 lançamentos mais recentes.")]);
    const r2 = await montar(certo, { lista: muitos }).nucleo.responder(entrada("Quantas despesas com Meta Ads?"));
    expect(r2.texto).toBe("Foram 15 lançamentos de Meta Ads; aqui estão os 10 lançamentos mais recentes.");
  });

  it("período em andamento fora de PAGO ganha o aviso, mesmo com o mesmo número de dias", async () => {
    const { d } = await consultar({ periodo: "outubro", situacao: "TODOS", compararCom: "outubro de 2025" });
    expect(d.comparacao.atencao).toContain("o pago vai só até hoje");
  });

  it("categorias vão como código [K#]; a tela mostra o nome; nenhum nome de categoria vai para a IA", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", agruparPor: "CATEGORIA" }), diz("A maior categoria é [K1].")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Despesas por categoria em outubro?"));
    expect(JSON.stringify(roteiro.recebidas)).not.toMatch(/Marketing/i);
    expect(r.texto).toMatch(/^A maior categoria é (marketing|\(sem categoria\))\.$/i);
    // Filtro por categoria pelo código, na pergunta seguinte.
    const roteiro2 = new Roteiro([chama({ periodo: "outubro", agruparPor: "CATEGORIA" }), diz("[K1]."), chama({ periodo: "outubro", categoria: "[K1]" }), diz("ok")]);
    const m2 = montar(roteiro2);
    const p1 = await m2.nucleo.responder(entrada("Por categoria?"));
    await m2.nucleo.responder(entrada("E nessa?", { conversaId: p1.conversaId }));
    const conteudo = JSON.parse(resultadoRecebido(roteiro2, 3)[0]);
    expect(conteudo.resultado).toMatchObject({ total: "R$ 249,90", lancamentos: 2 });
  });

  it("fornecedor de um caractere pode ser consultado pelo código", async () => {
    const lista = [g(30, "CONSUMO", { fornecedor: "X", pagoEm: dia("2026-10-02") }), g(20, "CONSUMO", { fornecedor: "X", pagoEm: dia("2026-09-02") })];
    const roteiro = new Roteiro([chama({ periodo: "outubro", agruparPor: "FORNECEDOR" }), diz("[F1]."), chama({ periodo: "setembro", fornecedor: "[F1]" }), diz("Em setembro, [F1]: R$ 20,00.")]);
    const { nucleo } = montar(roteiro, { lista });
    const r1 = await nucleo.responder(entrada("Fornecedores de outubro?"));
    const r2 = await nucleo.responder(entrada("E em setembro?", { conversaId: r1.conversaId }));
    expect(r2.texto).toBe("Em setembro, X: R$ 20,00.");
  });
});

// ---------------------------------------------------------------- revisão 5 (correções da revisão 4)

describe("revisão 5 — correções da revisão 4", () => {
  const misto = (resposta: string) =>
    new Roteiro([chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", fornecedor: "Meta Ads" }]), diz(resposta)]);

  it("o recorte vale para a frase toda (com ';') e para os itens de uma lista com título", async () => {
    for (const resposta of ["Com [F1]: 2 lançamentos; total de R$ 200,00.", "Gastos com [F1] em outubro:\n• Total: R$ 200,00\n• 2 lançamentos"]) {
      const r = await montar(misto(resposta)).nucleo.responder(entrada("Quanto gastamos com a Meta Ads?"));
      expect(r.texto, resposta).not.toContain("R$ 200,00");
      expect(r.texto).toContain("total R$ 249,90");
    }
    const certo = await montar(misto("Gastos com [F1] em outubro:\n• Total: R$ 249,90\n• 2 lançamentos")).nucleo.responder(entrada("Quanto gastamos com a Meta Ads?"));
    expect(certo.texto).toBe("Gastos com Meta Ads em outubro:\n• Total: R$ 249,90\n• 2 lançamentos");
  });

  it("filtro sem correspondência: o código do termo marca o recorte, e o total geral não passa", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarDespesas", { periodo: "outubro", categoria: "brindes" }], ["consultarDespesas", { periodo: "outubro" }]),
      diz("Com [K1] foram R$ 3.990,65 em outubro."),
    ]);
    const r = await montar(roteiro).nucleo.responder(entrada("Quanto gastamos com brindes?"));
    expect(r.texto).not.toContain("Com brindes foram R$ 3.990,65");
  });

  it("amostra conta por ocorrência: 'foram 10 lançamentos, e abaixo os 10 lançamentos mais recentes' não passa", async () => {
    const muitos = Array.from({ length: 15 }, (_, i) => g(10 + i, "CUSTEIO", { fornecedor: "Meta Ads", pagoEm: dia(`2026-10-${String(i + 1).padStart(2, "0")}`) }));
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", listarLancamentos: true }), diz("No total foram 10 lançamentos, e abaixo estão os 10 lançamentos mais recentes.")]);
    const r = await montar(roteiro, { lista: muitos }).nucleo.responder(entrada("Quantas despesas com Meta Ads?"));
    expect(r.texto).toContain("15 lançamentos");
    expect(r.texto).not.toContain("No total foram 10");
  });

  it("termo de categoria que é palavra comum não prende a frase de outra ferramenta ao recorte", async () => {
    const roteiro = new Roteiro([
      chamaVarias(["consultarFinanceiro", { periodo: "outubro" }], ["consultarDespesas", { periodo: "outubro", categoria: "faturamento" }]),
      diz("O faturamento das festas de outubro é R$ 1.234,50."),
    ]);
    const r = await montar(roteiro).nucleo.responder(entrada("Faturamento de outubro e gastos da categoria faturamento?"));
    expect(r.texto).toBe("O faturamento das festas de outubro é R$ 1.234,50.");
  });

  it("eco com aspas não vira fato; eco curto não parte um valor de verdade", async () => {
    const { fatosDoTurno } = await import("./conferencia");
    const comAspas = fatosDoTurno([{ origem: "consultarDespesas", dados: { limitacao: 'Não entendi o período "a" R$ 500,00 "b".' } }], ['a" R$ 500,00 "b']);
    expect(comAspas.map((f) => f.absoluto)).not.toContain(50000);
    const partido = fatosDoTurno([{ origem: "consultarDespesas", dados: { total: "R$ 1.234,50" } }], ["234"]);
    expect(partido.map((f) => f.absoluto)).toEqual([123450]);
  });

  it("aviso de período parcial diz o que vale para cada situação", async () => {
    const vencido = await consultar({ periodo: "este mês", situacao: "VENCIDO", compararCom: "mês passado" });
    expect(vencido.d.comparacao.atencao).toContain("tamanhos diferentes (20 e 30 dias)");
    const aPagar = await consultar({ periodo: "outubro", situacao: "A_PAGAR", compararCom: "outubro de 2025" });
    expect(aPagar.d.comparacao.atencao).toContain("o a pagar ainda pode mudar até o fim do período");
  });
});
