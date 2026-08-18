import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import type { CreateThemeInput, EventType, UpdateThemeInput } from "@festae/shared";
import { slugUnico } from "../../common/slug";

@Injectable()
export class ThemesService {
  /**
   * Temas da vitrine, opcionalmente só os de uma ocasião.
   *
   * Tema sem ocasião marcada entra em todas: é o estado de um tema recém
   * cadastrado, e sumir da vitrine por falta de uma caixinha marcada seria
   * uma falha invisível para quem cadastrou.
   */
  findAll(eventType?: EventType) {
    return prisma.theme.findMany({
      where: {
        active: true,
        ...(eventType
          ? {
              OR: [
                { suggestedEventTypes: { has: eventType } },
                { suggestedEventTypes: { isEmpty: true } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: string) {
    const theme = await prisma.theme.findUnique({ where: { id } });
    if (!theme) throw new NotFoundException("Tema não encontrado.");
    return theme;
  }

  /** Confere se um slug já está em uso, inclusive por registro desativado. */
  private slugEmUso(slug: string) {
    return prisma.theme.findUnique({ where: { slug }, select: { id: true } });
  }

  async create(input: CreateThemeInput) {
    const slug = await slugUnico(this.slugEmUso, input.slug ?? input.name);
    return prisma.theme.create({ data: { ...input, slug } });
  }

  async update(id: string, input: UpdateThemeInput) {
    await this.findById(id);
    // Renomear não mexe no slug: ele é o endereço do registro. Só recalcula
    // quando alguém manda um slug novo de propósito.
    const slug = input.slug ? await slugUnico(this.slugEmUso, input.slug, id) : undefined;
    return prisma.theme.update({
      where: { id },
      data: { ...input, ...(slug ? { slug } : {}) },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await prisma.theme.update({ where: { id }, data: { active: false } });
    return { success: true };
  }
}
