import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateProductInput, ProductCategory, UpdateProductInput } from "@festae/shared";

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

  create(input: CreateProductInput) {
    return prisma.product.create({ data: input });
  }

  async update(id: string, input: UpdateProductInput) {
    await this.findById(id);
    return prisma.product.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.product.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
