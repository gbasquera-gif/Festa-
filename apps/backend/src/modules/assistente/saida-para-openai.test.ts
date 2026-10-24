import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DespesaParaAnalise } from "@festae/shared";
import { lerConfiguracao } from "./configuracao";
import { MetricasDoAssistente } from "./controle";
import type { EntradaDoAssistente } from "./contrato";
import type { ServicosDoAssistente } from "./ferramentas";
import { NucleoDoAssistente } from "./nucleo";
import { ProvedorOpenAI } from "./provedor";

/**
 * O que sai do servidor para a OpenAI, byte a byte.
 *
 * O núcleo e o provedor de verdade conversam com um servidor local que imita
 * a API. Uma conversa passa por todas as ferramentas que levam nomes —
 * festas, cancelamentos, devoluções, retiradas dos sócios e despesas por
 * fornecedor e por categoria — com dados fictícios cheios de nomes, e-mails,
 * telefones e documentos. Nenhum deles pode aparecer no que foi enviado: nem
 * no resultado das ferramentas, nem no histórico, nem no contexto das
 * consultas anteriores. Na tela, a pessoa vê os nomes.
 */

const AGORA = new Date("2026-10-21T15:00:00Z");
const dia = (d: string) => new Date(`${d}T00:00:00.000Z`);

// ---------------------------------------------------------------- dados fictícios

const festa = (
  numero: number,
  cliente: { nome: string; telefone: string | null; email: string | null },
  festaEm: string,
  status: string,
  extra: { canceladaEm?: Date; vigente?: boolean } = {},
) => ({
  linha: {
    comercial: { numero, vigente: extra.vigente ?? true, festaEm, status, situacao: "PARCIAL", valor: 1000, saldo: 500, cliente },
    apurado: {},
  },
  canceladaEm: extra.canceladaEm ?? null,
});

const CARTEIRA = [
  festa(41, { nome: "Joana Pereira Fictícia", telefone: "(49) 99876-0001", email: "joana.pereira@exemplo.invalid" }, "2026-11-14", "CONFIRMED"),
  festa(42, { nome: "Joana Batista Fictícia", telefone: "49 99876-0002", email: null }, "2026-11-20", "CONFIRMED"),
  festa(43, { nome: "Marcos Lemos Fictício", telefone: null, email: "marcos.lemos@exemplo.invalid" }, "2026-11-05", "CANCELLED", {
    vigente: false,
    canceladaEm: new Date("2026-10-10T15:00:00Z"),
  }),
  festa(44, { nome: "Helena Duarte Fictícia", telefone: "49998760004", email: null }, "2026-10-12", "AGUARDANDO_DEVOLUCAO"),
];

let n = 0;
const despesa = (valor: number, extra: Partial<DespesaParaAnalise>): DespesaParaAnalise => {
  n += 1;
  return { id: `d${n}`, descricao: `Lançamento ${n}`, natureza: "CUSTEIO", valor, pagoEm: null, venceEm: null, categoria: null, fornecedor: null, ...extra };
};
const DESPESAS: DespesaParaAnalise[] = [
  despesa(450, { fornecedor: "Freelancer Paula Fictícia", categoria: "Mão de obra Fictícia", descricao: "Pix CPF 123.456.789-09 Paula", pagoEm: dia("2026-10-05") }),
  despesa(120, {
    fornecedor: "Clínica Dra. Helena Fictícia",
    categoria: "Reembolso da cliente Joana Pereira",
    descricao: "Reembolso festa Joana tel 49 99876-0001",
    pagoEm: dia("2026-10-08"),
  }),
  despesa(300, { natureza: "CONSUMO", fornecedor: "Loja Fictícia de Balões", categoria: "Decoração Fictícia", descricao: "Balões da festa da Joana", pagoEm: dia("2026-10-10") }),
  despesa(80, { natureza: "CONSUMO", fornecedor: "Atacado Fictício Kappa", categoria: "Material Fictício", descricao: "Nota fiscal 4521", pagoEm: dia("2026-10-12") }),
];

/**
 * O que nunca pode sair, já normalizado (minúsculas, sem acento): nomes de
 * clientes, sócios, fornecedores e categorias; e-mails; telefones; CPF;
 * trechos das descrições.
 */
const PROIBIDOS = [
  "joana",
  "pereira",
  "batista",
  "marcos",
  "lemos",
  "helena",
  "duarte",
  "rafaela",
  "moraes",
  "tiago",
  "nunes",
  "paula",
  "fictici",
  "kappa",
  "exemplo.invalid",
  "99876",
  "998760004",
  "123.456.789",
  "12345678909",
  "nota fiscal 4521",
];
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const vazados = (texto: string) => PROIBIDOS.filter((p) => normalizar(texto).includes(p));

