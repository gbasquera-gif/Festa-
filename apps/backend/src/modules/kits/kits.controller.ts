import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createKitSchema, updateKitSchema } from "@festae/shared";
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
  findAll() {
    return this.kitsService.findAll();
  }

  // Must come before ":id" so "recommend" isn't captured as an id param.
  @Get("recommend")
  recommend(@Query("guestCount") guestCount?: string, @Query("themeId") themeId?: string) {
    return this.kitsService.recommend({
      guestCount: guestCount ? Number(guestCount) : undefined,
      themeId,
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
