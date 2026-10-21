import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  alterarDataSchema,
  cancelarReservaSchema,
  createReservationSchema,
  editarReservaSchema,
  registrarPagamentoSchema,
  corrigirPagamentoSchema,
  manualReservationSchema,
  registrarReembolsoSchema,
  tratarPagamentoTardioSchema,
  updateReservationStatusSchema,
} from "@festae/shared";
import type {
  AlterarDataInput,
  CancelarReservaInput,
  CreateReservationInput,
  EditarReservaInput,
  RegistrarPagamentoInput,
  CorrigirPagamentoInput,
  ManualReservationInput,
  RegistrarReembolsoInput,
  TratarPagamentoTardioInput,
  UpdateReservationStatusInput,
} from "@festae/shared";
import { ReservationsService } from "./reservations.service";
import { ManualReservationService } from "./manual-reservation.service";
import { EventsService } from "../events/events.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Dinheiro registrado à mão — recebimento ou devolução já feita — é só do
 * ADMIN. OPS continua operando a reserva e vendo os pagamentos; o que entra e
 * sai pela loja (checkout e aviso do Mercado Pago) segue automático, sem
 * passar por aqui.
 */
function soAdminRegistraDinheiro(user: AuthUser, registraDinheiro: boolean, mensagem: string) {
  if (registraDinheiro && user.role !== "ADMIN") throw new ForbiddenException(mensagem);
}

