import { Injectable, NotFoundException } from "@nestjs/common";
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
}
