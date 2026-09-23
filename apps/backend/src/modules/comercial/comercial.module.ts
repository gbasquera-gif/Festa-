import { Module } from "@nestjs/common";
import { ComercialController } from "./comercial.controller";
import { ComercialService } from "./comercial.service";

@Module({
  controllers: [ComercialController],
  providers: [ComercialService],
})
export class ComercialModule {}
