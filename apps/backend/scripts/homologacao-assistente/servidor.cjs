// Servidor de homologação do Assistente IA: a API compilada de verdade, com
// uma rota a mais que mostra o que cada ferramenta devolveu — é assim que a
// homologação confere se algum número da resposta não veio dos dados.
//
// Só roda contra banco LOCAL e fora de produção. Ver README.md.
const path = require("node:path");
const { createRequire } = require("node:module");

const BACKEND = path.resolve(__dirname, "../..");
const req = createRequire(path.join(BACKEND, "package.json"));

const url = process.env.DATABASE_URL ?? "";
const host = url.match(/@([^:/?]+)/)?.[1];
if (!["localhost", "127.0.0.1"].includes(host) || process.env.NODE_ENV === "production") {
  console.error("Recusado: a homologação só roda com banco local (localhost) e fora de produção.");
  process.exit(1);
}

req("reflect-metadata");
const { NestFactory } = req("@nestjs/core");
const { AppModule } = require(path.join(BACKEND, "dist/app.module.js"));
const { PrismaExceptionFilter } = require(path.join(BACKEND, "dist/common/prisma-exception.filter.js"));
const { NucleoDoAssistente } = require(path.join(BACKEND, "dist/modules/assistente/nucleo.js"));

// Tudo o que sai para a OpenAI fica guardado aqui, só na memória deste
// processo, para a homologação conferir que nenhum nome ou contato saiu.
const envios = [];
const urlDaOpenAI = (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opcoes = {}) => {
  const destino = String(url instanceof Request ? url.url : url);
  if (destino.startsWith(urlDaOpenAI)) {
    envios.push({ caminho: destino.slice(urlDaOpenAI.length), corpo: typeof opcoes.body === "string" ? opcoes.body : null });
  }
  return fetchOriginal(url, opcoes);
};

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("api/v1");

  const nucleo = app.get(NucleoDoAssistente);
  const registro = [];
  const executar = nucleo.executar.bind(nucleo);
  // Repassa tudo: o último argumento é a tabela de códigos da conversa, sem
  // ela cada consulta ganharia códigos próprios e a pessoa veria "[F1]".
  nucleo.executar = async (nome, args, identidade, agora, ...resto) => {
    const r = await executar(nome, args, identidade, agora, ...resto);
    registro.push({ n: registro.length, nome, args, papel: identidade.papel, tipo: r.tipo ?? null, dados: r.dados });
    return r;
  };
  app.getHttpAdapter().getInstance().get("/__homologacao/consultas", (q, r) => r.json(registro.slice(Number(q.query.desde ?? 0))));
  app.getHttpAdapter().getInstance().get("/__homologacao/envios", (q, r) => r.json(envios.slice(Number(q.query.desde ?? 0))));

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3340);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação do assistente em http://localhost:${porta}`);
}
main();
