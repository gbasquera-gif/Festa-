import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateProductInput, ProductCategory, UpdateProductInput } from "@festae/shared";
import { slugUnico } from "../../common/slug";

@Injectable()
export class ProductsService {
  findAll(category?: ProductCategory) {
    return prisma.product.findMany({
      where: { active: true, ...(category ? { category } : {}) },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Produto não encontrado.");
    return product;
  }

  /** Confere se um slug já está em uso, inclusive por registro desativado. */
  private slugEmUso(slug: string) {
    return prisma.product.findUnique({ where: { slug }, select: { id: true } });
  }

  async create(input: CreateProductInput) {
    const slug = await slugUnico(this.slugEmUso, input.slug ?? input.name);
    return prisma.product.create({ data: { ...input, slug } });
  }

  async update(id: string, input: UpdateProductInput) {
    await this.findById(id);
    // Renomear não mexe no slug: ele é o endereço do registro. Só recalcula
    // quando alguém manda um slug novo de propósito.
    const slug = input.slug ? await slugUnico(this.slugEmUso, input.slug, id) : undefined;
    return prisma.product.update({
      where: { id },
      data: { ...input, ...(slug ? { slug } : {}) },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.product.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
