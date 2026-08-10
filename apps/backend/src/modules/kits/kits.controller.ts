import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createKitSchema, isEventType, updateKitSchema } from "@festae/shared";
import type { CreateKitInput, UpdateKitInput } from "@festae/shared";
import { KitsService } from "./kits.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("kits")
@Controller("kits")
export class KitsController {
  constructor(private readonly kitsService: KitsService) {}

  @Get()
  findAll(
    @Query("eventType") eventType?: string,
    @Query("themeId") themeId?: string,
    @Query("search") search?: string,
  ) {
    return this.kitsService.findAll({
      // Tipo desconhecido vira "sem filtro" em vez de erro: link velho ou
      // digitado à mão devolve a vitrine inteira, e não uma tela quebrada.
      eventType: eventType && isEventType(eventType) ? eventType : undefined,
      themeId,
      search,
    });
  }

  // Must come before ":id" so "recommend" isn't captured as an id param.
  @Get("recommend")
  recommend(
    @Query("guestCount") guestCount?: string,
    @Query("themeId") themeId?: string,
    @Query("eventType") eventType?: string,
  ) {
    return this.kitsService.recommend({
      guestCount: guestCount ? Number(guestCount) : undefined,
      themeId,
      eventType: eventType && isEventType(eventType) ? eventType : undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.kitsService.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Post()
  create(@Body(new ZodValidationPipe(createKitSchema)) body: CreateKitInput) {
    return this.kitsService.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateKitSchema)) body: UpdateKitInput) {
    return this.kitsService.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.kitsService.remove(id);
  }
}
