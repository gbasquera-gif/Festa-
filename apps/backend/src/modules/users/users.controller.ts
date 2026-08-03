import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { resetPasswordSchema } from "@festae/shared";
import type { ResetPasswordInput } from "@festae/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles("ADMIN", "OPS")
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  // Só ADMIN: definir a senha de outra pessoa é poder entrar na conta dela,
  // então fica fora do alcance de OPS.
  @ApiOperation({
    summary: "Define uma senha nova para um cliente",
    description:
      "Usado quando o cliente perde a senha e pede ajuda pelo WhatsApp, já que ainda não há recuperação por e-mail.",
  })
  @Roles("ADMIN")
  @Patch(":id/password")
  resetPassword(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ) {
    return this.usersService.resetPassword(id, body.password);
  }
}
