import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateThemeInput, UpdateThemeInput } from "@festae/shared";

@Injectable()
export class ThemesService {
  findAll() {
    return prisma.theme.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }

  async findById(id: string) {
    const theme = await prisma.theme.findUnique({ where: { id } });
    if (!theme) throw new NotFoundException("Tema não encontrado.");
    return theme;
  }

  create(input: CreateThemeInput) {
    return prisma.theme.create({ data: input });
  }

  async update(id: string, input: UpdateThemeInput) {
    await this.findById(id);
    return prisma.theme.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.theme.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
