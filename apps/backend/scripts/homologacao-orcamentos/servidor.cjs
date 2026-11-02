// Servidor da homologação da disponibilidade dos orçamentos: a API compilada
// de verdade, com rotas /__orc/* que só montam o cenário (tokens, peças,
// kits, reservas fictícias) e simulam o que um teste de API não alcança — uma
// aprovação segurando a trava da data enquanto outro envio chega. Só roda
// contra banco LOCAL e fora de produção. Ver README.md.
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

const dist = (p) => require(path.join(BACKEND, "dist", p));
const { AppModule } = dist("app.module.js");
const { PrismaExceptionFilter } = dist("common/prisma-exception.filter.js");
const { AvailabilityService } = dist("modules/availability/availability.service.js");
const { OrcamentosService } = dist("modules/orcamentos/orcamentos.service.js");

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const slug = (nome) =>
  `${nome}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function main() {
  const app = await NestFactory.create(AppModule, { cors: true, logger: ["error", "warn"] });
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.setGlobalPrefix("api/v1");
  const http = app.getHttpAdapter().getInstance();
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
        r.status(e && e.status ? e.status : 500).json({ erro: String(e && e.message ? e.message : e) });
      }
    });

  const disponibilidade = app.get(AvailabilityService);
  const orcamentos = app.get(OrcamentosService);

  rota("get", "/__orc/token", async (q) => {
    const email = `${q.papel.toLowerCase()}-orcamentos@homologacao.invalid`;
    const u =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { name: `Equipe ${q.papel}`, email, role: q.papel } }));
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email: u.email, role: u.role }), id: u.id };
  });

  // Peça fictícia do acervo, com o estoque do cenário.
  rota("post", "/__orc/produto", async (b) => {
    const p = await prisma.product.create({
      data: { name: b.nome, slug: slug(b.nome), unitPrice: b.preco ?? 50, stockQuantity: b.estoque, category: b.categoria ?? "DECORACAO" },
    });
    return { id: p.id, slug: p.slug };
  });

  rota("post", "/__orc/kit", async (b) => {
    const k = await prisma.kit.create({
      data: {
        name: b.nome,
        slug: slug(b.nome),
        basePrice: b.preco ?? 500,
        products: { create: b.pecas.map((p) => ({ productId: p.productId, quantity: p.quantidade })) },
      },
    });
    return { id: k.id };
  });

  // Reserva da loja sem sinal: nasce pela venda manual (com a checagem de
  // estoque de sempre) e vira PENDING, pedida há `minutosAtras` minutos.
  rota("post", "/__orc/reserva-da-loja-sem-sinal", async (b) => {
    const r = await prisma.reservation.update({
      where: { id: b.reservaId },
      data: { status: "PENDING", requestedAt: new Date(Date.now() - b.minutosAtras * 60_000) },
      select: { id: true, contractSeq: true },
    });
    return r;
  });
  rota("get", "/__orc/reserva", async (q) =>
    prisma.reservation.findUnique({ where: { id: q.id }, select: { id: true, contractSeq: true, status: true } }),
  );

  // Uma aprovação em andamento: pega a trava da data (a mesma da aprovação e
  // do envio), marca a proposta como aprovada e só confirma depois de `ms`.
  rota("post", "/__orc/aprovacao-lenta", async (b) => {
    const inicio = Date.now();
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`aprovacao-de-proposta:${b.dia}`}))`;
        await tx.orcamento.update({
          where: { id: b.orcamentoId },
          data: { status: "APROVADO", aprovadoEm: new Date(), aprovadoPorNome: "Cliente de teste", opcaoAprovadaId: b.opcaoId },
        });
        await esperar(b.ms);
      },
      { timeout: b.ms + 10_000 },
    );
    return { segurouPor: Date.now() - inicio };
  });

  // Proposta que saiu antes desta entrega: marcada como enviada direto no
  // banco, sem passar pela conferência do envio.
  rota("post", "/__orc/enviada-sem-conferencia", async (b) =>
    prisma.orcamento.update({ where: { id: b.id }, data: { status: "ENVIADO", enviadoEm: new Date() }, select: { id: true } }),
  );
  rota("get", "/__orc/orcamento", async (q) =>
    prisma.orcamento.findUnique({
      where: { id: q.id },
      select: { status: true, enviadoEm: true, primeiroEnvioEm: true, updatedAt: true, composicaoDoKit: true },
    }),
  );
  rota("get", "/__orc/contagem", async () => ({ orcamentos: await prisma.orcamento.count(), reservas: await prisma.reservation.count() }));

  // A leitura reserva por reserva soma o mesmo que a conta oficial do dia.
  rota("get", "/__orc/equivalencia", async (q) => {
    const dia = q.dia;
    const oficial = await disponibilidade.compromissoDoDia(new Date(`${dia}T12:00:00.000Z`));
    const porReserva = (await disponibilidade.compromissosPorReserva([dia], new Date())).get(dia) ?? [];
    const somado = new Map();
    for (const r of porReserva) for (const [id, n] of r.itens) somado.set(id, (somado.get(id) ?? 0) + n);
    const chaves = new Set([...oficial.keys(), ...somado.keys()]);
    const diferencas = [...chaves].filter((id) => (oficial.get(id) ?? 0) !== (somado.get(id) ?? 0));
    return { produtos: chaves.size, diferencas };
  });

  // A conta antiga das propostas aprovadas (a da Malu) e a nova somam igual.
  rota("get", "/__orc/aprovadas", async (q) => {
    const antiga = (await orcamentos.seguradoPorAprovadas(new Date(`${q.dia}T12:00:00.000Z`))).total;
    const nova = new Map();
    for (const p of (await orcamentos.aprovadasQueSeguram([q.dia])).get(q.dia) ?? [])
      for (const [id, n] of p.itens) nova.set(id, (nova.get(id) ?? 0) + n);
    const chaves = new Set([...antiga.keys(), ...nova.keys()]);
    return { produtos: chaves.size, diferencas: [...chaves].filter((id) => (antiga.get(id) ?? 0) !== (nova.get(id) ?? 0)) };
  });

  // A liberação oficial das reservas sem sinal vencidas: roda quando o
  // calendário da loja é aberto. Aqui, no banco descartável, para conferir
  // que o aviso aponta exatamente as reservas que ela libera.
  rota("post", "/__orc/abrir-calendario-da-loja", async (b) => {
    await disponibilidade.getMonth(b.mes);
    return { ok: true };
  });

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3340);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação da disponibilidade dos orçamentos em http://localhost:${porta}`);
}
main();
