import { Module } from "@nestjs/common";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";
import { ConflitosService } from "./conflitos.service";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  // A liberação das reservas sem sinal pergunta aos pagamentos antes de
  // devolver as peças.
  imports: [PaymentsModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, ConflitosService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
