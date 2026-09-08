import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  alterarDataSchema,
  createReservationSchema,
  editarReservaSchema,
  manualReservationSchema,
  updateReservationStatusSchema,
} from "@festae/shared";
import type {
  AlterarDataInput,
  CreateReservationInput,
  EditarReservaInput,
  ManualReservationInput,
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
   * Cancela a reserva mantendo o histórico. Libera data e material.
   */
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Patch("reservations/:id/cancelar")
  cancelar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.reservationsService.cancelar(id, user.userId);
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
