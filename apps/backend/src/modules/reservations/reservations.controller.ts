import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  createReservationSchema,
  manualReservationSchema,
  updateReservationStatusSchema,
} from "@festae/shared";
import type {
  CreateReservationInput,
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