function servicos(): ServicosDoAssistente {
  const contar = (campo: "fornecedor" | "categoria") => {
    const m = new Map<string, number>();
    for (const d of DESPESAS) if (d[campo]) m.set(d[campo]!, (m.get(d[campo]!) ?? 0) + 1);
    return [...m].map(([nome, lancamentos]) => ({ nome, lancamentos }));
  };
  const tot = (d: number, p: number, a: number) => ({ DISTRIBUICAO_DE_LUCROS: d + p, DEVOLUCAO_DE_APORTE: a, total: d + p + a });
  return {
    financeiro: {
      panorama: vi.fn() as never,
      despesasPorNatureza: vi.fn(async (mes: string) => ({ mes, consumo: 380, custeio: 570, total: 950, acervo: 0, proLabore: 0 })),
      despesasParaAnalise: vi.fn(async (de: string, ate: string) =>
        DESPESAS.filter((d) => !d.pagoEm || (d.pagoEm.toISOString().slice(0, 10) >= de && d.pagoEm.toISOString().slice(0, 10) <= ate)),
      ),
      nomesNasDespesas: vi.fn(async () => ({ fornecedores: contar("fornecedor"), categorias: contar("categoria") })),
    },
    retiradas: {
      listar: vi.fn(async () => ({
        recorte: { ano: 2026, mes: "2026-10" },
        indicadores: { mes: tot(300, 1500, 0), ano: tot(1300, 4500, 250), historico: tot(2300, 6000, 250) },
        porSocio: [
          { socioId: "s1", socio: "Rafaela Moraes Fictícia", mes: 1500, ano: 3000, historico: 5000, porCategoria: tot(0, 5000, 0) },
          { socioId: "s2", socio: "Tiago Nunes Fictício", mes: 300, ano: 3050, historico: 3550, porCategoria: tot(2300, 1000, 250) },
        ],
        itens: [{}, {}],
        totalDoFiltro: tot(300, 1500, 0),
      })) as never,
    },
    comercial: { visaoGeral: vi.fn() as never },
    panoramaDeOrcamentos: { panorama: vi.fn() as never },
    orcamentos: { seguradoPorAprovadas: vi.fn() as never },
    acervo: { performance: vi.fn() as never },
    disponibilidade: { conflitosDeItens: vi.fn() as never },
    produtos: { findAll: vi.fn(async () => []) as never },
    carteira: vi.fn(async () => CARTEIRA) as never,
  };
}

// ---------------------------------------------------------------- a "OpenAI" local

let servidor: Server;
let base = "";
/** Cada corpo enviado a /chat/completions, como texto. */
const enviados: string[] = [];
/** As respostas, em ordem: uma chamada de ferramenta ou um texto. */
const roteiro: ({ ferramenta: string; args: Record<string, unknown> } | { texto: string })[] = [];

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => {
      enviados.push(Buffer.concat(partes).toString("utf8"));
      const passo = roteiro.shift();
      const message = !passo
        ? { content: "Roteiro acabou." }
        : "texto" in passo
          ? { content: passo.texto }
          : { content: null, tool_calls: [{ id: `call_${enviados.length}`, type: "function", function: { name: passo.ferramenta, arguments: JSON.stringify(passo.args) } }] };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 100, completion_tokens: 20 } }));
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

function montar() {
  const cfg = lerConfiguracao({ NODE_ENV: "test", OPENAI_API_KEY: "sk-teste-local", OPENAI_BASE_URL: base } as NodeJS.ProcessEnv);
  expect(cfg.modo).toBe("OPENAI");
  const linhas: string[] = [];
  const nucleo = new NucleoDoAssistente(cfg, new ProvedorOpenAI(cfg.openai), servicos(), new MetricasDoAssistente(cfg.precos, (l) => linhas.push(l)), () => AGORA);
  return { nucleo, linhas };
}

const entrada = (mensagem: string, conversaId?: string): EntradaDoAssistente => ({
  canal: "PAINEL_TEXTO",
  identidade: { usuarioId: "u-admin", papel: "ADMIN", comprovadaPor: "JWT_PAINEL" },
  mensagem,
  origem: "DIGITADA",
  ...(conversaId ? { conversaId } : {}),
});

/** Uma pergunta: a IA chama a ferramenta e responde com os códigos que recebeu. */
async function perguntar(
  nucleo: NucleoDoAssistente,
  pergunta: string,
  chamada: { ferramenta: string; args: Record<string, unknown> } | null,
  resposta: string,
  conversaId?: string,
) {
  if (chamada) roteiro.push(chamada);
  roteiro.push({ texto: resposta });
  return nucleo.responder(entrada(pergunta, conversaId));
}

