import { BadRequestException, Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JANELA_PADRAO_DO_ACERVO, ehJanelaDoAcervo } from "@festae/shared";
import { AcervoService } from "./acervo.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/**
 * Só ADMIN, como Financeiro e Comercial: a tela mostra valor de contrato.
 */
@ApiTags("acervo")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("acervo/performance")
export class AcervoController {
  constructor(private readonly acervo: AcervoService) {}

  /** `periodo` em dias: 30, 90, 180 ou 365. Sem nada, 90. */
  @Get()
  performance(@Query("periodo") periodo?: string) {
    return this.acervo.performance(lerJanela(periodo));
  }

  /** As festas de um produto no período, do mesmo conjunto da tabela. */
  @Get("produtos/:id")
  detalhe(@Param("id") id: string, @Query("periodo") periodo?: string) {
    return this.acervo.detalheDoProduto(id, lerJanela(periodo));
  }
}

export function lerJanela(periodo?: string): number {
  if (periodo === undefined || periodo === "") return JANELA_PADRAO_DO_ACERVO;
  const dias = Number(periodo);
  if (!/^\d+$/.test(periodo) || !ehJanelaDoAcervo(dias)) {
    throw new BadRequestException("periodo deve ser 30, 90, 180 ou 365.");
  }
  return dias;
}
