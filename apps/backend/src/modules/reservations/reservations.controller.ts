import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createReservationSchema, updateReservationStatusSchema } from "@festae/shared";
import type { CreateReservationInput, UpdateReservationStatusInput } from "@festae/shared";
import { ReservationsService } from "./reservations.service";
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
