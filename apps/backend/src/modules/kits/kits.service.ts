import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateKitInput, EventType, UpdateKitInput } from "@festae/shared";
import { slugUnico } from "../../common/slug";

const kitInclude = {
  theme: true,
  products: { include: { product: true } },
} as const;

/**
 * Quais kits servem para uma ocasião.
 *
 * O kit não guarda tipo de festa: quem guarda é o tema. Isso é de propósito —
 * a Maria Luiza cadastra "Safari" uma vez e todos os kits daquele tema herdam
 * a decisão, em vez de ela marcar as ocasiões kit por kit e esquecer um.
 *
 * Duas regras de "aparece sempre": kit sem tema (mesa posta neutra, louças) e
 * tema sem ocasião marcada. Sem elas, um tema recém-cadastrado sumiria da
 * vitrine inteira até alguém lembrar de marcar as caixinhas — o tipo de falha
 * silenciosa que só se descobre quando o cliente reclama que não achou nada.
 */
function eventTypeFilter(eventType?: EventType) {
  if (!eventType) return {};
  return {
    OR: [
      { themeId: null },
      { theme: { suggestedEventTypes: { has: eventType } } },
      { theme: { suggestedEventTypes: { isEmpty: true } } },
    ],
  };
}

function searchFilter(search?: string) {
  const term = search?.trim();
  if (!term || term.length < 2) return {};
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { description: { contains: term, mode: "insensitive" as const } },
      { theme: { name: { contains: term, mode: "insensitive" as const } } },
    ],
  };
}

export interface KitQuery {
  eventType?: EventType;
  themeId?: string;
  search?: string;
}

@Injectable()
export class KitsService {
  findAll(query: KitQuery = {}) {
    // Os filtros entram como AND de blocos OR: misturar os dois OR num nível
    // só faria "Safari" casar com qualquer kit de qualquer ocasião.
    const conditions = [eventTypeFilter(query.eventType), searchFilter(query.search)].filter(
      (condition) => Object.keys(condition).length > 0,
    );

    return prisma.kit.findMany({
      where: {
        active: true,
        ...(query.themeId ? { themeId: query.themeId } : {}),
        ...(conditions.length > 0 ? { AND: conditions } : {}),
      },
      include: kitInclude,
      orderBy: { basePrice: "asc" },
    });
  }

  async findById(id: string) {
    const kit = await prisma.kit.findUnique({ where: { id }, include: kitInclude });
    if (!kit) throw new NotFoundException("Kit não encontrado.");
    return kit;
  }

  /** Confere se um slug já está em uso, inclusive por kit desativado. */
  private slugEmUso(slug: string) {
    return prisma.kit.findUnique({ where: { slug }, select: { id: true } });
  }

  async create(input: CreateKitInput) {
    const { products, ...data } = input;
    const slug = await slugUnico(this.slugEmUso, input.slug ?? input.name);

    return prisma.kit.create({
      data: {
        ...data,
        slug,
        products: {
          create: products.map((p) => ({ productId: p.productId, quantity: p.quantity })),
        },
      },
      include: kitInclude,
    });
  }

  async update(id: string, input: UpdateKitInput) {
    await this.findById(id);
    const { products, ...data } = input;

    // Renomear o kit não mexe no slug: ele é o endereço do registro, e mudar
    // endereço de coisa publicada quebra link já compartilhado. Só recalcula
    // quando alguém manda um slug novo de propósito.
    const slug = input.slug ? await slugUnico(this.slugEmUso, input.slug, id) : undefined;

    if (products) {
      await prisma.kitProduct.deleteMany({ where: { kitId: id } });
    }

    return prisma.kit.update({
      where: { id },
      data: {
        ...data,
        ...(slug ? { slug } : {}),
        ...(products
          ? { products: { create: products.map((p) => ({ productId: p.productId, quantity: p.quantity })) } }
          : {}),
      },
      include: kitInclude,
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.kit.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
