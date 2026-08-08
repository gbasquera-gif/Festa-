import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";

/**
 * Marketplace ainda não é público — este módulo só expõe leitura hoje.
 * Products já suportam `partnerId` opcional, então plugar fornecedores
 * externos no catálogo não vai exigir migração de schema.
 */
@Injectable()
export class PartnersService {
  findAll() {
    return prisma.partner.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  }
}
