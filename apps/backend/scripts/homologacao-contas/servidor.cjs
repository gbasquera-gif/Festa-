// Servidor da homologação de contas a pagar: a API compilada de verdade, com
// rotas /__contas/* que só montam o cenário (tokens de cada papel), chamam os
// serviços com um "hoje" escolhido (para testar fevereiro, virada de ano,
// pausa e retomada sem esperar o calendário) e rodam a tarefa agendada com
// relógio e transporte de e-mail de teste. Só roda contra banco LOCAL e fora
// de produção. Ver README.md.
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
if (process.env.AVISOS_EMAIL_PROVEDOR !== "arquivo" || !process.env.AVISOS_EMAIL_DIRETORIO) {
  console.error("Recusado: a homologação usa só o transporte de e-mail em arquivo.");
  process.exit(1);
}

req("reflect-metadata");
const { NestFactory } = req("@nestjs/core");
const { ThrottlerGuard } = req("@nestjs/throttler");
const { JwtService } = req("@nestjs/jwt");
const { prisma } = req("@festae/database");
ThrottlerGuard.prototype.canActivate = async () => true;

const dist = (p) => require(path.join(BACKEND, "dist", p));
const { AppModule } = dist("app.module.js");
const { PrismaExceptionFilter } = dist("common/prisma-exception.filter.js");
const { RecorrenciasService } = dist("modules/contas-a-pagar/recorrencias.service.js");
const { ContasService } = dist("modules/contas-a-pagar/contas.service.js");
const { gerarContasAutomaticas } = dist("modules/contas-a-pagar/geracao.js");
const { executarTarefaDeContas } = dist("modules/contas-a-pagar/avisos/processar.js");
const { TransporteArquivo } = dist("modules/contas-a-pagar/avisos/transporte.js");

async function main() {
  const app = await NestFactory.create(AppModule, { cors: true, logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("api/v1");
  const http = app.getHttpAdapter().getInstance();
  // As rotas daqui entram antes do leitor de JSON do Nest: o corpo é lido à mão.
  const corpo = (q) =>
    new Promise((ok, erro) => {
      let dados = "";
      q.on("data", (c) => (dados += c));
      q.on("end", () => {
        try {
          ok(dados ? JSON.parse(dados) : {});
        } catch (e) {
          erro(e);
        }
      });
      q.on("error", erro);
    });
  const rota = (metodo, caminho, fn) =>
    http[metodo](caminho, async (q, r) => {
      try {
        r.json((await fn(metodo === "get" ? q.query : await corpo(q))) ?? null);
      } catch (e) {
        r.status(e && e.status ? e.status : 500).json({ erro: String(e && e.message ? e.message : e), status: e?.status });
      }
    });

  rota("get", "/__contas/token", async (q) => {
    const email = `${q.papel.toLowerCase()}-contas@homologacao.invalid`;
    const u =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { name: `Equipe ${q.papel}`, email, role: q.papel } }));
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email: u.email, role: u.role }), id: u.id };
  });

  // Um método dos serviços com o "hoje" do cenário (último argumento).
  const servicos = { recorrencias: app.get(RecorrenciasService), contas: app.get(ContasService) };
  rota("post", "/__contas/chamar", async (b) => servicos[b.servico][b.metodo](...b.args));
  rota("post", "/__contas/gerar", async (b) => gerarContasAutomaticas(b.hoje, b.recorrenciaId));

  // A tarefa agendada com relógio e transporte de teste.
  rota("post", "/__contas/tarefa", async (b) =>
    executarTarefaDeContas({
      agora: new Date(b.agora),
      transporte: b.semEmail ? null : new TransporteArquivo(process.env.AVISOS_EMAIL_DIRETORIO, b.falha ?? null),
      motivoSemEmail: b.semEmail ? "teste sem e-mail" : null,
      painel: "https://painel.exemplo.invalid",
    }),
  );

  rota("get", "/__contas/gastos", async (q) =>
    (await prisma.gasto.findMany({ where: { recorrenciaId: q.recorrenciaId }, orderBy: { competencia: "asc" } })).map((g) => ({
      id: g.id,
      competencia: g.competencia,
      venceEm: g.venceEm && g.venceEm.toISOString().slice(0, 10),
      pagoEm: g.pagoEm && g.pagoEm.toISOString().slice(0, 10),
      valor: Number(g.valor),
      descricao: g.descricao,
    })),
  );
  rota("get", "/__contas/conferencias", async (q) =>
    prisma.conferenciaDeRecorrencia.findMany({ where: { recorrenciaId: q.recorrenciaId }, orderBy: { competencia: "asc" } }),
  );
  rota("get", "/__contas/notificacoes", async (q) =>
    prisma.notificacaoDeConta.findMany({ where: q.gastoId ? { gastoId: q.gastoId } : {}, orderBy: { criadaEm: "asc" } }),
  );
  rota("get", "/__contas/envios", async () =>
    prisma.envioDeAviso.findMany({ orderBy: { criadoEm: "asc" }, include: { itens: true } }),
  );
  rota("get", "/__contas/execucoes", async () => prisma.execucaoDeTarefa.findMany({ orderBy: { iniciadaEm: "asc" } }));
  // Simula a queda do processo no meio de um envio.
  rota("post", "/__contas/prender-envio", async (b) =>
    prisma.envioDeAviso.update({
      where: { id: b.id },
      data: { situacao: "ENVIANDO", travadoAte: new Date(b.travadoAte), primeiraTentativaEm: new Date(b.primeiraTentativaEm) },
    }),
  );
  rota("post", "/__contas/destinatario-confirmado", async (b) =>
    prisma.destinatarioDeAviso.create({ data: { email: b.email, verificadoEm: new Date() } }),
  );
  rota("post", "/__contas/limpar-avisos", async () => {
    await prisma.itemDoEnvio.deleteMany({});
    await prisma.envioDeAviso.deleteMany({});
    await prisma.notificacaoDeConta.deleteMany({});
    await prisma.destinatarioDeAviso.deleteMany({});
    await prisma.travaDeTarefa.deleteMany({});
    return { ok: true };
  });

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3360);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação de contas a pagar em http://localhost:${porta}`);
}
main();
