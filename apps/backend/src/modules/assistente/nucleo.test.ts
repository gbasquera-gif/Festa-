import { describe, expect, it, vi } from "vitest";
import { lerConfiguracao } from "./configuracao";
import { ConversasEmMemoria, LimitesDeUso, MetricasDoAssistente, type ControleDeUso } from "./controle";
import { CATALOGO, ferramentasDoPapel, type ServicosDoAssistente } from "./ferramentas";
import { MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL, MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA, type EntradaDoAssistente } from "./contrato";
import { NucleoDoAssistente, RecusaDoAssistente } from "./nucleo";
import { FalhaDoProvedor, type EsquemaDeFerramenta, type MensagemDoModelo, type PassoDoModelo, type ProvedorDeIA } from "./provedor";
import { PREFIXO_DO_CONTEXTO, ProvedorSimulado } from "./provedor-simulado";

const AGORA = new Date("2026-10-19T18:00:00Z");
const uso = { entrada: 100, entradaEmCache: 0, saida: 20 };

/** Um provedor que segue um roteiro: cada chamada de `conversar` devolve o próximo passo. */
class Roteiro implements ProvedorDeIA {
  readonly modo = "OPENAI" as const;
  recebidas: { mensagens: MensagemDoModelo[]; ferramentas: EsquemaDeFerramenta[] }[] = [];
  constructor(private readonly passos: (PassoDoModelo | Error)[]) {}
  async conversar(mensagens: MensagemDoModelo[], ferramentas: EsquemaDeFerramenta[]) {
    this.recebidas.push({ mensagens: structuredClone(mensagens), ferramentas });
    const passo = this.passos.shift();
    if (!passo) throw new Error("roteiro acabou");
    if (passo instanceof Error) throw passo;
    return passo;
  }
  async transcrever() {
    return "Quantas festas temos em novembro?";
  }
  async falar() {
    return { audio: Buffer.from("mp3"), mimeType: "audio/mpeg" };
  }
}

const chama = (nome: string, args: Record<string, unknown>, id = "c1"): PassoDoModelo => ({
  texto: null,
  chamadas: [{ id, nome, argumentos: JSON.stringify(args) }],
  uso,
});
const diz = (texto: string): PassoDoModelo => ({ texto, chamadas: [], uso });

function servicos(): ServicosDoAssistente {
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
      despesasPorNatureza: vi.fn(async (mes: string) => ({ mes, consumo: 120, custeio: 80, total: 200, acervo: 50 })),
    },
    retiradas: {
      listar: vi.fn(async (filtro: { ano?: string; mes?: string }) => {
        const tot = (d: number, p: number, a: number) => ({ DISTRIBUICAO_DE_LUCROS: d, PRO_LABORE: p, DEVOLUCAO_DE_APORTE: a, total: d + p + a });
        return {
          recorte: { ano: Number(filtro.ano ?? 2026), mes: filtro.mes && filtro.mes !== "todos" ? `${filtro.ano}-${filtro.mes}` : null },
          indicadores: { mes: filtro.mes && filtro.mes !== "todos" ? tot(300, 1500, 0) : null, ano: tot(1300, 4500, 250), historico: tot(2300, 6000, 250) },
          porSocio: [
            { socioId: "s1", socio: "Ana Teste da Silva", mes: 1500, ano: 3000, historico: 5000, porCategoria: tot(0, 5000, 0) },
            { socioId: "s2", socio: "Bruno Teste", mes: 300, ano: 3050, historico: 3550, porCategoria: tot(2300, 1000, 250) },
            { socioId: "s3", socio: "Caio Teste", mes: 0, ano: 0, historico: 0, porCategoria: tot(0, 0, 0) },
          ],
          itens: [{}, {}],
          totalDoFiltro: tot(300, 1500, 0),
        };
      }) as never,
    },
    comercial: { visaoGeral: vi.fn() as never },
    panoramaDeOrcamentos: { panorama: vi.fn() as never },
    orcamentos: { seguradoPorAprovadas: vi.fn() as never },
    acervo: { performance: vi.fn() as never },
    disponibilidade: { conflitosDeItens: vi.fn() as never },
    produtos: { findAll: vi.fn(async () => [{ id: "p1", name: "Arco Dourado", category: "ARCO", stockQuantity: 3 }]) as never },
    carteira: vi.fn(async () => []),
  };
}

