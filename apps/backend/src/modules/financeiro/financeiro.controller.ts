import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  NATUREZAS_DO_GASTO,
  type NaturezaDoGasto,
  criarGastoSchema,
  definirMetaSchema,
  editarGastoSchema,
  type CriarGastoInput,
  type DefinirMetaInput,
  type EditarGastoInput,
} from "@festae/shared";
import { FinanceiroService } from "./financeiro.service";
import { ehSituacao } from "./contratos";
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

  /**
   * A carteira de contratos: o que foi vendido, o que entrou, o que falta.
   *
   * Filtra por mês da festa, por situação de pagamento e por texto livre
   * (cliente, cidade, número do contrato). A situação não é filtrável em SQL
   * porque não é coluna — depende da soma dos pagamentos comparada ao total e
   * à data da festa — e a regra que decide isso vive em @festae/shared, num
   * lugar só.
   */
  @Get("contratos")
  listarContratos(
    @Query("mes") mes?: string,
    @Query("situacao") situacao?: string,
    @Query("busca") busca?: string,
  ) {
    const filtrada = (situacao ?? "").trim().toUpperCase();
    return this.financeiro.listarContratos({
      mes: mes || undefined,
      situacao: ehSituacao(filtrada) ? filtrada : undefined,
      busca: busca || undefined,
    });
  }

  /**
   * `natureza` aceita valores separados por vírgula: a aba Despesas pede
   * `CONSUMO,CUSTEIO` e a de Aportes pede `ACERVO`. São a mesma tabela vista
   * por dois filtros, e não duas entidades.
   */
  @Get("gastos")
  listarGastos(@Query("mes") mes?: string, @Query("natureza") natureza?: string) {
    const naturezas = (natureza ?? "")
      .split(",")
      .map((n) => n.trim().toUpperCase())
      .filter((n): n is NaturezaDoGasto => (NATUREZAS_DO_GASTO as readonly string[]).includes(n));
    return this.financeiro.listarGastos({
      mes: mes || undefined,
      natureza: naturezas.length > 0 ? naturezas : undefined,
    });
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
