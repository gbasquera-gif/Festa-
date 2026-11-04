// Servidor da homologação de pagamentos e da liberação de reservas sem sinal:
// a API compilada de verdade, com o Mercado Pago SIMULADO (nenhuma chamada ao
// provedor real) e rotas /__pag/* que só montam o cenário. Só roda contra
// banco LOCAL e fora de produção. Ver README.md.
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
  console.error("Recusado: a homologação usa o Mercado Pago simulado. Tire MP_ACCESS_TOKEN do ambiente.");
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
const { PaymentsService } = dist("modules/payments/payments.service.js");
const { PAYMENT_GATEWAY } = dist("modules/payments/gateway/payment-gateway.interface.js");

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const slug = (nome) =>
  `${nome}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

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
        const corpo = typeof e?.getResponse === "function" && typeof e.getResponse() === "object" ? e.getResponse() : {};
        r.status(e && e.status ? e.status : 500).json({ erro: String(e && e.message ? e.message : e), status: e?.status, ...corpo });
      }
    });

  // ------------------------------------------------------------ provedor simulado
  const provedor = { modo: "nao-pago", porReferencia: {}, cancelar: "ENCERRADA", consultas: 0, cancelamentos: 0 };
  const gw = app.get(PAYMENT_GATEWAY, { strict: false });
  const situacaoSimulada = { pago: "approved", "nao-pago": "cancelled", "em-analise": "in_process", "valor-divergente": "approved" };
  gw.createCheckout = async (input) => ({ externalReference: `mp-${input.paymentId}`, pixQrCode: "qr-de-teste", pixQrCodeBase64: "" });
  gw.consultarPagamento = async (id) => {
    provedor.consultas += 1;
    const modo = provedor.porReferencia[id] ?? provedor.modo;
    if (modo === "fora-do-ar") throw new Error("Mercado Pago indisponível (simulado)");
    if (modo === "sem-resposta") return null;
    const cobranca = await prisma.payment.findFirst({ where: { externalReference: id } });
    if (!cobranca) return null;
    return {
      id,
      referencia: cobranca.id,
      status: situacaoSimulada[modo],
      valor: Number(cobranca.amount) + (modo === "valor-divergente" ? 1 : 0),
      valorEstornado: 0,
      moeda: "BRL",
      producao: false,
    };
  };
  gw.buscarPorReferencia = async () => [];
  gw.cancelar = async () => {
    provedor.cancelamentos += 1;
    return provedor.cancelar;
  };
  rota("post", "/__pag/provedor", async (b) => {
    if (b.modo) provedor.modo = b.modo;
    if (b.cancelar) provedor.cancelar = b.cancelar;
    if (b.referencia) provedor.porReferencia[b.referencia] = b.modoDaReferencia;
    if (b.zerar) Object.assign(provedor, { consultas: 0, cancelamentos: 0, porReferencia: {} });
    return { ...provedor };
  });

  // ------------------------------------------------------------ histórico de etapas
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "__historico_de_reserva" (
    id serial PRIMARY KEY, reserva text, de text, para text, em timestamptz DEFAULT clock_timestamp())`);
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "__registrar_etapa"() RETURNS trigger AS $$
    BEGIN IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO "__historico_de_reserva"(reserva, de, para) VALUES (NEW.id, OLD.status, NEW.status);
    END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "__etapa_da_reserva" ON "reservations"`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER "__etapa_da_reserva" AFTER UPDATE ON "reservations"
    FOR EACH ROW EXECUTE FUNCTION "__registrar_etapa"()`);

  // ------------------------------------------------------------ cenário
  rota("get", "/__pag/token", async (q) => {
    const email = `${q.papel.toLowerCase()}-pagamentos@homologacao.invalid`;
    const u =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { name: `Equipe ${q.papel}`, email, role: q.papel } }));
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email: u.email, role: u.role }), id: u.id };
  });
  // A cliente dona da festa, para chamar a rota de verdade que o app usa.
  rota("get", "/__pag/token-da-cliente", async (q) => {
    const evento = await prisma.event.findUnique({ where: { id: q.eventId }, select: { user: true } });
    const u = evento.user;
    const email = u.email ?? `cliente-${u.id}@homologacao.invalid`;
    if (!u.email) await prisma.user.update({ where: { id: u.id }, data: { email } });
    return { token: await app.get(JwtService).signAsync({ sub: u.id, email, role: u.role }) };
  });
  rota("get", "/__pag/evento-da-reserva", async (q) =>
    prisma.reservation.findUnique({
      where: { id: q.reservaId },
      select: { requestedAt: true, order: { select: { eventId: true } } },
    }),
  );
  rota("post", "/__pag/produto", async (b) => {
    const p = await prisma.product.create({ data: { name: b.nome, slug: slug(b.nome), unitPrice: 50, stockQuantity: b.estoque ?? 3 } });
    return { id: p.id };
  });
  rota("post", "/__pag/kit", async (b) => {
    const k = await prisma.kit.create({
      data: { name: b.nome, slug: slug(b.nome), basePrice: 100, products: { create: [{ productId: b.produtoId, quantity: 1 }] } },
    });
    return { id: k.id };
  });
  // A reserva da loja: nasce pela venda manual e vira PENDING, pedido como o da loja.
  rota("post", "/__pag/como-reserva-da-loja", async (b) => {
    const r = await prisma.reservation.update({
      where: { id: b.reservaId },
      data: { status: "PENDING", requestedAt: new Date(Date.now() - b.minutosAtras * 60_000) },
      select: { id: true, orderId: true, order: { select: { eventId: true } } },
    });
    await prisma.order.update({ where: { id: r.orderId }, data: { status: "REQUESTED" } });
    return { id: r.id, eventId: r.order.eventId };
  });
  rota("post", "/__pag/envelhecer", async (b) =>
    prisma.reservation.update({
      where: { id: b.reservaId },
      data: { requestedAt: new Date(Date.now() - b.minutosAtras * 60_000) },
      select: { id: true },
    }),
  );
  // Cobrança Pix direto no banco, com a validade pedida (relativa a agora).
  rota("post", "/__pag/pix", async (b) => {
    const r = await prisma.reservation.findUnique({ where: { id: b.reservaId }, select: { orderId: true } });
    const p = await prisma.payment.create({
      data: {
        orderId: r.orderId,
        type: "DEPOSIT",
        method: "PIX",
        amount: b.valor ?? 30,
        status: b.status ?? "PENDING",
        externalReference: `mp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        expiresAt: new Date(Date.now() + b.expiraEmMin * 60_000),
        pixQrCode: "qr-de-teste",
      },
    });
    return { id: p.id, externalReference: p.externalReference };
  });
  // A geração do Pix pela loja (createCheckout de verdade, gateway simulado).
  const pagamentos = app.get(PaymentsService);
  rota("post", "/__pag/gerar-pix", async (b) => {
    const p = await pagamentos.createCheckout(b.eventId, { type: b.tipo ?? "DEPOSIT", method: "PIX" }, "cliente@homologacao.invalid");
    return { id: p.id, expiresAt: p.expiresAt };
  });
  rota("post", "/__pag/webhook-pago", async (b) => {
    await pagamentos.settle(b.paymentId, "PAID");
    return { ok: true };
  });
  rota("post", "/__pag/credito", async (b) => {
    const r = await prisma.reservation.findUnique({ where: { id: b.reservaId }, select: { order: { select: { event: { select: { userId: true } } } } } });
    const m = await prisma.creditoClienteMovimento.create({
      data: { userId: r.order.event.userId, tipo: "CREDITO_UTILIZADO", valor: -50, reservationDestinoId: b.reservaId, createdById: b.usuarioId },
    });
    return { id: m.id };
  });
  rota("post", "/__pag/segurar-pedido", async (b) => {
    const r = await prisma.reservation.findUnique({ where: { id: b.reservaId }, select: { orderId: true } });
    await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${r.orderId} FOR UPDATE`;
        await esperar(b.ms);
      },
      { timeout: b.ms + 10_000 },
    );
    return { ok: true };
  });
  // O tempo passa para o Pix: a validade fica no passado.
  rota("post", "/__pag/vencer-pix", async (b) =>
    prisma.payment.update({ where: { id: b.paymentId }, data: { expiresAt: new Date(Date.now() - 60_000) }, select: { id: true } }),
  );
  // Reserva já cancelada antes do cenário (sem passar pelo fluxo do painel).
  rota("post", "/__pag/ja-cancelada", async (b) => {
    const r = await prisma.reservation.update({ where: { id: b.reservaId }, data: { status: "CANCELLED" }, select: { orderId: true } });
    await prisma.order.update({ where: { id: r.orderId }, data: { status: "CANCELLED" } });
    return { ok: true };
  });
  // Tira de cena uma reserva que ficou pendente de propósito.
  rota("post", "/__pag/fora-de-cena", async (b) =>
    prisma.reservation.update({ where: { id: b.reservaId }, data: { status: "REJECTED" }, select: { id: true } }),
  );
  // A liberação pelo caminho de produção: abrir o calendário da loja.
  const disponibilidade = app.get(AvailabilityService);
  rota("post", "/__pag/abrir-calendario", async (b) => {
    await disponibilidade.getMonth(b.mes);
    return { consultas: provedor.consultas };
  });
  rota("get", "/__pag/estado", async (q) => {
    const r = await prisma.reservation.findUnique({
      where: { id: q.reservaId },
      select: {
        status: true,
        order: { select: { status: true, payments: { select: { status: true, origem: true, method: true }, orderBy: { createdAt: "asc" } } } },
        pagamentosAposCancelamento: { select: { paymentId: true } },
      },
    });
    const historico = await prisma.$queryRawUnsafe(`SELECT de, para FROM "__historico_de_reserva" WHERE reserva = $1 ORDER BY id`, q.reservaId);
    return {
      reserva: r.status,
      pedido: r.order.status,
      pagamentos: r.order.payments.map((p) => `${p.method}:${p.status}${p.origem ? `:${p.origem}` : ""}`),
      aposCancelamento: r.pagamentosAposCancelamento.length,
      etapas: historico.map((h) => `${h.de}>${h.para}`),
    };
  });

  const porta = Number(process.env.HOMOLOGACAO_PORTA || 3330);
  await app.listen(porta, "127.0.0.1");
  console.log(`Homologação de pagamentos em http://localhost:${porta}`);
}
main();
