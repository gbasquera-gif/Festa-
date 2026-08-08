import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateKitInput, UpdateKitInput } from "@festae/shared";

const kitInclude = {
  theme: true,
  products: { include: { product: true } },
} as const;

@Injectable()
export class KitsService {
  findAll() {
    return prisma.kit.findMany({
      where: { active: true },
      include: kitInclude,
      orderBy: { basePrice: "asc" },
    });
  }

  async recommend(params: { guestCount?: number; themeId?: string }) {
    return prisma.kit.findMany({
      where: {
        active: true,
        ...(params.guestCount
          ? { minGuests: { lte: params.guestCount }, maxGuests: { gte: params.guestCount } }
          : {}),
        ...(params.themeId ? { themeId: params.themeId } : {}),
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

  create(input: CreateKitInput) {
    const { products, ...data } = input;
    return prisma.kit.create({
      data: {
        ...data,
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

    if (products) {
      await prisma.kitProduct.deleteMany({ where: { kitId: id } });
    }

    return prisma.kit.update({
      where: { id },
      data: {
        ...data,
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
