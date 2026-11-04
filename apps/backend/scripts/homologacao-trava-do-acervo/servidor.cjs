// Servidor da homologação da trava única do acervo: a API compilada de
// verdade, com rotas /__trv/* que só montam o cenário (produtos, kits,
// carrinho da loja) e seguram linhas do banco por alguns instantes para
// forçar duas operações a se cruzarem no meio. Só roda contra banco LOCAL e
// fora de produção, sem Mercado Pago. Ver README.md.
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
if (process.env.MP_ACCESS_TOKEN) {
  console.error("Recusado: a homologação não fala com o Mercado Pago. Tire MP_ACCESS_TOKEN do ambiente.");
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
const { OrcamentosService } = dist("modules/orcamentos/orcamentos.service.js");
const { itensDoKitDoPedido } = dist("modules/availability/item-commitment.js");
const { STATUS_QUE_COMPROMETEM } = dist("modules/availability/selecao-do-pedido.js");

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const slug = (nome) =>
  `${nome}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const meioDia = (dia) => new Date(`${dia}T12:00:00.000Z`);
/** Só estas tabelas podem ser seguradas, e o nome nunca vem livre do pedido. */
const TABELAS = { produtos: "products", reservas: "reservations", pedidos: "orders", clientes: "users" };

async function main() {
  const app = await NestFactory.create(AppModule, { cors: true, logger: ["error", "warn", "log"] });
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
        r.status(e && e.status ? e.status : 500).json({ erro: String(e && e.message ? e.message : e), status: e?.status });
      }
    });

  let usuarios = 0;
  rota("get", "/__trv/token", async (q) => {
    // Equipe: uma ficha por papel. Cliente da loja: uma ficha nova por pedido,
    // porque a reserva da loja só sai para a dona do carrinho.
    const email =
      q.papel === "CLIENT"
        ? `cliente-${Date.now().toString(36)}-${++usuarios}@homologacao.invalid`
        : `${q.papel.toLowerCase()}-trava@homologacao.invalid`;
    const u =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { name: q.nome ?? `Equipe ${q.papel}`, email, role: q.papel } }));
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email: u.email, role: u.role }), id: u.id };
  });
  rota("post", "/__trv/produto", async (b) => {
    const p = await prisma.product.create({ data: { name: b.nome, slug: slug(b.nome), unitPrice: 50, stockQuantity: b.estoque } });
    return { id: p.id, slug: p.slug };
  });
  rota("post", "/__trv/kit", async (b) => {
    const k = await prisma.kit.create({
      data: {
        name: b.nome,
        slug: slug(b.nome),
        basePrice: 100,
        products: { create: b.pecas.map((p) => ({ productId: p.produtoId, quantity: p.quantidade })) },
      },
    });
    return { id: k.id };
  });
  // O carrinho da loja pronto para virar reserva: festa da cliente, kit escolhido.
  rota("post", "/__trv/carrinho", async (b) => {
    const evento = await prisma.event.create({
      data: {
        userId: b.clienteId,
        type: "ANIVERSARIO",
        date: meioDia(b.data),
        order: {
          create: {
            kitId: b.kitId,
            subtotalKit: 100,
            total: 100,
            items: { create: (b.itens ?? []).map((i) => ({ productId: i.produtoId, quantity: i.quantidade, unitPriceSnapshot: 50 })) },
          },
        },
      },
      select: { id: true, order: { select: { id: true } } },
    });
    return { eventId: evento.id, orderId: evento.order.id };
  });
  // Segura as linhas por `ms`: quem precisar gravar nelas (ou apontar para
  // elas) espera. É o que põe duas operações no mesmo instante, de propósito.
  let segurando = 0;
  rota("post", "/__trv/segurar", async (b) => {
    const tabela = TABELAS[b.tabela];
    if (!tabela) throw new Error("tabela não permitida");
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "${tabela}" WHERE id = ANY($1::text[]) FOR UPDATE`, b.ids);
        segurando += 1;
        await esperar(b.ms);
        segurando -= 1;
      },
      { timeout: b.ms + 10_000 },
    );
    return { ok: true };
  });
  rota("get", "/__trv/segurando", async () => ({ segurando }));
  // As duas datas de uma reserva: a da reserva (agenda, acervo) e a do evento
  // (tela Eventos, app da cliente), mais o histórico de remarcação.
  rota("get", "/__trv/datas", async (q) => {
    const r = await prisma.reservation.findUnique({
      where: { id: q.reservaId },
      select: { status: true, eventDate: true, rescheduledFrom: true, order: { select: { eventId: true, event: { select: { date: true } } } } },
    });
    return {
      status: r.status,
      reserva: r.eventDate.toISOString().slice(0, 10),
      evento: r.order.event.date.toISOString().slice(0, 10),
      remarcadaDe: r.rescheduledFrom ? r.rescheduledFrom.toISOString().slice(0, 10) : null,
      eventId: r.order.eventId,
    };
  });
  // Simula um registro antigo que ficou divergente (a data do evento mudada
  // sozinha antes da correção). Só o cenário usa; a API não faz mais isso.
  rota("post", "/__trv/divergir", async (b) => {
    const r = await prisma.reservation.findUnique({ where: { id: b.reservaId }, select: { order: { select: { eventId: true } } } });
    await prisma.event.update({ where: { id: r.order.eventId }, data: { date: meioDia(b.data) } });
    return { ok: true };
  });
  // A dona do evento, para tentar mudar a data pelo login da cliente.
  rota("get", "/__trv/token-da-dona", async (q) => {
    const e = await prisma.event.findUnique({ where: { id: q.eventId }, select: { user: true } });
    const email = e.user.email ?? `dona-${e.user.id}@homologacao.invalid`;
    if (!e.user.email) await prisma.user.update({ where: { id: e.user.id }, data: { email } });
    return { token: await app.get(JwtService).signAsync({ sub: e.user.id, email, role: e.user.role }) };
  });
  rota("get", "/__trv/orcamento", async (q) =>
    prisma.orcamento.findUnique({ where: { id: q.id }, select: { status: true, token: true, numero: true, reservationId: true } }),
  );
  rota("get", "/__trv/reserva", async (q) =>
    prisma.reservation.findUnique({ where: { id: q.id }, select: { id: true, status: true, eventDate: true, orderId: true } }),
  );
  // Quanto de uma peça está comprometido num dia: reservas ativas e o que
  // propostas aprovadas ainda sem reserva seguram (pela conta da própria API).
  const orcamentos = app.get(OrcamentosService);
  rota("get", "/__trv/acervo", async (q) => {
    const inicio = new Date(`${q.dia}T00:00:00.000Z`);
    const fim = new Date(inicio.getTime() + 86_400_000);
    const produto = await prisma.product.findUnique({ where: { id: q.produtoId }, select: { stockQuantity: true } });
    const reservas = await prisma.reservation.findMany({
      where: { eventDate: { gte: inicio, lt: fim }, status: { in: [...STATUS_QUE_COMPROMETEM] } },
      select: {
        id: true,
        order: {
          select: {
            kitCongeladoEm: true,
            kitItems: { select: { productId: true, quantity: true } },
            kit: { select: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });
    let emReservas = 0;
    let comEstaPeca = 0;
    for (const r of reservas) {
      const q2 = [...itensDoKitDoPedido(r.order), ...r.order.items]
        .filter((i) => i.productId === q.produtoId)
        .reduce((s, i) => s + i.quantity, 0);
      emReservas += q2;
      if (q2 > 0) comEstaPeca += 1;
    }
    const segurado = await orcamentos.seguradoPorAprovadas(meioDia(q.dia));
    const emPropostas = segurado.total.get(q.produtoId) ?? 0;
    return { estoque: produto.stockQuantity, emReservas, emPropostas, reservas: comEstaPeca };
  });

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3350);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação da trava do acervo em http://localhost:${porta}`);
}
main();