function montar(provedor: ProvedorDeIA | null, env: Record<string, string> = {}) {
  const linhas: string[] = [];
  const cfg = lerConfiguracao({ NODE_ENV: "test", ...env } as NodeJS.ProcessEnv);
  if (provedor?.modo === "OPENAI") cfg.modo = "OPENAI";
  const s = servicos();
  const nucleo = new NucleoDoAssistente(cfg, provedor, s, new MetricasDoAssistente(cfg.precos, (l) => linhas.push(l)), () => AGORA);
  return { nucleo, linhas, servicos: s, cfg };
}

const entrada = (mensagem: string, extra: Partial<EntradaDoAssistente> = {}): EntradaDoAssistente => ({
  canal: "PAINEL_TEXTO",
  identidade: { usuarioId: "u-admin", papel: "ADMIN", comprovadaPor: "JWT_PAINEL" },
  mensagem,
  origem: "DIGITADA",
  ...extra,
});
const deOps = (mensagem: string, extra: Partial<EntradaDoAssistente> = {}) =>
  entrada(mensagem, { identidade: { usuarioId: "u-ops", papel: "OPS", comprovadaPor: "JWT_PAINEL" }, ...extra });

describe("catálogo", () => {
  it("só leitura nesta fase, para qualquer papel", () => {
    expect(CATALOGO.every((f) => f.natureza === "LEITURA")).toBe(true);
    expect(ferramentasDoPapel("ADMIN").length).toBe(CATALOGO.length);
  });

  it("OPS não recebe as ferramentas que a tela não lhe mostra", () => {
    const ops = ferramentasDoPapel("OPS").map((f) => f.nome);
    expect(ops).not.toContain("consultarFinanceiro");
    expect(ops).not.toContain("consultarCarteiraFutura");
    expect(ops).not.toContain("consultarUsoDoAcervo");
    expect(ops).not.toContain("consultarRetiradasDosSocios");
    expect(ops).toEqual(
      expect.arrayContaining(["consultarFestas", "consultarPendencias", "consultarPropostas", "consultarDisponibilidadeDeProduto", "solicitarOperacao"]),
    );
  });
});

