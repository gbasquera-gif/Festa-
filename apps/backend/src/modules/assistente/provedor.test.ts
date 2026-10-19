import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerConfiguracao } from "./configuracao";
import { FalhaDoProvedor, ProvedorOpenAI, extensaoDoAudio } from "./provedor";

/**
 * O provedor OpenAI contra um servidor local que imita a API.
 *
 * Confere o que sai daqui (rota, chave no cabeçalho, formato das ferramentas,
 * das mensagens de ferramenta, do multipart do áudio) e como as respostas e os
 * erros voltam. Não substitui o teste com a OpenAI de verdade, que depende de
 * chave e de rede liberada — fica para a homologação.
 */

type Pedido = { caminho: string; cabecalhos: IncomingMessage["headers"]; corpo: Buffer };
let servidor: Server;
let base = "";
const pedidos: Pedido[] = [];
let proximaResposta: { status: number; corpo: string | Buffer; tipo?: string; atrasoMs?: number } = { status: 200, corpo: "{}" };

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => {
      pedidos.push({ caminho: req.url ?? "", cabecalhos: req.headers, corpo: Buffer.concat(partes) });
      const r = proximaResposta;
      setTimeout(() => {
        res.writeHead(r.status, { "content-type": r.tipo ?? "application/json" });
        res.end(r.corpo);
      }, r.atrasoMs ?? 0);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

function provedor() {
  const cfg = lerConfiguracao({ NODE_ENV: "test", OPENAI_API_KEY: "sk-teste-local", OPENAI_BASE_URL: base } as NodeJS.ProcessEnv);
  expect(cfg.modo).toBe("OPENAI");
  return new ProvedorOpenAI(cfg.openai);
}
const sinal = () => new AbortController().signal;

describe("ProvedorOpenAI", () => {
  it("chat com ferramentas: formato de envio e leitura de tool_calls e uso", async () => {
    proximaResposta = {
      status: 200,
      corpo: JSON.stringify({
        choices: [{ message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "consultarFestas", arguments: '{"periodo":"novembro"}' } }] } }],
        usage: { prompt_tokens: 1500, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 1024 } },
      }),
    };
    const passo = await provedor().conversar(
      [
        { papel: "sistema", texto: "instruções" },
        { papel: "usuario", texto: "Quantas festas em novembro?" },
        { papel: "assistente", texto: null, chamadas: [{ id: "call_0", nome: "contarProdutos", argumentos: "{}" }] },
        { papel: "ferramenta", chamadaId: "call_0", nome: "contarProdutos", conteudo: '{"produtosAtivos":3}' },
      ],
      [{ nome: "consultarFestas", descricao: "Festas", parametros: { type: "object", properties: { periodo: { type: "string" } } } }],
      sinal(),
    );
    expect(passo).toEqual({
      texto: null,
      chamadas: [{ id: "call_1", nome: "consultarFestas", argumentos: '{"periodo":"novembro"}' }],
      uso: { entrada: 1500, entradaEmCache: 1024, saida: 40 },
    });
    const pedido = pedidos.at(-1)!;
    expect(pedido.caminho).toBe("/v1/chat/completions");
    expect(pedido.cabecalhos.authorization).toBe("Bearer sk-teste-local");
    const corpo = JSON.parse(pedido.corpo.toString());
    expect(corpo).toMatchObject({ model: "gpt-5.4-mini", tool_choice: "auto", max_completion_tokens: 1200 });
    expect(corpo.temperature).toBeUndefined();
    expect(corpo.tools[0]).toEqual({
      type: "function",
      function: { name: "consultarFestas", description: "Festas", parameters: { type: "object", properties: { periodo: { type: "string" } } } },
    });
    expect(corpo.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(corpo.messages[2].tool_calls[0]).toEqual({ id: "call_0", type: "function", function: { name: "contarProdutos", arguments: "{}" } });
    expect(corpo.messages[3]).toEqual({ role: "tool", tool_call_id: "call_0", content: '{"produtosAtivos":3}' });
  });

  it("transcrição: multipart com arquivo, modelo, idioma e vocabulário", async () => {
    proximaResposta = { status: 200, corpo: JSON.stringify({ text: " Quantas festas temos no dia 14 de novembro? " }) };
    const texto = await provedor().transcrever(Buffer.from("audio-falso"), "audio/mp4", sinal());
    expect(texto).toBe("Quantas festas temos no dia 14 de novembro?");
    const pedido = pedidos.at(-1)!;
    expect(pedido.caminho).toBe("/v1/audio/transcriptions");
    expect(String(pedido.cabecalhos["content-type"])).toContain("multipart/form-data");
    const corpo = pedido.corpo.toString("latin1");
    expect(corpo).toContain('filename="pergunta.m4a"');
    expect(corpo).toContain("gpt-4o-mini-transcribe");
    expect(corpo).toMatch(/name="language"\r\n\r\npt/);
    expect(pedido.corpo.toString("utf8")).toContain("Festaê, festa, reserva, orçamento");
    expect(corpo).toContain("audio-falso");
  });

  it("voz: mp3 com o modelo e a voz configurados", async () => {
    proximaResposta = { status: 200, corpo: Buffer.from([0xff, 0xfb, 0x90]), tipo: "audio/mpeg" };
    const { audio, mimeType } = await provedor().falar("Há 3 festas em novembro.", sinal());
    expect(mimeType).toBe("audio/mpeg");
    expect([...audio]).toEqual([0xff, 0xfb, 0x90]);
    const corpo = JSON.parse(pedidos.at(-1)!.corpo.toString());
    expect(corpo).toMatchObject({ model: "gpt-4o-mini-tts", voice: "coral", input: "Há 3 festas em novembro.", response_format: "mp3" });
    expect(corpo.instructions).toContain("português do Brasil");
  });

  it("erros viram falhas classificadas, sem o corpo da resposta", async () => {
    for (const [status, tipo] of [
      [401, "AUTENTICACAO"],
      [429, "LIMITE_DO_PROVEDOR"],
      [500, "INDISPONIVEL"],
    ] as const) {
      proximaResposta = { status, corpo: JSON.stringify({ error: { message: "eco da pergunta: Renata" } }) };
      const erro = await provedor().conversar([{ papel: "usuario", texto: "x" }], [], sinal()).catch((e) => e);
      expect(erro).toBeInstanceOf(FalhaDoProvedor);
      expect((erro as FalhaDoProvedor).tipo).toBe(tipo);
      expect((erro as Error).message).not.toContain("Renata");
    }
    proximaResposta = { status: 200, corpo: JSON.stringify({ choices: [] }) };
    await expect(provedor().conversar([{ papel: "usuario", texto: "x" }], [], sinal())).rejects.toMatchObject({ tipo: "RESPOSTA_INVALIDA" });
  });

  it("tempo esgotado e rede fora", async () => {
    proximaResposta = { status: 200, corpo: "{}", atrasoMs: 500 };
    const controle = new AbortController();
    setTimeout(() => controle.abort(), 50);
    await expect(provedor().conversar([{ papel: "usuario", texto: "x" }], [], controle.signal)).rejects.toMatchObject({ tipo: "TEMPO_ESGOTADO" });

    const semRede = new ProvedorOpenAI({ ...lerConfiguracao({ OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv).openai, urlBase: "http://127.0.0.1:9/v1" });
    await expect(semRede.conversar([{ papel: "usuario", texto: "x" }], [], sinal())).rejects.toMatchObject({ tipo: "INDISPONIVEL" });
  });

  it("formatos de áudio aceitos, incluindo o do iPhone", () => {
    expect(extensaoDoAudio("audio/webm;codecs=opus")).toBe("webm");
    expect(extensaoDoAudio("audio/mp4")).toBe("m4a");
    expect(extensaoDoAudio("audio/mpeg")).toBe("mp3");
    expect(extensaoDoAudio("video/mp4")).toBeNull();
  });
});

