import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createEventSchema, updateEventSchema } from "@festae/shared";
import type { CreateEventInput, UpdateEventInput } from "@festae/shared";
import { EventsService } from "./events.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("events")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("events")
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createEventSchema)) body: CreateEventInput) {
    return this.eventsService.create(user.userId, body);
  }

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.eventsService.findAllForUser(user.userId);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "OPS")
  @Get("admin/all")
  findAllAdmin() {
    return this.eventsService.findAllAdmin();
  }

  @Get(":id")
  findOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.eventsService.findById(id, user);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) body: UpdateEventInput,
  ) {
    return this.eventsService.update(id, user.userId, body);
  }

  @Delete(":id")
  discard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.eventsService.discard(id, user);
  }
}
