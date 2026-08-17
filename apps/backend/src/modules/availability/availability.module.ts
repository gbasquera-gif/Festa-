import { Module } from "@nestjs/common";
import { AvailabilityController } from "./availability.controller";
import { AvailabilityService } from "./availability.service";
import { ConflitosService } from "./conflitos.service";

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityService, ConflitosService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
