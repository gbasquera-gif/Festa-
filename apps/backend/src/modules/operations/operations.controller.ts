import { Body, Controller, Get, Header, Param, Patch, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { marcarTarefaSchema, type MarcarTarefaInput } from "@festae/shared";
import { OperationsService } from "./operations.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

/** Onde a reserva vive no painel — vai dentro do evento do calendário. */
const PAINEL_URL = process.env.ADMIN_URL ?? "https://alert-compassion-production-d6b1.up.railway.app";

@ApiTags("operations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPS")
@Controller("operacao")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("proximas-acoes")
  proximasAcoes() {
    return this.operations.proximasAcoes();
  }

  @Get("reservas/:id")
  detalhe(@Param("id") id: string) {
    return this.operations.detalhe(id);
  }

  @Patch("reservas/:id/tarefas")
  marcarTarefa(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(marcarTarefaSchema)) body: MarcarTarefaInput,
  ) {
    return this.operations.marcarTarefa(id, body.key, body.done, user.userId);
  }

  @Get("reservas/:id/google-agenda")
  async google(@Param("id") id: string) {
    return { url: await this.operations.linkGoogle(id, `${PAINEL_URL}/reservas`) };
  }

  /**
   * O arquivo de calendário da festa.
   *
   * `Content-Disposition: attachment` é o que faz o celular abrir o
   * aplicativo de agenda em vez de mostrar o texto do arquivo na tela.
   */
  @Get("reservas/:id/calendario.ics")
  @Header("Content-Type", "text/calendar; charset=utf-8")
  async ics(@Param("id") id: string, @Res() res: Response) {
    const conteudo = await this.operations.ics(id, `${PAINEL_URL}/reservas`);
    res.setHeader("Content-Disposition", `attachment; filename="festae-${id}.ics"`);
    res.send(conteudo);
  }
}
