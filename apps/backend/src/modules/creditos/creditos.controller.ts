import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { aplicarCreditoSchema, estornarCreditoSchema } from "@festae/shared";
import type { AplicarCreditoInput, EstornarCreditoInput } from "@festae/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { CreditosService } from "./creditos.service";

/**
 * Crédito Festaê. Tudo autenticado, e só para a equipe.
 *
 * O voucher não tem endereço público: é montado pelo painel a partir destes
 * dados, com o token de quem está logado. Um link aberto com o id do
 * movimento seria nome de cliente e valor esperando quem adivinhasse o id.
 */
@ApiTags("creditos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CreditosController {
  constructor(private readonly creditos: CreditosService) {}

  @ApiOperation({ summary: "Cadastro da cliente com saldo, extrato de crédito e festas" })
  @Roles("ADMIN", "OPS")
  @Get("clientes/:id/creditos")
  daCliente(@Param("id") id: string) {
    return this.creditos.daCliente(id);
  }

  @ApiOperation({ summary: "Dados do comprovante do saldo atual de crédito" })
  @Roles("ADMIN", "OPS")
  @Get("clientes/:id/creditos/saldo")
  comprovanteDoSaldo(@Param("id") id: string) {
    return this.creditos.comprovanteDoSaldo(id);
  }

  @ApiOperation({
    summary: "Crédito disponível da ficha que a venda manual vai usar",
    description: "Mesma regra de reaproveitamento do cadastro: e-mail, ou telefone na falta dele.",
  })
  @Roles("ADMIN", "OPS")
  @Get("creditos/por-contato")
  porContato(@Query("telefone") telefone = "", @Query("email") email?: string) {
    return this.creditos.porContato(telefone, email || undefined);
  }

  @ApiOperation({ summary: "Aplica crédito Festaê da cliente numa reserva" })
  @Roles("ADMIN", "OPS")
  @Post("reservations/:id/creditos")
  aplicar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(aplicarCreditoSchema)) body: AplicarCreditoInput,
  ) {
    return this.creditos.aplicar(id, body.valor, body.observacao, user.userId);
  }

  /**
   * Estorno de utilização lançada por engano. Só ADMIN: é ajuste manual do
   * extrato, e ajuste manual de dinheiro é decisão de quem responde por ele.
   */
  @ApiOperation({ summary: "Estorna uma utilização de crédito lançada por engano" })
  @Roles("ADMIN")
  @Post("creditos/:id/estorno")
  estornar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(estornarCreditoSchema)) body: EstornarCreditoInput,
  ) {
    return this.creditos.estornar(id, body.motivo, user.userId);
  }

  @ApiOperation({ summary: "Dados do Voucher de Crédito de um crédito gerado" })
  @Roles("ADMIN", "OPS")
  @Get("creditos/:id/voucher")
  voucher(@Param("id") id: string) {
    return this.creditos.voucher(id);
  }
}
