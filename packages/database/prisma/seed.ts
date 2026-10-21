import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/client/index.js";
import { decidirAdministrador, PEDIDO_DA_INSTALACAO } from "./administrador";

const prisma = new PrismaClient();

// Este seed roda a cada boot do container (ver docker-entrypoint.sh), então
// nada aqui pode conter credencial fixa: o repositório é público, e uma senha
// escrita no código viraria acesso de administrador para qualquer pessoa.
const DEMO_DATA_ENABLED = process.env.SEED_DEMO_DATA === "true";

/**
 * A demonstração é proibida em produção, mesmo com a variável ligada.
 *
 * Não é zelo teórico: o catálogo de exemplo daqui já foi parar na loja de
 * verdade. Um produto inventado ("Kit Iluminação Ambiente", R$ 110) apareceu
 * dentro de um kit real, com preço que ninguém definiu e sem foto — e a
 * operação não tinha como saber de onde ele vinha. Pior: o `upsert` abaixo
 * roda a cada boot, então apagar pelo painel não resolvia, o próximo deploy
 * recriava.
 *
 * Junto vinham contas de exemplo com senha escrita neste arquivo, num
 * repositório público. Uma variável de ambiente ligada por engano não pode
 * ser a única coisa entre isso e o banco de produção.
 */
const EM_PRODUCAO = process.env.NODE_ENV === "production";

/**
 * O administrador de SEED_ADMIN_EMAIL: criado na instalação, preservado
 * depois, recuperado só a pedido explícito. A regra está em `administrador.ts`.
 *
 * Trocar o acesso de quem vazou a senha é pelo painel (que derruba as
 * sessões) ou por um pedido de recuperação — não mais reimplantando com
 * outra SEED_ADMIN_PASSWORD, que agora não muda uma conta existente.
 */
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim() || undefined;
  const senha = process.env.SEED_ADMIN_PASSWORD || undefined;
  const pedido = process.env.SEED_ADMIN_RECUPERACAO?.trim() || undefined;

  const conta = email
    ? await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, deletedAt: true } })
    : null;
  // Conta ADMIN desativada também conta: o seed não "reinstala" por cima dela.
  const instalacaoJaFeita =
    (await prisma.user.count({ where: { role: "ADMIN", ...(conta ? { id: { not: conta.id } } : {}) } })) > 0 ||
    (await prisma.recuperacaoDeAcesso.count({ where: { pedido: PEDIDO_DA_INSTALACAO } })) > 0;
  const pedidoJaAplicado =
    conta && pedido
      ? (await prisma.recuperacaoDeAcesso.count({ where: { usuarioId: conta.id, pedido } })) > 0
      : false;

  const decisao = decidirAdministrador({ email, senha, pedido, conta, instalacaoJaFeita, pedidoJaAplicado });

  switch (decisao.acao) {
    case "NADA":
      console.warn(`Administrador: ${decisao.motivo}`);
      return;
    case "PRESERVAR":
      console.log(`Administrador ${email}: ${decisao.motivo}`);
      return;
    case "RECUSAR":
      console.warn(`Administrador ${email ?? ""}: pedido recusado — ${decisao.motivo} Nada foi alterado.`);
      return;
    case "CRIAR": {
      const passwordHash = await bcrypt.hash(senha!, 10);
      await prisma.$transaction(async (tx) => {
        const criada = await tx.user.create({
          data: { email: email!, name: process.env.SEED_ADMIN_NAME ?? "Administrador", passwordHash, role: "ADMIN" },
        });
        await tx.recuperacaoDeAcesso.create({
          data: { usuarioId: criada.id, email: email!, pedido: decisao.pedido, alteracoes: { criada: true } },
        });
      });
      console.log(`Administrador criado para ${email} (pedido "${decisao.pedido}").`);
      return;
    }
    case "RECUPERAR": {
      const passwordHash = await bcrypt.hash(senha!, 10);
      await prisma.$transaction(async (tx) => {
        // A linha de auditoria entra junto: se dois boots correrem ao mesmo
        // tempo, a chave única (conta, pedido) derruba o segundo inteiro.
        await tx.recuperacaoDeAcesso.create({
          data: {
            usuarioId: conta!.id,
            email: email!,
            pedido: decisao.pedido,
            alteracoes: { senha: true, papel: decisao.promover ? { de: conta!.role, para: "ADMIN" } : null },
          },
        });
        // `passwordChangedAt` é o que derruba as sessões abertas: a validação
        // do token recusa o que foi emitido antes dele.
        await tx.user.update({
          where: { id: conta!.id },
          data: { passwordHash, passwordChangedAt: new Date(), ...(decisao.promover ? { role: "ADMIN" } : {}) },
        });
      });
      console.warn(
        `Administrador ${email}: acesso RECUPERADO pelo pedido "${decisao.pedido}" — senha redefinida, ` +
          `sessões abertas encerradas${decisao.promover ? `, papel ${conta!.role} → ADMIN` : ""}. ` +
          "Remova SEED_ADMIN_RECUPERACAO das variáveis.",
      );
      return;
    }
  }
}

