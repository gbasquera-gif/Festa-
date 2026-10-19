import { describe, expect, it, vi } from "vitest";
import { lerConfiguracao } from "./configuracao";
import { MetricasDoAssistente } from "./controle";
import { CATALOGO, ferramentasDoPapel, type ServicosDoAssistente } from "./ferramentas";
import { MENSAGEM_DE_OPERACAO_NAO_AUTORIZADA, type EntradaDoAssistente } from "./contrato";
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
    expect(await decide("Cadastre um produto novo")).toMatchObject({ nome: "solicitarOperacao" });
    expect(await decide("Quantas festas temos?")).toMatchObject({ texto: expect.stringContaining("Para qual período") });
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
