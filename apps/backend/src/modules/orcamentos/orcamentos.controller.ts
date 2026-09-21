import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { orcamentoSchema, recusarOrcamentoSchema, type OrcamentoInput } from "@festae/shared";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { OrcamentosService } from "./orcamentos.service";

/** O painel de propostas. Operação e administração montam e acompanham. */
@ApiTags("orcamentos")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "OPS")
@Controller("orcamentos")
export class OrcamentosController {
  constructor(private readonly orcamentos: OrcamentosService) {}

  @Get()
  listar() {
    return this.orcamentos.listar();
  }

  @Get("conteudo")
  conteudo() {
    return this.orcamentos.conteudo();
  }

  @Put("conteudo")
  salvarConteudo(
    @Body() body: { blocos: { chave: string; titulo?: string; texto?: string; imagemUrl?: string }[] },
  ) {
    return this.orcamentos.salvarConteudo(body.blocos ?? []);
  }

  @Get(":id")
  obter(@Param("id") id: string) {
    return this.orcamentos.obter(id);
  }

  @Post()
  criar(
    @Body(new ZodValidationPipe(orcamentoSchema)) body: OrcamentoInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orcamentos.criar(body, user.userId);
  }

  @ApiOperation({
    summary: "Atualiza a proposta",
    description:
      "Rascunho é editado no lugar. Proposta já enviada gera versão nova e volta a rascunho — o valor que a cliente recebeu continua registrado.",
  })
  @Put(":id")
  atualizar(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(orcamentoSchema)) body: OrcamentoInput,
  ) {
    return this.orcamentos.atualizar(id, body);
  }

  @Patch(":id/enviar")
  enviar(@Param("id") id: string) {
    return this.orcamentos.enviar(id);
  }

  // Só ADMIN: apagar proposta é apagar documento, e OPS monta proposta o dia
  // inteiro. Um clique errado no meio do expediente não pode sumir com uma.
  @ApiOperation({
    summary: "Exclui a proposta definitivamente",
    description:
      "Vale enquanto a proposta não virou reserva — inclusive aprovada e ainda não convertida. Convertida em reserva ou registrada como perdida são recusadas com 409. Itens e versões saem por cascata; reserva, pedido, pagamento, cliente e catálogo não são tocados.",
  })
  @Roles("ADMIN")
  @Delete(":id")
  excluir(@Param("id") id: string) {
    return this.orcamentos.excluir(id);
  }

  @Patch(":id/recusar")
  recusar(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recusarOrcamentoSchema)) body: { motivo?: string },
  ) {
    return this.orcamentos.recusar(id, body.motivo);
  }

  @ApiOperation({
    summary: "Confirma que o sinal caiu",
    description:
      "Converte a proposta (com checagem de disponibilidade) e registra o sinal pelo mesmo caminho da tela de Reservas. Recusa se o sinal já estiver coberto.",
  })
  @Post(":id/confirmar-sinal")
  confirmarSinal(
    @Param("id") id: string,
    @Body() body: { forma?: string; recebidoEm?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.orcamentos.confirmarSinal(id, user.userId, body ?? {});
  }

  @ApiOperation({
    summary: "Converte a proposta aprovada em reserva",
    description:
      "Passa pelo mesmo fluxo da venda manual, com a mesma checagem de disponibilidade. Falta de peça devolve 409 com os conflitos e nada é criado.",
  })
  @Post(":id/converter")
  converter(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.orcamentos.converter(id, user.userId);
  }
}