describe("configuração", () => {
  it("sem chave: demonstração fora de produção, desligado em produção", () => {
    expect(lerConfiguracao({ NODE_ENV: "development" } as NodeJS.ProcessEnv).modo).toBe("SIMULADO");
    expect(lerConfiguracao({ NODE_ENV: "production" } as NodeJS.ProcessEnv).modo).toBe("DESLIGADO");
    expect(lerConfiguracao({ NODE_ENV: "production", ASSISTENTE_IA_PROVEDOR: "openai" } as NodeJS.ProcessEnv).modo).toBe("DESLIGADO");
    expect(lerConfiguracao({ NODE_ENV: "production", OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv).modo).toBe("OPENAI");
    expect(lerConfiguracao({ NODE_ENV: "production", OPENAI_API_KEY: "k", ASSISTENTE_IA_PROVEDOR: "desligado" } as NodeJS.ProcessEnv).modo).toBe("DESLIGADO");
  });

  it("voz do servidor só com OpenAI, e pode ser trocada pela do navegador", () => {
    expect(lerConfiguracao({ OPENAI_API_KEY: "k" } as NodeJS.ProcessEnv).saidaDeVoz).toBe("OPENAI");
    expect(lerConfiguracao({ OPENAI_API_KEY: "k", ASSISTENTE_IA_SAIDA_DE_VOZ: "navegador" } as NodeJS.ProcessEnv).saidaDeVoz).toBe("NAVEGADOR");
    expect(lerConfiguracao({} as NodeJS.ProcessEnv).saidaDeVoz).toBe("NAVEGADOR");
  });
});
