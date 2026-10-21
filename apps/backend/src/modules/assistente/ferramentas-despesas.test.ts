import { describe, expect, it, vi } from "vitest";
import { despesaDoMes, type DespesaParaAnalise, type NaturezaDoGasto } from "@festae/shared";
import { lerConfiguracao } from "./configuracao";
import { MetricasDoAssistente } from "./controle";
import type { EntradaDoAssistente } from "./contrato";
import { ferramentasDoPapel, type ServicosDoAssistente } from "./ferramentas";
import { consultarDespesas } from "./ferramentas-despesas";
import { NucleoDoAssistente, valoresConferem } from "./nucleo";
import type { MensagemDoModelo, PassoDoModelo, ProvedorDeIA } from "./provedor";
import { ProvedorSimulado } from "./provedor-simulado";

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
  g(1500, "PRO_LABORE", { pagoEm: dia("2026-10-05") }),
  g(800, "ACERVO", { fornecedor: "Atacado Festa", pagoEm: dia("2026-10-11") }),
];

/** Como o serviço real: pagos no intervalo e todos os a pagar; nomes com contagem. */
function servicos(): ServicosDoAssistente {
  const contar = (campo: "fornecedor" | "categoria") => {
    const m = new Map<string, number>();
    for (const d of DESPESAS) if (d[campo]) m.set(d[campo]!, (m.get(d[campo]!) ?? 0) + 1);
    return [...m].map(([nome, lancamentos]) => ({ nome, lancamentos }));
  };
  return {
    financeiro: {
      panorama: vi.fn() as never,
      despesasPorNatureza: vi.fn() as never,
      despesasParaAnalise: vi.fn(async (de: string, ate: string) =>
        DESPESAS.filter((d) => !d.pagoEm || (d.pagoEm.toISOString().slice(0, 10) >= de && d.pagoEm.toISOString().slice(0, 10) <= ate)),
      ),
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
async function consultar(args: Record<string, unknown>, papel: "ADMIN" | "OPS" = "ADMIN") {
  const validados = consultarDespesas.parametros.parse(args);
  const r = await consultarDespesas.executar(validados, { papel, agora: AGORA, servicos: servicos() });
  return { ...r, d: r.dados as Dados };
}

describe("consultarDespesas — cenários da homologação", () => {
  it("1. Meta Ads em outubro: soma exata e quantidade; grafias iguais juntas; futuro e a pagar fora", async () => {
    const { d, tipo } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads" });
    expect(tipo).toBeUndefined();
    expect(d.resultado).toMatchObject({ total: "R$ 249,90", lancamentos: 2 });
    expect(d.filtrosAplicados.fornecedor).toMatchObject({ campoUsado: "fornecedor", nomesConsiderados: ["Meta Ads", "META ADS"] });
    expect(d.periodo).toMatchObject({ rotulo: "outubro de 2026, até 21/10/2026", consideradoAte: "21/10/2026" });
    expect(d.foraDoTotal.pagosComDataFutura).toMatchObject({ total: "R$ 50,00", lancamentos: 1 });
    expect(d.resumo).toBe("Outubro de 2026, até 21/10/2026: 2 lançamentos do fornecedor Meta Ads / META ADS, total R$ 249,90 (pagos).");
  });

  it("2. natureza diferente da perguntada: nenhum total, e o aviso de onde estão", async () => {
    const { d } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads", natureza: ["CONSUMO"] });
    expect(d.resultado).toBeUndefined();
    expect(d.semCorrespondencia.emOutrasNaturezas).toEqual([{ natureza: "custeio", lancamentos: 2 }]);
    expect(JSON.stringify(d)).not.toMatch(/R\$/);
    expect(d.resumo).toContain("Não encontrei lançamentos pagos do fornecedor");
    expect(d.resumo).toContain("2 lançamentos em custeio");
  });

  it("3. fornecedor só na descrição: responde e diz o campo", async () => {
    const { d } = await consultar({ periodo: "outubro", fornecedor: "Google Ads" });
    expect(d.resultado).toMatchObject({ total: "R$ 45,50", lancamentos: 1 });
    expect(d.filtrosAplicados.fornecedor.campoUsado).toContain("descrição");
    expect(d.resumo).toContain('citando "Google Ads" na descrição');
  });

  it("4. nomes semelhantes: opções sem total; depois da confirmação, o total", async () => {
    const amb = await consultar({ periodo: "outubro", fornecedor: "meta" });
    expect(amb.tipo).toBe("LIMITACAO");
    expect(amb.d.precisaConfirmar.opcoes.map((o: Dados) => o.nome)).toEqual(["Meta Ads", "Meta Imóveis"]);
    expect(JSON.stringify(amb.d)).not.toMatch(/R\$/);
    const ok = await consultar({ periodo: "outubro", fornecedor: "meta", fornecedoresConfirmados: ["Meta Ads"] });
    expect(ok.d.resultado).toMatchObject({ total: "R$ 249,90", lancamentos: 2 });
    expect(ok.d.filtrosAplicados.fornecedor.criterio).toBe("nomes confirmados na conversa");
  });

  it("4b. FACEBOOK ADS não entra em Meta Ads", async () => {
    const { d } = await consultar({ periodo: "outubro", fornecedor: "Meta Ads", listarLancamentos: true });
    expect(d.resultado.lancamentos.map((l: Dados) => l.fornecedor)).not.toContain("Facebook Ads");
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
    const vencido = await consultar({ periodo: "este mês", situacao: "VENCIDO" });
    expect(vencido.d.resultado).toMatchObject({ total: "R$ 40,00", lancamentos: 1 });
  });

  it("7. períodos relativos: últimos 3 meses (com outubro até hoje) e média mensal", async () => {
    const { d } = await consultar({ periodo: "últimos 3 meses", fornecedor: "Loja de Balões" });
    expect(d.periodo).toMatchObject({ de: "2026-08-01", ate: "2026-10-21" });
    expect(d.resultado).toMatchObject({ total: "R$ 600,00", lancamentos: 3, mediaMensal: { valor: "R$ 200,00", meses: 3 } });
    const completos = await consultar({ periodo: "últimos 3 meses completos", fornecedor: "Loja de Balões" });
    expect(completos.d.resultado).toMatchObject({ total: "R$ 300,00", lancamentos: 2 });
  });

  it("8. ranking de fornecedores: grupos + outros fecham com o total", async () => {
    const { d } = await consultar({ periodo: "outubro", natureza: ["CONSUMO", "CUSTEIO"], agruparPor: "FORNECEDOR", limite: 2 });
    expect(d.resultado.grupos).toEqual([
      { nome: "Meta Imóveis", total: "R$ 1.000,00", lancamentos: 1 },
      { nome: "Loja de Balões", total: "R$ 300,00", lancamentos: 1 },
    ]);
    const centavos = (v: string) => Number(v.replace(/[^\d]/g, ""));
    const soma = d.resultado.grupos.reduce((s: number, x: Dados) => s + centavos(x.total), 0) + centavos(d.resultado.outros.total);
    expect(soma).toBe(centavos(d.resultado.total));
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
    const { d } = await consultar({ periodo: "este trimestre", natureza: ["CUSTEIO"] });
    expect(d.resultado.maior).toMatchObject({ valor: "R$ 1.000,00", fornecedor: "Meta Imóveis", dia: "05/10/2026" });
    expect(d.resultado.menor).toMatchObject({ valor: "R$ 45,50" });
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

  it("13. privacidade: nada de observação, forma de pagamento ou id para a IA; descrição curta", async () => {
    const { d } = await consultar({ periodo: "outubro", listarLancamentos: true });
    expect(JSON.stringify(d)).not.toMatch(/"id"|formaDePagamento/);
    expect(d.resultado.lancamentos.length).toBeLessThanOrEqual(10);
    for (const l of d.resultado.lancamentos) expect(Object.keys(l).sort()).toEqual(["descricao", "dia", "fornecedor", "natureza", "situacao", "valor"]);
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
const diz = (texto: string): PassoDoModelo => ({ texto, chamadas: [], uso });

function montar(provedor: ProvedorDeIA) {
  const linhas: string[] = [];
  const cfg = lerConfiguracao({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
  if (provedor.modo === "OPENAI") cfg.modo = "OPENAI";
  const nucleo = new NucleoDoAssistente(cfg, provedor, servicos(), new MetricasDoAssistente(cfg.precos, (l) => linhas.push(l)), () => AGORA);
  return { nucleo, linhas };
}
const entrada = (mensagem: string, extra: Partial<EntradaDoAssistente> = {}): EntradaDoAssistente => ({
  canal: "PAINEL_TEXTO",
  identidade: { usuarioId: "u-admin", papel: "ADMIN", comprovadaPor: "JWT_PAINEL" },
  mensagem,
  origem: "DIGITADA",
  ...extra,
});

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

  it("resposta com os valores da ferramenta é mantida", async () => {
    const roteiro = new Roteiro([
      chama({ periodo: "outubro", fornecedor: "Meta Ads" }),
      diz("Em outubro de 2026 (até 21/10), 2 lançamentos de Meta Ads somam R$ 249,90, pagos. Há ainda R$ 50,00 com data de pagamento futura, fora do total."),
    ]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r.texto).toContain("R$ 249,90");
    expect(r.tipo).toBe("RESPOSTA");
    expect(linhas.at(-1)).not.toContain("SUBSTITUIDA");
  });

  it("indicador geral no lugar do filtro (o caso real: R$ 839,69) é trocado pelo resumo do servidor", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads", natureza: ["CONSUMO"] }), diz("O consumo de outubro com Meta Ads foi R$ 839,69.")]);
    const { nucleo, linhas } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual foi o total de gastos de consumo em outubro com Meta Ads até agora?"));
    expect(r.texto).not.toContain("839,69");
    expect(r.texto).toContain("Não encontrei lançamentos pagos do fornecedor");
    expect(linhas.at(-1)).toContain('"conferencia":"SUBSTITUIDA"');
  });

  it("conta feita pelo modelo (soma ou percentual que a ferramenta não deu) também é trocada", async () => {
    const roteiro = new Roteiro([chama({ periodo: "outubro", fornecedor: "Meta Ads" }), diz("Somando com o futuro dá R$ 299,90, 20% a mais.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto gastamos com Meta Ads em outubro?"));
    expect(r.texto).toBe("Outubro de 2026, até 21/10/2026: 2 lançamentos do fornecedor Meta Ads / META ADS, total R$ 249,90 (pagos).");
  });

  it("valoresConferem: formatação e sinal não importam; número novo importa", () => {
    const dados = [{ resultado: { total: "R$ 1.234,50" }, comparacao: { variacaoPercentual: "+12,3%" } }];
    expect(valoresConferem("Total de R$ 1.234,50, alta de 12,3%.", dados)).toBe(true);
    expect(valoresConferem("Total de R$1234,5.", dados)).toBe(true);
    expect(valoresConferem("Total de R$ 1.234,51.", dados)).toBe(false);
    expect(valoresConferem("Alta de 12%.", dados)).toBe(false);
  });

  it("instruções: as regras de despesas só vão para o ADMIN", async () => {
    const roteiro = new Roteiro([diz("ok"), diz("ok")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("oi"));
    await nucleo.responder(entrada("oi", { identidade: { usuarioId: "u-ops", papel: "OPS", comprovadaPor: "JWT_PAINEL" } }));
    const sistema = (i: number) => (roteiro.recebidas[i][0] as { texto: string }).texto;
    expect(sistema(0)).toContain("consultarDespesas");
    expect(sistema(1)).not.toContain("consultarDespesas");
  });

  it("continuidade (provedor simulado): 'e no mês passado?' e 'e quanto disso já foi pago?' preservam os filtros", async () => {
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

  it("o caso real, pelo provedor simulado: consumo com Meta Ads não vira total geral de consumo", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r = await nucleo.responder(entrada("Qual foi o total de gastos de consumo no mês de outubro com Meta ADS até agora?"));
    expect(r.ferramentas).toEqual(["consultarDespesas"]);
    expect(r.texto).toContain("Não encontrei lançamentos pagos do fornecedor");
    expect(r.texto).toContain("2 lançamentos em custeio");
  });
});
