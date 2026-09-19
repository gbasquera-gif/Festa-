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
   * Exclui uma conta pelo painel — quando não há nada preso nela.
   *
   * A trava não é conservadorismo: `Event.user` é `onDelete: Cascade`, e a
   * cascata continua em Order, Reservation, OrderItem e Payment. Apagar um
   * cliente com festa registrada não apagaria um cadastro, apagaria contrato,
   * reserva e recebimento — e o Financeiro passaria a fechar num total
   * diferente do de ontem sem que nada no painel explicasse por quê.
   *
   * Então: com vínculo, recusa e diz qual é o vínculo. Sem vínculo nenhum é
   * cadastro duplicado ou digitado errado, e aí some de verdade.
   *
   * Conta da equipe que já cancelou reserva, concluiu tarefa ou autorizou
   * exceção também não some: essas relações são `SetNull`, então o banco
   * deixaria apagar, e o registro de quem fez o quê viraria um vazio. Trilha
   * de auditoria que se apaga sozinha não é trilha.
   */
  async remove(id: string, actorId: string) {
    const alvo = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            events: true,
            tarefasFeitas: true,
            reservasCanceladas: true,
            excecoesAutorizadas: true,
          },
        },
      },
    });
    if (!alvo) throw new NotFoundException("Usuário não encontrado.");

    if (id === actorId) {
      throw new BadRequestException("Você não pode excluir a própria conta por aqui.");
    }

    if (alvo.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", deletedAt: null } });
      if (admins <= 1) {
        throw new BadRequestException(
          "Esta é a última conta de administrador. Promova outra pessoa antes de excluí-la.",
        );
      }
    }

    const impedimentos: string[] = [];
    const c = alvo._count;
    if (c.events > 0) {
      impedimentos.push(
        `${c.events} festa${c.events === 1 ? "" : "s"} registrada${c.events === 1 ? "" : "s"} (com contrato, reserva e pagamentos)`,
      );
    }
    if (c.tarefasFeitas > 0) impedimentos.push(`${c.tarefasFeitas} tarefa(s) de operação concluída(s)`);
    if (c.reservasCanceladas > 0) impedimentos.push(`${c.reservasCanceladas} cancelamento(s) de reserva`);
    if (c.excecoesAutorizadas > 0) impedimentos.push(`${c.excecoesAutorizadas} exceção(ões) comercial(is) autorizada(s)`);

    if (impedimentos.length > 0) {
      throw new ConflictException(
        `Esta conta não pode ser excluída: ${impedimentos.join(", ")}. ` +
          "Excluir apagaria esse histórico junto. Corrija os dados pela edição, ou cancele a reserva na tela de Reservas.",
      );
    }

    await prisma.user.delete({ where: { id } });
    return { excluido: true };
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