describe("o que vai para a OpenAI", () => {
  it("uma conversa por todas as ferramentas com nomes: nenhum nome, contato, documento ou descrição sai; a tela mostra os nomes", async () => {
    enviados.length = 0;
    const { nucleo, linhas } = montar();
    const r1 = await perguntar(nucleo, "Quais festas temos em novembro?", { ferramenta: "consultarFestas", args: { periodo: "novembro" } }, "Em novembro: [C1] e [C2].");
    const c = r1.conversaId;
    const r2 = await perguntar(nucleo, "E quais foram canceladas em outubro?", { ferramenta: "consultarCancelamentos", args: { periodo: "outubro" } }, "Em outubro, [C3] cancelou.", c);
    const r3 = await perguntar(
      nucleo,
      "Quem ainda não devolveu o material?",
      { ferramenta: "consultarPendencias", args: { tipo: "AGUARDANDO_DEVOLUCAO" } },
      "[C4] ainda não devolveu.",
      c,
    );
    const r4 = await perguntar(nucleo, "E as retiradas dos sócios em outubro?", { ferramenta: "consultarRetiradasDosSocios", args: { periodo: "outubro" } }, "[S1] e [S2] retiraram.", c);
    const r5 = await perguntar(
      nucleo,
      "Com quais fornecedores gastamos em outubro?",
      { ferramenta: "consultarDespesas", args: { periodo: "outubro", natureza: ["CONSUMO", "CUSTEIO"], agruparPor: "FORNECEDOR" } },
      "Os fornecedores foram [F1], [F2], [F3] e [F4].",
      c,
    );
    const r6 = await perguntar(
      nucleo,
      "E por categoria?",
      { ferramenta: "consultarDespesas", args: { periodo: "outubro", natureza: ["CONSUMO", "CUSTEIO"], agruparPor: "CATEGORIA" } },
      "As categorias foram [K1], [K2], [K3] e [K4].",
      c,
    );
    const r7 = await perguntar(
      nucleo,
      "E só com o primeiro fornecedor?",
      { ferramenta: "consultarDespesas", args: { periodo: "outubro", fornecedor: "[F1]", fornecedoresConfirmados: ["[F1]"] } },
      "Com [F1], houve lançamento em outubro.",
      c,
    );

    // Saiu de fato: uma ida e uma volta por pergunta.
    expect(enviados.length).toBe(14);
    for (const corpo of enviados) expect(vazados(corpo)).toEqual([]);
    // A IA trabalhou com os códigos.
    const tudo = enviados.join("\n");
    for (const codigo of ["[C1]", "[C2]", "[C3]", "[C4]", "[S1]", "[S2]", "[F1]", "[K1]"]) expect(tudo).toContain(codigo);

    // A pessoa vê os nomes.
    expect(r1.texto).toBe("Em novembro: Joana e Joana.");
    expect(r2.texto).toBe("Em outubro, Marcos cancelou.");
    expect(r3.texto).toBe("Helena ainda não devolveu.");
    expect(r4.texto).toMatch(/Rafaela|Tiago/);
    expect(r5.texto).toMatch(/Freelancer Paula Fictícia/);
    expect(r6.texto).toMatch(/Mão de obra Fictícia/);
    expect(vazados(r7.texto).length).toBeGreaterThan(0);
    // Nem as métricas guardam nome ou contato.
    expect(vazados(linhas.join("\n"))).toEqual([]);
  });

  it("contato e documento digitados na pergunta não vão em claro (e-mail, telefone, CPF)", async () => {
    enviados.length = 0;
    const { nucleo } = montar();
    await perguntar(
      nucleo,
      "A cliente joana.pereira@exemplo.invalid, telefone (49) 99876-0001 ou +55 49 99876-0002, CPF 123.456.789-09, tem festa em novembro?",
      null,
      "Não consigo consultar uma cliente pelo contato.",
    );
    const corpo = enviados.at(-1)!;
    expect(vazados(corpo).filter((p) => p !== "joana")).toEqual([]);
    expect(corpo).toContain("[e-mail omitido]");
    expect(corpo).toContain("[telefone omitido]");
    expect(corpo).toContain("[documento omitido]");
    // O resto da pergunta continua lá: o período e o assunto.
    expect(corpo).toContain("tem festa em novembro?");
  });

  it("datas, valores e números de contrato digitados continuam como estão", async () => {
    enviados.length = 0;
    const { nucleo } = montar();
    await perguntar(nucleo, "Quanto entrou entre 01/10/2026 e 15/10/2026? O contrato nº 0041 de R$ 1.234,56 já foi pago?", null, "Ok.");
    const corpo = enviados.at(-1)!;
    expect(corpo).toContain("01/10/2026 e 15/10/2026");
    expect(corpo).toContain("nº 0041 de R$ 1.234,56");
    expect(corpo).not.toContain("omitido");
  });
});
