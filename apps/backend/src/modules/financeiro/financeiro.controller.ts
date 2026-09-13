import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  criarGastoSchema,
  definirMetaSchema,
  editarGastoSchema,
  type CriarGastoInput,
  type DefinirMetaInput,
  type EditarGastoInput,
} from "@festae/shared";
import { FinanceiroService } from "./financeiro.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

/**
 * Só ADMIN.
 *
 * A operação (OPS) precisa saber o que entregar e quando, não a margem do
 * negócio. Quem monta a festa não tem por que ver o lucro do mês — e o painel
 * antigo não tinha autenticação nenhuma, o que significa que qualquer pessoa
 * com o endereço via tudo, e podia apagar.
 */
@ApiTags("financeiro")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
@Controller("financeiro")
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get("indicadores")
  indicadores(@Query("mes") mes: string) {
    return this.financeiro.indicadores(mes);
  }

  @Get("gastos")
  listarGastos(@Query("mes") mes?: string) {
    return this.financeiro.listarGastos(mes);
  }

  @Post("gastos")
  criarGasto(@Body(new ZodValidationPipe(criarGastoSchema)) body: CriarGastoInput) {
    return this.financeiro.criarGasto(body);
  }

  @Patch("gastos/:id")
  editarGasto(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(editarGastoSchema)) body: EditarGastoInput,
  ) {
    return this.financeiro.editarGasto(id, body);
  }

  @Delete("gastos/:id")
  apagarGasto(@Param("id") id: string) {
    return this.financeiro.apagarGasto(id);
  }

  @Post("meta")
  definirMeta(@Body(new ZodValidationPipe(definirMetaSchema)) body: DefinirMetaInput) {
    return this.financeiro.definirMeta(body.competencia, body.lucroAlvo);
  }
}
