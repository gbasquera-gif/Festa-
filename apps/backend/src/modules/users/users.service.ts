import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { prisma } from "@festae/database";
import type { UpdateUserInput } from "@festae/shared";

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
   * Atualiza nome, e-mail e perfil de uma conta.
   *
   * `actorId` é quem está fazendo a edição: um admin não pode rebaixar a si
   * mesmo, senão bastaria um clique distraído para o painel ficar sem
   * ninguém capaz de administrar.
   */
  async update(id: string, input: UpdateUserInput, actorId: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuário não encontrado.");
    if (user.deletedAt) {
      throw new BadRequestException("Esta conta foi excluída e não pode ser editada.");
    }

    if (input.role && input.role !== "ADMIN" && id === actorId) {
      throw new BadRequestException("Você não pode remover o próprio acesso de administrador.");
    }

    if (input.email && input.email !== user.email) {
      const taken = await prisma.user.findUnique({ where: { email: input.email } });
      if (taken) throw new ConflictException("Já existe uma conta com este e-mail.");
    }

    const updated = await prisma.user.update({ where: { id }, data: input });
    const { passwordHash: _passwordHash, ...safe } = updated;
    return safe;
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

    // `passwordChangedAt` invalida os tokens já emitidos: quem estava
    // logado com a senha antiga cai fora na requisição seguinte.
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
      },
    });

    return { success: true };
  }
}
