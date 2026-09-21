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
  // Exportado para o módulo de Orçamentos converter proposta aprovada
  // em venda pelo MESMO caminho, sem uma segunda lógica de reserva.
  exports: [ManualReservationService],
})
export class ReservationsModule {}
