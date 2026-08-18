import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createThemeSchema, isEventType, updateThemeSchema } from "@festae/shared";
import type { CreateThemeInput, UpdateThemeInput } from "@festae/shared";
import { ThemesService } from "./themes.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("themes")
@Controller("themes")
export class ThemesController {
  constructor(private readonly themesService: ThemesService) {}

  @Get()
  findAll(@Query("eventType") eventType?: string) {
    return this.themesService.findAll(
      eventType && isEventType(eventType) ? eventType : undefined,
    );
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.themesService.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Post()
  create(@Body(new ZodValidationPipe(createThemeSchema)) body: CreateThemeInput) {
    return this.themesService.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateThemeSchema)) body: UpdateThemeInput) {
    return this.themesService.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.themesService.remove(id);
  }
}
