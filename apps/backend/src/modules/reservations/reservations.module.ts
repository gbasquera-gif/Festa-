import { Module } from "@nestjs/common";
import { ReservationsController } from "./reservations.controller";
import { ReservationsService } from "./reservations.service";
import { ManualReservationService } from "./manual-reservation.service";
import { EventsModule } from "../events/events.module";
import { AvailabilityModule } from "../availability/availability.module";

@Module({
  imports: [EventsModule, AvailabilityModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, ManualReservationService],
})
export class ReservationsModule {}
