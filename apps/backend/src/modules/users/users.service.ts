import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { prisma } from "@festae/database";

@Injectable()
export class UsersService {
  async findById(id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async findAll() {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return users.map(({ passwordHash: _passwordHash, ...safe }) => safe);
  }

  /**
   * Define uma senha nova para um cliente que perdeu a dele e pediu ajuda.
   * Enquanto não existe recuperação por e-mail, este é o único caminho —
   * a alternativa seria mexer no banco na mão.
   */
  async resetPassword(id: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    if (user.deletedAt) {
      throw new BadRequestException("Esta conta foi excluída e não pode ser reativada.");
    }

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return { success: true };
  }
}