/** Catálogo e contas de exemplo — só para desenvolvimento e demonstração. */
async function seedDemoData() {
  const demoPasswordHash = await bcrypt.hash("festae-demo-123", 10);

  await prisma.user.upsert({
    where: { email: "operacao@exemplo.com" },
    update: {},
    create: {
      email: "operacao@exemplo.com",
      name: "Operação Demo",
      passwordHash: demoPasswordHash,
      role: "OPS",
    },
  });

  const demoClient = await prisma.user.upsert({
    where: { email: "cliente@exemplo.com" },
    update: {},
    create: {
      email: "cliente@exemplo.com",
      name: "Cliente Demo",
      passwordHash: demoPasswordHash,
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
      suggestedEventTypes: ["ANIVERSARIO"],
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
      suggestedEventTypes: ["ANIVERSARIO"],
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

  const temaCeuDeAnjos = await prisma.theme.upsert({
    where: { slug: "ceu-de-anjos" },
    update: {},
    create: {
      name: "Céu de Anjos",
      slug: "ceu-de-anjos",
      description: "Branco, dourado e flores para uma celebração serena em família.",
      colorPalette: ["#FDF9F4", "#C7A360", "#0F2A4F"],
      suggestedEventTypes: ["BATIZADO"],
    },
  });

  // Catálogo de exemplo, só decoração — o mesmo recorte do acervo real.
  // Antes tinha louça, cadeira de convidado e caixa de brinquedos, itens que
  // a Festaê não aluga: um catálogo de demonstração que descreve outro
  // negócio ensina errado quem abre o projeto pela primeira vez.
  const productsData = [
    { name: "Mesa Provençal Branca", slug: "mesa-provencal-branca", category: "MOBILIARIO", unitPrice: 180, stockQuantity: 12 },
    { name: "Painel de Festa Redondo", slug: "painel-festa-redondo", category: "DECORACAO", unitPrice: 220, stockQuantity: 8 },
    { name: "Arco de Balões Temático", slug: "arco-baloes-tematico", category: "DECORACAO", unitPrice: 150, stockQuantity: 15 },
    { name: "Trio de Cilindros Decorativos", slug: "trio-cilindros-decorativos", category: "DECORACAO", unitPrice: 90, stockQuantity: 20 },
    { name: "Vaso com Arranjo (unid.)", slug: "vaso-com-arranjo", category: "DECORACAO", unitPrice: 25, stockQuantity: 40 },
    { name: "Kit Iluminação Ambiente", slug: "kit-iluminacao-ambiente", category: "ILUMINACAO", unitPrice: 110, stockQuantity: 10 },
    { name: "Placa de Nome Personalizada", slug: "placa-nome-personalizada", category: "DECORACAO", unitPrice: 70, stockQuantity: 14 },
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
    },
  });

  const kitCompleto = await prisma.kit.upsert({
    where: { slug: "kit-completo" },
    update: {},
    create: {
      name: "Kit Completo",
      slug: "kit-completo",
      description: "Tudo incluso: painel, arco, mesa posta e iluminação para uma decoração completa.",
      themeId: temaSafari.id,
      basePrice: 890,
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
    },
  });

  const kitBatizado = await prisma.kit.upsert({
    where: { slug: "kit-batizado" },
    update: {},
    create: {
      name: "Kit Batizado",
      slug: "kit-batizado",
      description: "Mesa posta com toalha, painel e iluminação suave para a celebração.",
      themeId: temaCeuDeAnjos.id,
      basePrice: 480,
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
  await linkKitProduct(kitCompleto.id, "trio-cilindros-decorativos", 1);
  await linkKitProduct(kitCompleto.id, "vaso-com-arranjo", 20);
  await linkKitProduct(kitCompleto.id, "kit-iluminacao-ambiente", 1);

  await linkKitProduct(kitChaDeBebe.id, "mesa-provencal-branca", 1);
  await linkKitProduct(kitChaDeBebe.id, "toalha-mesa-personalizada", 1);
  await linkKitProduct(kitChaDeBebe.id, "painel-festa-redondo", 1);

  await linkKitProduct(kitRevelacao.id, "arco-baloes-tematico", 1);
  await linkKitProduct(kitRevelacao.id, "painel-festa-redondo", 1);
  await linkKitProduct(kitRevelacao.id, "kit-iluminacao-ambiente", 1);

  await linkKitProduct(kitBatizado.id, "mesa-provencal-branca", 1);
  await linkKitProduct(kitBatizado.id, "toalha-mesa-personalizada", 1);
  await linkKitProduct(kitBatizado.id, "kit-iluminacao-ambiente", 1);

  // Evento de exemplo para validar o fluxo inteiro depois do seed. Diferente
  // do resto, `create` não é idempotente — sem esta guarda, cada boot do
  // container criava mais uma festa fantasma na lista do cliente.
  const alreadySeeded = await prisma.event.findFirst({ where: { userId: demoClient.id } });
  if (alreadySeeded) {
    console.log("Dados de demonstração garantidos.");
    return;
  }

  const demoEvent = await prisma.event.create({
    data: {
      userId: demoClient.id,
      type: "ANIVERSARIO",
      date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
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

  console.log("Dados de demonstração garantidos.");
}

async function main() {
  await seedAdmin();

  if (DEMO_DATA_ENABLED && EM_PRODUCAO) {
    console.warn(
      "SEED_DEMO_DATA está ligado em produção e foi IGNORADO. Catálogo e contas " +
        "de exemplo nunca são criados aqui. Desligue a variável no painel de " +
        "implantação para não ver este aviso de novo.",
    );
  } else if (DEMO_DATA_ENABLED) {
    await seedDemoData();
  } else {
    console.log("SEED_DEMO_DATA desligado — catálogo e contas de exemplo não foram criados.");
  }

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
