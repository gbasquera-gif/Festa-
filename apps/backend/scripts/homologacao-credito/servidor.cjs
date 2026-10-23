// Servidor da homologação do crédito Festaê: a API compilada de verdade, com
// rotas /__credito/* que só montam o cenário (fichas, tokens de cada papel) e
// provam o gatilho do extrato. Só roda contra banco LOCAL e fora de produção.
// Ver README.md.
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
const { ThrottlerGuard } = req("@nestjs/throttler");
const { JwtService } = req("@nestjs/jwt");
const { prisma } = req("@festae/database");
ThrottlerGuard.prototype.canActivate = async () => true;

const { AppModule } = require(path.join(BACKEND, "dist/app.module.js"));
const { PrismaExceptionFilter } = require(path.join(BACKEND, "dist/common/prisma-exception.filter.js"));

async function main() {
  const app = await NestFactory.create(AppModule, { cors: true, logger: ["error", "warn", "log"] });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("api/v1");
  const http = app.getHttpAdapter().getInstance();
  const rota = (caminho, fn) =>
    http.get(caminho, async (q, r) => {
      try {
        r.json(await fn(q.query));
      } catch (e) {
        r.status(500).json({ erro: String(e && e.message ? e.message : e) });
      }
    });

  // Token de um usuário do papel pedido (cria se não existir), só neste banco local.
  rota("/__credito/token", async (q) => {
    const email = `${q.papel.toLowerCase()}-credito@homologacao.invalid`;
    const u =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { name: `Equipe ${q.papel}`, email, role: q.papel } }));
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email: u.email, role: u.role }), id: u.id };
  });
  // Ficha de cliente direto no banco (para os casos de ambiguidade).
  rota("/__credito/ficha", async (q) => {
    const u = await prisma.user.create({
      data: { name: q.nome, email: q.email || null, phone: q.telefone || null, role: "CLIENT" },
    });
    return { id: u.id };
  });
  // Tenta alterar e apagar um movimento de crédito: o gatilho tem de recusar.
  rota("/__credito/mexer-no-credito", async (q) => {
    const erros = [];
    try {
      await prisma.creditoClienteMovimento.update({ where: { id: q.id }, data: { valor: 999 } });
    } catch (e) {
      erros.push(String(e.message).split("\n").filter(Boolean).pop());
    }
    try {
      await prisma.creditoClienteMovimento.delete({ where: { id: q.id } });
    } catch (e) {
      erros.push(String(e.message).split("\n").filter(Boolean).pop());
    }
    const ainda = await prisma.creditoClienteMovimento.findUnique({ where: { id: q.id } });
    return { erros, valor: ainda ? Number(ainda.valor) : null };
  });
  rota("/__credito/movimentos", async (q) => {
    const ms = await prisma.creditoClienteMovimento.findMany({ where: { userId: q.userId }, orderBy: { numero: "asc" } });
    return ms.map((m) => ({ id: m.id, tipo: m.tipo, valor: Number(m.valor), destino: m.reservationDestinoId, chave: m.chaveDeIdempotencia }));
  });
  rota("/__credito/reservas-da-cliente", async (q) => ({
    total: await prisma.reservation.count({ where: { order: { event: { userId: q.userId } } } }),
  }));
  rota("/__credito/entradas", async () => {
    const pagos = await prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amount: true }, _count: true });
    return { soma: Number(pagos._sum.amount ?? 0), quantidade: pagos._count };
  });

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3350);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação do crédito em http://localhost:${porta}`);
}
main();
