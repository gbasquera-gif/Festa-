import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { prisma } from "@festae/database";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
    });
  }

  // Consulta o banco a cada requisição autenticada: o token continua
  // criptograficamente válido até expirar, então é aqui que uma conta
  // excluída (ou removida por um admin) para de funcionar de verdade.
  async validate(payload: JwtPayload) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, deletedAt: true },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException("Sessão inválida.");

    return { userId: user.id, email: user.email, role: user.role };
  }
}
