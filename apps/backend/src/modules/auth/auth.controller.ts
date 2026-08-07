import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { deleteAccountSchema, loginSchema, signupSchema } from "@festae/shared";
import type { DeleteAccountInput, LoginInput, SignupInput } from "@festae/shared";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { UsersService } from "../users/users.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  // Cadastro e login ficam bem abaixo do teto geral: são as portas que um
  // ataque de força bruta tenta arrombar, e cinco tentativas por minuto por
  // IP não atrapalham ninguém digitando de verdade.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) body: SignupInput) {
    return this.authService.signup(body);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput) {
    return this.authService.login(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.usersService.findById(user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Exporta todos os dados do usuário autenticado",
    description: "Direito de acesso previsto na LGPD (art. 18, II).",
  })
  @UseGuards(JwtAuthGuard)
  @Get("me/export")
  exportData(@CurrentUser() user: AuthUser) {
    return this.authService.exportData(user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: "Exclui a conta do usuário autenticado",
    description:
      "Apaga nome, e-mail, telefone e endereços de entrega. Pedidos e reservas já feitos permanecem, sem vínculo com pessoa identificável, porque a empresa precisa cumprir a entrega contratada e guardar o registro fiscal.",
  })
  @UseGuards(JwtAuthGuard)
  @Delete("me")
  deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(deleteAccountSchema)) body: DeleteAccountInput,
  ) {
    return this.authService.deleteAccount(user.userId, body.password);
  }
}
