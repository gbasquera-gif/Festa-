import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { prisma } from "@festae/database";
import { getJwtSecret } from "../../common/jwt-secret";

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  /** Emissão, em segundos. O passport preenche a partir do próprio token. */
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  // Consulta o banco a cada requisição autenticada: o token continua
  // criptograficamente válido até expirar, então é aqui que uma conta
  // excluída (ou removida por um admin) para de funcionar de verdade.
  async validate(payload: JwtPayload) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
        passwordChangedAt: true,
      },
    });

    if (!user || user.deletedAt) throw new UnauthorizedException("Sessão inválida.");

    // Trocar a senha derruba as sessões abertas. É o que dá sentido a
    // "redefinir a senha" quando alguém suspeita de invasão: sem isto, o
    // invasor continuaria com o token dele até os 7 dias acabarem.
    //
    // A margem de 1 segundo cobre o arredondamento do `iat`, que vem em
    // segundos: sem ela, o próprio token emitido no instante da troca
    // poderia ser recusado.
    if (user.passwordChangedAt && payload.iat) {
      const issuedAt = payload.iat * 1000 + 1000;
      if (issuedAt < user.passwordChangedAt.getTime()) {
        throw new UnauthorizedException("Sua senha foi alterada. Entre novamente.");
      }
    }

    return { userId: user.id, email: user.email, role: user.role };
  }
}
