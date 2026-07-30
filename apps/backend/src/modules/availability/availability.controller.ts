import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { availabilityQuerySchema } from "@festae/shared";
import type { AvailabilityQuery } from "@festae/shared";
import { AvailabilityService } from "./availability.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@ApiTags("availability")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  getMonth(@Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery) {
    return this.availabilityService.getMonth(query.month);
  }
}
