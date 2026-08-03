import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
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

  @Post("signup")
  signup(@Body(new ZodValidationPipe(signupSchema)) body: SignupInput) {
    return this.authService.signup(body);
  }

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
