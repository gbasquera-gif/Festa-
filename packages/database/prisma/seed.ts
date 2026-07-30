import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/client/index.js";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("festae-admin-123", 10);
  const clientPasswordHash = await bcrypt.hash("festae-demo-123", 10);

  await prisma.user.upsert({
    where: { email: "guilherme@festae.com.br" },
    update: {},
    create: {
      email: "guilherme@festae.com.br",
      name: "Guilherme",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "mariluiza@festae.com.br" },
    update: {},
    create: {
      email: "mariluiza@festae.com.br",
      name: "Maria Luiza",
      passwordHash: adminPasswordHash,
      role: "OPS",
    },
  });

  const demoClient = await prisma.user.upsert({
    where: { email: "cliente@exemplo.com" },
    update: {},
    create: {
      email: "cliente@exemplo.com",
      name: "Cliente Demo",
      passwordHash: clientPasswordHash,
      role: "CLIENT",
    },
  });

  const temaEncantado = await prisma.theme.upsert({
    where: { slug: "reino-encantado" },
    update: {},
    create: {
      name: "Reino Encantado",
      slug: "reino-encantado",
      description: "Castelos, coroas e muito brilho para uma festa de princesa ou príncipe.",
      colorPalette: ["#F06853", "#C7A360", "#FDF9F4"],
      suggestedEventTypes: ["FESTA_INFANTIL"],
    },
  });

  const temaSafari = await prisma.theme.upsert({
    where: { slug: "safari-aventura" },
    update: {},
    create: {
      name: "Safari Aventura",
      slug: "safari-aventura",
      description: "Bichinhos da selva e tons terrosos para os pequenos exploradores.",
      colorPalette: ["#0F2A4F", "#C7A360", "#FDF9F4"],
      suggestedEventTypes: ["FESTA_INFANTIL"],
    },
  });

  const temaNuvem = await prisma.theme.upsert({
    where: { slug: "nuvem-de-amor" },
    update: {},
    create: {
      name: "Nuvem de Amor",
      slug: "nuvem-de-amor",
      description: "Nuvens fofas e tons pastel, perfeito para chá de bebê.",
      colorPalette: ["#FDF9F4", "#C7A360", "#0F2A4F"],
      suggestedEventTypes: ["CHA_DE_BEBE"],
    },
  });

  const temaSera = await prisma.theme.upsert({
    where: { slug: "menino-ou-menina" },
    update: {},
    create: {
      name: "Será Ele ou Ela?",
      slug: "menino-ou-menina",
      description: "Confete duplo azul e rosa para revelar o mistério com estilo.",
      colorPalette: ["#F06853", "#0F2A4F", "#FDF9F4"],
      suggestedEventTypes: ["CHA_REVELACAO"],
    },
  });

  const productsData = [
    { name: "Mesa Provençal Branca", slug: "mesa-provencal-branca", category: "MOBILIARIO", unitPrice: 180, stockQuantity: 12 },
    { name: "Painel de Festa Redondo", slug: "painel-festa-redondo", category: "DECORACAO", unitPrice: 220, stockQuantity: 8 },
    { name: "Arco de Balões Temático", slug: "arco-baloes-tematico", category: "DECORACAO", unitPrice: 150, stockQuantity: 15 },
    { name: "Conjunto de Louça Infantil", slug: "conjunto-louca-infantil", category: "LOUCA", unitPrice: 90, stockQuantity: 20 },
    { name: "Cadeira Infantil Decorada (unid.)", slug: "cadeira-infantil-decorada", category: "MOBILIARIO", unitPrice: 25, stockQuantity: 40 },
    { name: "Kit Iluminação Ambiente", slug: "kit-iluminacao-ambiente", category: "ILUMINACAO", unitPrice: 110, stockQuantity: 10 },
    { name: "Caixa de Brinquedos Temática", slug: "caixa-brinquedos-tematica", category: "BRINQUEDO", unitPrice: 70, stockQuantity: 14 },
    { name: "Toalha de Mesa Personalizada", slug: "toalha-mesa-personalizada", category: "DECORACAO", unitPrice: 60, stockQuantity: 18 },
  ] as const;

  const products = [];
  for (const data of productsData) {
    products.push(
      await prisma.product.upsert({
        where: { slug: data.slug },
        update: {},
        create: data,
      }),
    );
  }

  const kitEssencial = await prisma.kit.upsert({
    where: { slug: "kit-essencial" },
    update: {},
    create: {
      name: "Kit Essencial",
      slug: "kit-essencial",
      description: "O básico bem feito: mesa, painel e arco de balões para uma festa linda sem complicação.",
      themeId: temaEncantado.id,
      basePrice: 450,
      minGuests: 10,
      maxGuests: 30,
    },
  });

  const kitCompleto = await prisma.kit.upsert({
    where: { slug: "kit-completo" },
    update: {},
    create: {
      name: "Kit Completo",
      slug: "kit-completo",
      description: "Tudo incluso: mobiliário, decoração, louças e iluminação para uma experiência completa.",
      themeId: temaSafari.id,
      basePrice: 890,
      minGuests: 20,
      maxGuests: 60,
    },
  });

  const kitChaDeBebe = await prisma.kit.upsert({
    where: { slug: "kit-cha-de-bebe" },
    update: {},
    create: {
      name: "Kit Chá de Bebê",
      slug: "kit-cha-de-bebe",
      description: "Delicadeza em cada detalhe para celebrar a chegada do bebê.",
      themeId: temaNuvem.id,
      basePrice: 520,
      minGuests: 10,
      maxGuests: 40,
    },
  });

  const kitRevelacao = await prisma.kit.upsert({
    where: { slug: "kit-cha-revelacao" },
    update: {},
    create: {
      name: "Kit Chá de Revelação",
      slug: "kit-cha-revelacao",
      description: "O suspense da revelação com decoração impecável.",
      themeId: temaSera.id,
      basePrice: 560,
      minGuests: 10,
      maxGuests: 40,
    },
  });

  const linkKitProduct = async (kitId: string, productSlug: string, quantity: number) => {
    const product = products.find((p) => p.slug === productSlug)!;
    await prisma.kitProduct.upsert({
      where: { kitId_productId: { kitId, productId: product.id } },
      update: { quantity },
      create: { kitId, productId: product.id, quantity },
    });
  };

  await linkKitProduct(kitEssencial.id, "mesa-provencal-branca", 1);
  await linkKitProduct(kitEssencial.id, "painel-festa-redondo", 1);
  await linkKitProduct(kitEssencial.id, "arco-baloes-tematico", 1);

  await linkKitProduct(kitCompleto.id, "mesa-provencal-branca", 2);
  await linkKitProduct(kitCompleto.id, "painel-festa-redondo", 1);
  await linkKitProduct(kitCompleto.id, "arco-baloes-tematico", 2);
  await linkKitProduct(kitCompleto.id, "conjunto-louca-infantil", 1);
  await linkKitProduct(kitCompleto.id, "cadeira-infantil-decorada", 20);
  await linkKitProduct(kitCompleto.id, "kit-iluminacao-ambiente", 1);

  await linkKitProduct(kitChaDeBebe.id, "mesa-provencal-branca", 1);
  await linkKitProduct(kitChaDeBebe.id, "toalha-mesa-personalizada", 1);
  await linkKitProduct(kitChaDeBebe.id, "painel-festa-redondo", 1);

  await linkKitProduct(kitRevelacao.id, "arco-baloes-tematico", 1);
  await linkKitProduct(kitRevelacao.id, "painel-festa-redondo", 1);
  await linkKitProduct(kitRevelacao.id, "kit-iluminacao-ambiente", 1);

  // Demo event + order + reservation to validate the full flow after seeding
  const demoEvent = await prisma.event.create({
    data: {
      userId: demoClient.id,
      type: "FESTA_INFANTIL",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      guestCount: 25,
      budgetGoal: 700,
      themeId: temaSafari.id,
    },
  });

  await prisma.order.create({
    data: {
      eventId: demoEvent.id,
      kitId: kitCompleto.id,
      status: "CART",
      subtotalKit: kitCompleto.basePrice,
      subtotalExtras: 0,
      total: kitCompleto.basePrice,
    },
  });

  console.log("Seed concluído com sucesso.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