describe("responder", () => {
  it("chama a ferramenta, devolve o texto do modelo e as fontes", async () => {
    const roteiro = new Roteiro([chama("consultarFinanceiro", { periodo: "outubro" }), diz("Faturamento de outubro: R$ 1.234,50.")]);
    const { nucleo, servicos: s } = montar(roteiro);
    const r = await nucleo.responder(entrada("Qual o faturamento de outubro?"));
    expect(r).toMatchObject({ tipo: "RESPOSTA", texto: "Faturamento de outubro: R$ 1.234,50.", ferramentas: ["consultarFinanceiro"], modo: "OPENAI" });
    expect(r.fontes[0].caminho).toBe("/financeiro?ano=2026&mes=10");
    expect(s.financeiro.panorama).toHaveBeenCalledWith(2026, "2026-10");
    // O resultado da ferramenta foi para o modelo com os valores já formatados.
    const resultado = roteiro.recebidas[1].mensagens.at(-1);
    expect(resultado).toMatchObject({ papel: "ferramenta", nome: "consultarFinanceiro" });
    expect((resultado as { conteudo: string }).conteudo).toContain("R$ 1.234,50");
  });

  it("retiradas dos sócios: o mês pela mesma apuração da aba, só o primeiro nome, e o critério que separa do Resultado", async () => {
    const roteiro = new Roteiro([chama("consultarRetiradasDosSocios", { periodo: "outubro" }), diz("ok")]);
    const { nucleo, servicos: s } = montar(roteiro);
    const r = await nucleo.responder(entrada("Quanto os sócios retiraram em outubro?"));
    expect(s.retiradas.listar).toHaveBeenCalledWith({ ano: "2026", mes: "10", incluirEstornadas: "nao" }, AGORA);
    expect(r.fontes[0].caminho).toBe("/financeiro?aba=retiradas&ano=2026&mes=10");
    const dados = JSON.parse((roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(dados.noPeriodo).toEqual({ total: "R$ 1.800,00", distribuicaoDeLucros: "R$ 300,00", proLabore: "R$ 1.500,00", devolucaoDeAporte: "R$ 0,00" });
    expect(dados.anoInteiro.total).toBe("R$ 6.050,00");
    // Quem não retirou no mês fica de fora; quem retirou vai só com o primeiro nome.
    expect(dados.porSocio).toEqual([
      { socio: "Ana", noPeriodo: "R$ 1.500,00", noAno: "R$ 3.000,00" },
      { socio: "Bruno", noPeriodo: "R$ 300,00", noAno: "R$ 3.050,00" },
    ]);
    expect(JSON.stringify(dados)).not.toContain("Silva");
    expect(dados.criterios.join(" ")).toContain("não muda o Resultado Operacional");
  });

  it("retiradas dos sócios: ano, histórico sem período e semana recusada com as alternativas reais", async () => {
    const roteiro = new Roteiro([
      chama("consultarRetiradasDosSocios", { periodo: "2026" }),
      diz("ok"),
      chama("consultarRetiradasDosSocios", {}),
      diz("ok"),
      chama("consultarRetiradasDosSocios", {}),
      diz("ok"),
      chama("consultarRetiradasDosSocios", { periodo: "esta semana" }),
      diz("ok"),
    ]);
    const { nucleo, servicos: s } = montar(roteiro);
    await nucleo.responder(entrada("Retiradas dos sócios em 2026?"));
    expect(s.retiradas.listar).toHaveBeenLastCalledWith({ ano: "2026", mes: "todos", incluirEstornadas: "nao" }, AGORA);
    const doAno = JSON.parse((roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(doAno.noPeriodo.total).toBe("R$ 6.050,00");
    expect(doAno.porSocio.map((x: { socio: string }) => x.socio)).toEqual(["Ana", "Bruno"]);

    await nucleo.responder(entrada("E no total, desde o começo?"));
    const historico = JSON.parse((roteiro.recebidas[3].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(historico.periodo.rotulo).toBe("todo o histórico");
    expect(historico.noPeriodo.total).toBe("R$ 8.550,00");

    // Mesmo primeiro nome: o mínimo que separa as pessoas, nunca o nome completo.
    vi.mocked(s.retiradas.listar).mockResolvedValueOnce({
      recorte: { ano: 2026, mes: null },
      indicadores: { mes: null, ano: { DISTRIBUICAO_DE_LUCROS: 0, PRO_LABORE: 0, DEVOLUCAO_DE_APORTE: 0, total: 0 }, historico: { DISTRIBUICAO_DE_LUCROS: 30, PRO_LABORE: 0, DEVOLUCAO_DE_APORTE: 0, total: 30 } },
      porSocio: [
        { socioId: "a", socio: "Ana Silva Costa", mes: 0, ano: 0, historico: 20 },
        { socioId: "b", socio: "Ana Pereira", mes: 0, ano: 0, historico: 10 },
        { socioId: "c", socio: "Bia Souza", mes: 0, ano: 0, historico: 8 },
        { socioId: "d", socio: "Bia Santos", mes: 0, ano: 0, historico: 7 },
        { socioId: "e", socio: "Caio Lima", mes: 0, ano: 0, historico: 6 },
        { socioId: "f", socio: "Caio Lima Neto", mes: 0, ano: 0, historico: 5 },
        { socioId: "g", socio: "Davi Rocha", mes: 0, ano: 0, historico: 4 },
      ],
      itens: [],
    } as never);
    await nucleo.responder(entrada("E por sócio?"));
    const homonimos = JSON.parse((roteiro.recebidas[5].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(homonimos.porSocio.map((x: { socio: string }) => x.socio)).toEqual([
      "Ana S.",
      "Ana P.",
      "Bia Souza",
      "Bia Santos",
      "Caio Lima (1)",
      "Caio Lima (2)",
      "Davi",
    ]);
    expect(JSON.stringify(homonimos)).not.toMatch(/Silva|Costa|Rocha|Neto/);

    const r = await nucleo.responder(entrada("E nesta semana?"));
    const semana = JSON.parse((roteiro.recebidas[7].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(semana.limitacao).toContain("por mês ou por ano");
    expect(semana.alternativasDisponiveis).toHaveLength(2);
    expect(r.tipo).toBe("LIMITACAO");
  });

  it("as instruções levam a data de hoje em Chapecó e o perfil", async () => {
    const roteiro = new Roteiro([diz("ok")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("oi"));
    const sistema = roteiro.recebidas[0].mensagens[0];
    expect(sistema.papel).toBe("sistema");
    expect((sistema as { texto: string }).texto).toContain("segunda-feira, 19/10/2026");
    expect((sistema as { texto: string }).texto).toContain("Resultado Operacional");
  });

  it("OPS: a IA nem recebe a ferramenta financeira, e se tentar chamá-la é barrada", async () => {
    const roteiro = new Roteiro([chama("consultarFinanceiro", { periodo: "outubro" }), diz("Essa consulta não está disponível para o seu perfil.")]);
    const { nucleo, servicos: s } = montar(roteiro);
    const r = await nucleo.responder(deOps("Qual o faturamento de outubro?"));
    expect(roteiro.recebidas[0].ferramentas.map((f) => f.nome)).not.toContain("consultarFinanceiro");
    expect(s.financeiro.panorama).not.toHaveBeenCalled();
    expect((roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo).toContain("não disponível para este perfil");
    expect(r.tipo).toBe("LIMITACAO");
    expect((roteiro.recebidas[0].mensagens[0] as { texto: string }).texto).toContain("Fora do perfil OPS");
  });

  it("OPS: consulta fora do perfil não vira recusa de operação, mesmo que o modelo chame solicitarOperacao", async () => {
    const roteiro = new Roteiro([chama("solicitarOperacao", { operacao: "Consultar faturamento de outubro" }), diz(MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL)]);
    const { nucleo, servicos: s } = montar(roteiro);
    const r = await nucleo.responder(deOps("Qual o faturamento de outubro?"));
    expect(r).toMatchObject({ tipo: "LIMITACAO", texto: MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL, ferramentas: [] });
    // O modelo foi reorientado em vez de receber a recusa de operação.
    const orientacao = (roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo;
    expect(orientacao).toContain("naoEhPedidoDeOperacao");
    expect(s.financeiro.panorama).not.toHaveBeenCalled();
    const sistema = (roteiro.recebidas[0].mensagens[0] as { texto: string }).texto;
    expect(sistema).toContain(`responda exatamente: "${MENSAGEM_DE_CONSULTA_FORA_DO_PERFIL}"`);
  });

  it("pedido de escrita que escapa do detector continua sem poder afirmar que executou", async () => {
    const roteiro = new Roteiro([chama("solicitarOperacao", { operacao: "dar baixa no pagamento" }), diz("Pronto, marquei o pagamento da Ana como recebido.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Dá baixa no pagamento da Ana"));
    expect(r).toMatchObject({ tipo: "RECUSA", texto: MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA });
  });

  it("instruções: 'mês que vem' é o mês-calendário seguinte; limitação só oferece alternativas reais", async () => {
    const roteiro = new Roteiro([diz("ok")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("oi"));
    const sistema = (roteiro.recebidas[0].mensagens[0] as { texto: string }).texto;
    expect(sistema).toContain("mês-calendário seguinte inteiro");
    expect(sistema).toContain("alternativasDisponiveis");
    const carteira = roteiro.recebidas[0].ferramentas.find((f) => f.nome === "consultarCarteiraFutura")!;
    expect(carteira.descricao).toContain("NÃO é um mês-calendário");
  });

  it("mês em andamento: competência separada em festas realizadas e agendadas, com a fórmula do Financeiro", async () => {
    const contrato = (festaEm: string, valor: number, cancelado = false) => ({
      linha: { comercial: {}, apurado: { fechadoEm: new Date("2026-09-01T12:00:00Z"), festaEm: new Date(`${festaEm}T12:00:00Z`), valor, recebimentos: [], cancelado } },
      canceladaEm: null,
    });
    const roteiro = new Roteiro([chama("consultarFinanceiro", { periodo: "outubro" }), diz("ok"), chama("consultarFinanceiro", { periodo: "outubro" }), diz("ok")]);
    const { nucleo, servicos: s } = montar(roteiro);
    // 1.000,00 já realizada (10/10) + 234,50 agendada (25/10) = 1.234,50 do panorama; cancelada e novembro ficam fora.
    s.carteira = vi.fn(async () => [contrato("2026-10-10", 1000), contrato("2026-10-25", 234.5), contrato("2026-10-12", 999, true), contrato("2026-11-02", 500)]) as never;
    await nucleo.responder(entrada("Qual o faturamento de outubro?"));
    const conteudo = (roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo;
    const divisao = JSON.parse(conteudo).competencia.divisaoDoMesEmAndamento;
    expect(divisao.festasJaRealizadas).toMatchObject({ festas: 1, valor: expect.stringContaining("1.000,00") });
    expect(divisao.festasAindaAgendadas).toMatchObject({ festas: 1, valor: expect.stringContaining("234,50") });

    // Se as partes não fecham com o total do Financeiro, a divisão não vai.
    s.carteira = vi.fn(async () => [contrato("2026-10-10", 1000)]) as never;
    await nucleo.responder(entrada("Qual o faturamento de outubro?"));
    const semDivisao = JSON.parse((roteiro.recebidas[3].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(semDivisao.competencia.divisaoDoMesEmAndamento).toBeUndefined();
    expect(semDivisao.competencia.faturamentoDasFestas).toContain("1.234,50");
  });

  it("mês em andamento: o servidor completa a resposta com realizadas e agendadas quando o modelo cita só o total", async () => {
    const contrato = (festaEm: string, valor: number) => ({
      linha: { comercial: {}, apurado: { fechadoEm: new Date("2026-09-01T12:00:00Z"), festaEm: new Date(`${festaEm}T12:00:00Z`), valor, recebimentos: [] } },
      canceladaEm: null,
    });
    const roteiro = new Roteiro([
      chama("consultarFinanceiro", { periodo: "outubro" }),
      diz("Outubro de 2026: faturamento de R$ 1.234,50."),
      chama("consultarFinanceiro", { periodo: "outubro" }),
      diz("Outubro: R$ 1.234,50, sendo R$ 1.000,00 de 1 festa realizada e R$ 234,50 de 1 agendada."),
      chama("consultarFinanceiro", { periodo: "outubro" }),
      diz("Em outubro gastamos R$ 120,00 com consumo e R$ 80,00 com custeio."),
    ]);
    const { nucleo, servicos: s } = montar(roteiro);
    s.carteira = vi.fn(async () => [contrato("2026-10-10", 1000), contrato("2026-10-24", 117.25), contrato("2026-10-25", 117.25)]) as never;

    const so = await nucleo.responder(entrada("Qual o faturamento de outubro?"));
    expect(so.texto).toBe(
      "Outubro de 2026: faturamento de R$ 1.234,50.\n" +
        "Dos R$ 1.234,50 de faturamento por competência de outubro de 2026, R$ 1.000,00 são de 1 festa já realizada e " +
        "R$ 234,50 de 2 festas ainda agendadas até o fim do mês (contratado, ainda não realizado).",
    );
    // Já disse as duas partes: nada a acrescentar.
    expect((await nucleo.responder(entrada("Qual o faturamento de outubro?"))).texto).not.toContain("\n");
    // Não citou o faturamento (pergunta de despesas): nada a acrescentar.
    expect((await nucleo.responder(entrada("Quanto gastamos em outubro?"))).texto).not.toContain("faturamento");
  });

  it("intervalo de dias no Financeiro: limitação com as alternativas que existem", async () => {
    const roteiro = new Roteiro([chama("consultarFinanceiro", { periodo: "3 a 17 de outubro" }), diz("ok")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("Quanto faturamos entre 3 e 17 de outubro?"));
    const dados = JSON.parse((roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo);
    expect(dados.limitacao).toContain("Intervalos de datas escolhidos");
    expect(dados.alternativasDisponiveis).toEqual([expect.stringContaining("um mês inteiro"), expect.stringContaining("um ano")]);
  });

  it("pedido de operação: recusa padrão, sem segunda volta no modelo", async () => {
    const roteiro = new Roteiro([chama("solicitarOperacao", { operacao: "registrar despesa" })]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Registre uma despesa de R$ 200 de balões"));
    expect(r).toMatchObject({ tipo: "RECUSA", texto: MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA });
    expect(roteiro.recebidas).toHaveLength(1);
  });

  it("rede de segurança: se o modelo disser que executou, vira recusa", async () => {
    const roteiro = new Roteiro([diz("Pronto! Registrei a despesa de R$ 200.")]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("Registre uma despesa de R$ 200"));
    expect(r).toMatchObject({ tipo: "RECUSA", texto: MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA });
  });

  it("parâmetros inválidos e ferramenta inexistente não derrubam a pergunta", async () => {
    const roteiro = new Roteiro([
      { texto: null, chamadas: [{ id: "a", nome: "consultarFinanceiro", argumentos: "{nao é json" }, { id: "b", nome: "apagarTudo", argumentos: "{}" }], uso },
      diz("Não consegui."),
    ]);
    const { nucleo } = montar(roteiro);
    const r = await nucleo.responder(entrada("faturamento"));
    const conteudos = roteiro.recebidas[1].mensagens.filter((m) => m.papel === "ferramenta").map((m) => (m as { conteudo: string }).conteudo);
    expect(conteudos[0]).toContain("Parâmetros ilegíveis");
    expect(conteudos[1]).toContain("não disponível");
    expect(r.tipo).toBe("LIMITACAO");
  });

  it("período que o servidor não entende vira limitação explicada", async () => {
    const roteiro = new Roteiro([chama("consultarFinanceiro", { periodo: "quando der" }), diz("Não entendi o período.")]);
    const { nucleo } = montar(roteiro);
    await nucleo.responder(entrada("faturamento de quando der"));
    expect((roteiro.recebidas[1].mensagens.at(-1) as { conteudo: string }).conteudo).toContain("Não entendi o período");
  });

  it("modelo que não para de chamar ferramentas é cortado no limite de passos", async () => {
    const passos = Array.from({ length: 10 }, (_, i) => chama("contarProdutos", {}, `c${i}`));
    const roteiro = new Roteiro(passos);
    const { nucleo, cfg } = montar(roteiro);
    const r = await nucleo.responder(entrada("produtos"));
    expect(roteiro.recebidas).toHaveLength(cfg.limites.passosPorPergunta);
    expect(r.tipo).toBe("LIMITACAO");
  });

  it("falhas da IA viram mensagem clara e liberam a próxima pergunta", async () => {
    for (const [tipo, trecho] of [
      ["INDISPONIVEL", "Não consegui falar com o serviço de IA"],
      ["TEMPO_ESGOTADO", "demorou demais"],
      ["AUTENTICACAO", "sem acesso ao serviço de IA"],
      ["LIMITE_DO_PROVEDOR", "limite de uso"],
    ] as const) {
      const roteiro = new Roteiro([new FalhaDoProvedor(tipo, "x"), diz("ok")]);
      const { nucleo, linhas } = montar(roteiro);
      const erro = await nucleo.responder(entrada("faturamento de outubro")).catch((e) => e);
      expect(erro).toBeInstanceOf(RecusaDoAssistente);
      expect((erro as RecusaDoAssistente).codigo).toBe("INDISPONIVEL");
      expect((erro as Error).message).toContain(trecho);
      expect(linhas.at(-1)).toContain(`"falha":"${tipo}"`);
      // A trava de "pergunta em andamento" foi liberada.
      await expect(nucleo.responder(entrada("faturamento"))).resolves.toMatchObject({ texto: "ok" });
    }
  });

  it("validações de entrada e canal", async () => {
    const { nucleo } = montar(new Roteiro([]));
    await expect(nucleo.responder(entrada("   "))).rejects.toMatchObject({ codigo: "INVALIDA" });
    await expect(nucleo.responder(entrada("x".repeat(501)))).rejects.toMatchObject({ codigo: "INVALIDA" });
    await expect(nucleo.responder(entrada("oi", { canal: "WHATSAPP_TEXTO" }))).rejects.toMatchObject({ codigo: "CANAL_INATIVO" });
  });

  it("desligado: sem provedor, recusa como indisponível", async () => {
    const cfg = lerConfiguracao({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(cfg.modo).toBe("DESLIGADO");
    const nucleo = new NucleoDoAssistente(cfg, null, servicos(), new MetricasDoAssistente(cfg.precos, () => {}), () => AGORA);
    expect(nucleo.estado("ADMIN").disponivel).toBe(false);
    await expect(nucleo.responder(entrada("oi"))).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });

  it("limite por hora e pergunta simultânea do mesmo usuário", async () => {
    const roteiro = new Roteiro(Array.from({ length: 5 }, () => diz("ok")));
    const { nucleo } = montar(roteiro, { ASSISTENTE_IA_PERGUNTAS_POR_HORA: "2" });
    await nucleo.responder(entrada("a"));
    await nucleo.responder(entrada("b"));
    await expect(nucleo.responder(entrada("c"))).rejects.toMatchObject({ codigo: "LIMITE" });
    // Outro usuário não é afetado.
    await expect(nucleo.responder(deOps("d"))).resolves.toBeTruthy();

    let liberar: () => void = () => {};
    const lento: ProvedorDeIA = {
      modo: "OPENAI",
      conversar: () => new Promise((ok) => (liberar = () => ok(diz("ok")))),
      transcrever: async () => "",
      falar: async () => ({ audio: Buffer.alloc(0), mimeType: "audio/mpeg" }),
    };
    const { nucleo: n2 } = montar(lento);
    const primeira = n2.responder(entrada("a"));
    await expect(n2.responder(entrada("b"))).rejects.toMatchObject({ codigo: "LIMITE" });
    liberar();
    await primeira;
  });

  it("teto de gasto do dia: soma o custo estimado de cada resposta e recusa quando passa", async () => {
    // Cada resposta do roteiro custa ~US$ 0,000165 (100 tokens de entrada, 20 de saída).
    const roteiro = new Roteiro(Array.from({ length: 5 }, () => diz("ok")));
    const { nucleo } = montar(roteiro, { ASSISTENTE_IA_GASTO_MAXIMO_DIA_USD: "0.0002" });
    await nucleo.responder(entrada("a"));
    await nucleo.responder(entrada("b"));
    await expect(nucleo.responder(deOps("c"))).rejects.toMatchObject({ codigo: "LIMITE", message: expect.stringContaining("teto de gasto de hoje") });
    // Transcrição também para: áudio não passa por cima do teto.
    await expect(nucleo.transcrever(entrada("").identidade, "PAINEL_VOZ", Buffer.from("x"), "audio/webm", 3)).rejects.toMatchObject({ codigo: "LIMITE" });
    expect((await nucleo.limites.totais(AGORA)).gastoNoDiaUsd).toBeCloseTo(0.0003, 4);
  });

  it("teto de gasto do mês tem mensagem própria", async () => {
    const { nucleo } = montar(new Roteiro([diz("ok"), diz("ok")]), { ASSISTENTE_IA_GASTO_MAXIMO_MES_USD: "0.0001" });
    await nucleo.responder(entrada("a"));
    await expect(nucleo.responder(entrada("b"))).rejects.toMatchObject({ codigo: "LIMITE", message: expect.stringContaining("teto de gasto deste mês") });
  });

  it("contador de limites fora do ar: recusa como indisponível, sem chamar a IA", async () => {
    const roteiro = new Roteiro([diz("ok")]);
    const { cfg } = montar(roteiro);
    const quebrado: ControleDeUso = Object.assign(new LimitesDeUso(cfg.limites), {
      reservarPergunta: async () => {
        throw new Error("banco fora do ar");
      },
    });
    const nucleo = new NucleoDoAssistente(cfg, roteiro, servicos(), new MetricasDoAssistente(cfg.precos, () => {}), () => AGORA, quebrado);
    await expect(nucleo.responder(entrada("a"))).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    expect(roteiro.recebidas).toHaveLength(0);
  });

  it("contexto: a pergunta seguinte recebe as consultas anteriores; conversa é presa ao usuário", async () => {
    const roteiro = new Roteiro([chama("contarProdutos", {}), diz("1 produto."), diz("Continua 1.")]);
    const { nucleo } = montar(roteiro);
    const r1 = await nucleo.responder(entrada("Quantos produtos?"));
    await nucleo.responder(entrada("E deles, quantos ativos?", { conversaId: r1.conversaId }));
    const segunda = roteiro.recebidas[2].mensagens;
    expect(segunda.some((m) => m.papel === "sistema" && m.texto.startsWith(PREFIXO_DO_CONTEXTO) && m.texto.includes("contarProdutos"))).toBe(true);
    expect(segunda.filter((m) => m.papel === "usuario").map((m) => (m as { texto: string }).texto)).toEqual(["Quantos produtos?", "E deles, quantos ativos?"]);

    const outro = await nucleo.conversas.abrir("u-ops", r1.conversaId);
    expect(outro.id).not.toBe(r1.conversaId);
  });

  it("conversa vencida sai da memória em até 31 minutos, mesmo sem nova pergunta", () => {
    vi.useFakeTimers();
    try {
      const conversas = new ConversasEmMemoria(lerConfiguracao({} as NodeJS.ProcessEnv).limites);
      const guardadas = () => (conversas as unknown as { conversas: Map<string, unknown> }).conversas.size;
      const c = conversas.abrir("u1", undefined);
      conversas.registrar(c, { pergunta: "Quantas festas em novembro?", resposta: "4.", consultas: [] });
      vi.advanceTimersByTime(29 * 60_000);
      expect(guardadas()).toBe(1);
      vi.advanceTimersByTime(2 * 60_000);
      expect(guardadas()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("métricas: sem pergunta, sem resposta, sem nomes; usuário como hash", async () => {
    const roteiro = new Roteiro([chama("contarProdutos", {}), diz("Há 1 produto: Arco Dourado.")]);
    const { nucleo, linhas } = montar(roteiro);
    await nucleo.responder(entrada("Quantos produtos a Renata Souza alugou?"));
    const linha = linhas.at(-1)!;
    expect(linha).not.toContain("Renata");
    expect(linha).not.toContain("Arco Dourado");
    expect(linha).not.toContain("u-admin");
    expect(JSON.parse(linha)).toMatchObject({ evento: "assistente_ia", resultado: "RESPOSTA", ferramentas: ["contarProdutos"], tokens: { entrada: 200, saida: 40 } });
    expect(JSON.parse(linha).custoEstimadoUsd).toBeGreaterThan(0);
  });
});

describe("provedor simulado (demonstração)", () => {
  const nomes = ferramentasDoPapel("ADMIN").map((f) => ({ nome: f.nome, descricao: "", parametros: {} }));
  async function decide(pergunta: string, historico: MensagemDoModelo[] = []) {
    const p = await new ProvedorSimulado().conversar([...historico, { papel: "usuario", texto: pergunta }], nomes);
    return p.chamadas[0] ? { nome: p.chamadas[0].nome, args: JSON.parse(p.chamadas[0].argumentos) } : { texto: p.texto };
  }

  it("escolhe a ferramenta das perguntas da fase 1", async () => {
    expect(await decide("Qual o faturamento de outubro de 2026?")).toEqual({ nome: "consultarFinanceiro", args: { periodo: "outubro de 2026" } });
    expect(await decide("Quanto temos contratado para novembro?")).toEqual({ nome: "consultarFinanceiro", args: { periodo: "novembro" } });
    expect(await decide("Quantas festas temos em novembro?")).toEqual({ nome: "consultarFestas", args: { periodo: "novembro" } });
    expect(await decide("Temos alguma festa no dia 14/11?")).toEqual({ nome: "consultarFestas", args: { periodo: "dia 14/11" } });
    expect(await decide("Quantas reservas estão aguardando devolução?")).toEqual({ nome: "consultarPendencias", args: { tipo: "AGUARDANDO_DEVOLUCAO" } });
    expect(await decide("Quais reservas estão com saldo pendente?")).toEqual({ nome: "consultarPendencias", args: { tipo: "SALDO_EM_ABERTO" } });
    expect(await decide("Quantas festas foram canceladas no mês?")).toEqual({ nome: "consultarCancelamentos", args: { periodo: "este mes" } });
    expect(await decide("Qual a conversão comercial?")).toEqual({ nome: "consultarPropostas", args: { periodo: "este mes" } });
    expect(await decide("Quais produtos estão sem utilização registrada?")).toEqual({ nome: "consultarUsoDoAcervo", args: {} });
    expect(await decide("Tem disponibilidade do arco dourado no dia 14/11?")).toEqual({
      nome: "consultarDisponibilidadeDeProduto",
      args: { produto: "arco dourado", data: "dia 14/11" },
    });
    expect(await decide("Qual o valor de crédito disponível das clientes?")).toEqual({ nome: "consultarFinanceiro", args: { periodo: "este mes" } });
    expect(await decide("Quanto de pró-labore saiu em outubro?")).toEqual({ nome: "consultarRetiradasDosSocios", args: { periodo: "outubro" } });
    expect(await decide("Quanto foi de distribuição de lucros?")).toEqual({ nome: "consultarRetiradasDosSocios", args: {} });
    expect(await decide("Teve devolução de aporte este ano?")).toMatchObject({ nome: "consultarRetiradasDosSocios" });
    expect(await decide("Quantas reservas estão prontas para retirada?")).not.toMatchObject({ nome: "consultarRetiradasDosSocios" });
    expect(await decide("Cadastre um produto novo")).toMatchObject({ nome: "solicitarOperacao" });
    expect(await decide("Quantas festas temos?")).toMatchObject({ texto: expect.stringContaining("Para qual período") });
  });

  it("redige a resposta de retiradas com os números da ferramenta", async () => {
    const { nucleo } = montar(new ProvedorSimulado());
    const r = await nucleo.responder(entrada("Quanto de pró-labore saiu em outubro?"));
    expect(r.ferramentas).toEqual(["consultarRetiradasDosSocios"]);
    expect(r.texto).toContain("R$ 1.800,00");
    expect(r.texto).toContain("pró-labore R$ 1.500,00");
    expect(r.texto).toContain("Ana R$ 1.500,00");
    expect(r.texto).toContain("não muda o Resultado Operacional");
  });

  it("continuação mantém o período e filtra as pagas", async () => {
    const contexto: MensagemDoModelo = {
      papel: "sistema",
      texto: `${PREFIXO_DO_CONTEXTO}${JSON.stringify([{ nome: "consultarFestas", args: { periodo: "novembro" } }])}`,
    };
    expect(await decide("E quantas delas já estão pagas?", [contexto])).toEqual({
      nome: "consultarFestas",
      args: { periodo: "novembro", situacaoDePagamento: "QUITADO" },
    });
  });
});
