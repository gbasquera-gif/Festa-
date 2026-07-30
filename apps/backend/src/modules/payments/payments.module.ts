import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { MercadoPagoGateway } from "./gateway/mercadopago-gateway.service";
import { PAYMENT_GATEWAY } from "./gateway/payment-gateway.interface";
import { EventsModule } from "../events/events.module";

@Module({
  imports: [EventsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, { provide: PAYMENT_GATEWAY, useClass: MercadoPagoGateway }],
  exports: [PaymentsService],
})
export class PaymentsModule {}
