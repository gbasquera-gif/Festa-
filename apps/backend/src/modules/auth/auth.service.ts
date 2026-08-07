import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { prisma } from "@festae/database";
import { TERMS_VERSION } from "@festae/shared";
import type { LoginInput, SignupInput } from "@festae/shared";

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async signup(input: SignupInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("E-mail já cadastrado.");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        // Prova de consentimento: quando aceitou e qual versão do texto
        // estava valendo. Publicar termos novos não apaga esse histórico.
        termsAcceptedAt: new Date(),
        termsAcceptedVersion: TERMS_VERSION,
      },
    });

    return this.buildAuthResponse(user);
  }

  /**
   * Cópia de tudo que a Festaê guarda sobre a pessoa (LGPD, art. 18, II).
   *
   * Devolve o dado bruto de propósito, sem resumir: o direito é de acesso ao
   * que existe, e um resumo esconderia campos.
   */
  async exportData(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        events: {
          include: {
            theme: true,
            order: { include: { items: { include: { product: true } }, reservation: true, payments: true } },
          },
        },
      },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException("Conta não encontrada.");

    // A senha sai fora (é hash, não tem como devolver em texto) e as festas
    // saem do perfil para não aparecerem duas vezes no arquivo exportado.
    const { passwordHash: _passwordHash, events, ...perfil } = user;
    const usoDoApp = await prisma.analyticsEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    return {
      geradoEm: new Date().toISOString(),
      explicacao:
        "Cópia completa dos dados que a Festaê guarda sobre você. A senha não aparece porque é armazenada como código embaralhado e não pode ser revertida.",
      perfil,
      festas: events,
      usoDoApp,
    };
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.deletedAt) throw new UnauthorizedException("Credenciais inválidas.");

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException("Credenciais inválidas.");

    return this.buildAuthResponse(user);
  }

  /**
   * Exclusão de conta pedida pelo próprio usuário.
   *
   * Os dados pessoais são apagados na hora — nome, e-mail, telefone e os
   * endereços de entrega dos eventos. O que fica são os pedidos e reservas
   * já feitos, sem ligação com uma pessoa identificável: a empresa ainda
   * precisa cumprir a entrega de uma festa contratada e guardar o registro
   * por obrigação fiscal. Apagar a linha do usuário derrubaria tudo isso em
   * cascata.
   */
  async deleteAccount(userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new UnauthorizedException("Conta não encontrada.");

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException("Senha incorreta.");

    // Hash de uma senha aleatória que ninguém conhece: nem o dono da conta
    // nem um vazamento do banco conseguem reativar o acesso.
    const unusableHash = await bcrypt.hash(randomUUID() + randomUUID(), 10);

    await prisma.$transaction([
      prisma.event.updateMany({
        where: { userId },
        data: { address: null, neighborhood: null },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          name: "Cliente removido",
          // O e-mail é único no banco, então precisa continuar único mesmo
          // depois de anonimizado — e o domínio .invalid nunca é entregável.
          email: `removido-${userId}@festae.invalid`,
          phone: null,
          passwordHash: unusableHash,
          deletedAt: new Date(),
        },
      }),
    ]);

    return { success: true };
  }

  private buildAuthResponse(user: { id: string; email: string; name: string; role: string }) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