@ApiTags("reservations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReservationsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly manualReservations: ManualReservationService,
    private readonly eventsService: EventsService,
  ) {}

  @Post("events/:eventId/reservation")
  async request(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(createReservationSchema)) body: CreateReservationInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.reservationsService.requestReservation(eventId, body);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Get("reservations")
  findAll() {
    return this.reservationsService.findAllAdmin();
  }

  /** Uma reserva só, com cliente, kit, itens e pagamentos — para reabrir na edição. */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Get("reservations/:id")
  findOne(@Param("id") id: string) {
    return this.reservationsService.findOneAdmin(id);
  }

  /**
   * Venda fechada por fora da loja, registrada no painel.
   *
   * Passa pelas mesmas conferências da reserva da loja — capacidade do dia e
   * estoque item a item. Quando não cabe, devolve o detalhe para a operação
   * decidir, em vez de recusar com uma frase genérica.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Post("reservations/manual")
  criarManual(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualReservationSchema)) body: ManualReservationInput,
  ) {
    // OPS cria a venda; o sinal nasce a receber e o ADMIN registra o recebimento.
    soAdminRegistraDinheiro(
      user,
      body.financeiro.sinal > 0 && body.financeiro.statusPagamento !== "PENDING",
      "Registrar recebimento é do ADMIN. Crie a venda com o sinal a receber; o ADMIN registra o pagamento depois.",
    );
    return this.manualReservations.criar(body, user.userId);
  }

  /**
   * Reescreve a reserva inteira: data, itens, kit, tema, logística e valores.
   *
   * Reconfere agenda e estoque na data final, ignorando a própria reserva —
   * caso contrário nenhuma edição passaria, porque a festa brigaria com o
   * material que ela mesma já segura. Pagamentos ficam intactos.
   *
   * OPS edita junto com ADMIN: corrigir o que foi vendido é atendimento do
   * dia a dia. O que continua exclusivo de ADMIN é apagar.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id")
  editar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(editarReservaSchema)) body: EditarReservaInput,
  ) {
    return this.manualReservations.editar(id, body, user.userId);
  }

  /**
   * Remarca a festa para outro dia.
   *
   * Passa pelas mesmas conferências de uma reserva nova na data de destino:
   * capacidade do dia e material item a item. OPS também remarca — é
   * atendimento do dia a dia, não decisão de dono.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id/data")
  alterarData(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(alterarDataSchema)) body: AlterarDataInput,
  ) {
    return this.reservationsService.alterarData(id, body.data, user.userId);
  }

  /**
   * Registra um pagamento recebido por fora do aplicativo.
   *
   * Pix na chave da Maria Luiza, transferência, dinheiro na retirada — tudo
   * que o Mercado Pago não tem como avisar. Acrescenta o pagamento, confirma
   * a reserva quando é o sinal, e encerra o Pix pendente que a cliente não
   * vai mais pagar.
   *
   * Só ADMIN: é confirmação financeira manual. OPS vê os pagamentos da
   * reserva, mas não registra recebimento.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Post("reservations/:id/pagamentos")
  registrarPagamento(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(registrarPagamentoSchema)) body: RegistrarPagamentoInput,
  ) {
    return this.reservationsService.registrarPagamento(id, body, user.userId);
  }

  /**
   * Corrige um pagamento lançado à mão (valor, data) ou o anula.
   *
   * Só ADMIN: é a exceção à regra de que dinheiro registrado não se
   * reescreve. Exige justificativa, e o antes e o depois ficam no histórico.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Post("reservations/:id/pagamentos/:pagamentoId/correcao")
  corrigirPagamento(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("pagamentoId") pagamentoId: string,
    @Body(new ZodValidationPipe(corrigirPagamentoSchema)) body: CorrigirPagamentoInput,
  ) {
    return this.reservationsService.corrigirPagamento(id, pagamentoId, body, user.userId);
  }

  /**
   * Cancela a reserva mantendo o histórico. Libera data e material.
   *
   * Recebe o motivo e o destino do valor pago — crédito, reembolso,
   * retenção —, que precisam somar exatamente o pago. Crédito Festaê que
   * estava aplicado volta sozinho ao saldo da cliente.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id/cancelar")
  cancelar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelarReservaSchema)) body: CancelarReservaInput,
  ) {
    // OPS cancela e define o destino; a devolução já feita é o ADMIN quem registra.
    soAdminRegistraDinheiro(
      user,
      body.reembolso > 0 && body.reembolsadoEm !== undefined,
      "A devolução já feita é registrada pelo ADMIN. Cancele com o reembolso a realizar.",
    );
    return this.reservationsService.cancelar(id, body, user.userId);
  }

  /**
   * Destino de pagamento recebido depois do cancelamento: crédito, reembolso
   * ou retenção, somando exatamente o valor pendente. Não altera o tratamento
   * original — grava um complementar.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Post("reservations/:id/tratamento-complementar")
  tratarPagamentoTardio(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(tratarPagamentoTardioSchema)) body: TratarPagamentoTardioInput,
  ) {
    soAdminRegistraDinheiro(
      user,
      body.reembolso > 0 && body.reembolsadoEm !== undefined,
      "A devolução já feita é registrada pelo ADMIN. Registre o tratamento com o reembolso a realizar.",
    );
    return this.reservationsService.tratarPagamentoTardio(id, body, user.userId);
  }

  /**
   * Registra uma devolução que a Festaê JÁ fez, por Pix ou outro meio, fora
   * do sistema. Não transfere dinheiro. É o que tira o valor do caixa, no dia
   * informado. Só ADMIN, como registrar pagamento.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Post("reservations/:id/reembolso-realizado")
  registrarReembolso(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(registrarReembolsoSchema)) body: RegistrarReembolsoInput,
  ) {
    return this.reservationsService.registrarReembolso(id, body, user.userId);
  }

  /** Material devolvido: marca a devolução e conclui a reserva. */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id/devolucao")
  confirmarDevolucao(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.reservationsService.confirmarDevolucao(id, user.userId);
  }

  /**
   * Apaga a reserva de vez, com a festa e o pedido inteiros.
   *
   * Só ADMIN: é a única ação do painel que não tem volta, e existe para
   * limpar lançamento de teste — não para desfazer venda, que é o que
   * cancelar faz guardando o histórico.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN")
  @Delete("reservations/:id")
  excluir(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.reservationsService.excluirDefinitivamente(id, user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id/status")
  updateStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateReservationStatusSchema)) body: UpdateReservationStatusInput,
  ) {
    return this.reservationsService.updateStatus(id, body);
  }
}
