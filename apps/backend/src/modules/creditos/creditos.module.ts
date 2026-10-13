import { Module } from "@nestjs/common";
import { ReservationsModule } from "../reservations/reservations.module";
import { CreditosController } from "./creditos.controller";
import { CreditosService } from "./creditos.service";

@Module({
  imports: [ReservationsModule],
  controllers: [CreditosController],
  providers: [CreditosService],
  exports: [CreditosService],
})
export class CreditosModule {}
