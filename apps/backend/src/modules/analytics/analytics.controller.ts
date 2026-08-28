import { Body, Controller, Delete, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { trackEventSchema } from "@festae/shared";
import type { TrackEventInput } from "@festae/shared";
import { AnalyticsService } from "./analytics.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Sem guard de propósito: eventos de funil (ex: Cadastro, Abandono) podem
  // acontecer antes de existir um token válido na sessão do app.
  @Post("events")
  track(@Body(new ZodValidationPipe(trackEventSchema)) body: TrackEventInput) {
    return this.analyticsService.track(body);
  }

  /**
   * `mes` no formato "2026-08". Sem ele, a janela é a dos últimos 30 dias.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Get("summary")
  summary(@Query("mes") mes?: string) {
    return this.analyticsService.summary(mes);
  }

  /**
   * Recomeça a contagem do funil do zero.
   *
   * Só ADMIN: apagar métrica é decisão de dono, não tarefa de operação do
   * dia a dia. Apaga apenas eventos de funil — reserva, pagamento e cliente
   * são registro do negócio e ficam onde estão.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Delete("events")
  zerar() {
    return this.analyticsService.zerarEventos();
  }
}
