import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createProductSchema, updateProductSchema } from "@festae/shared";
import type { CreateProductInput, ProductCategory, UpdateProductInput } from "@festae/shared";
import { ProductsService } from "./products.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query("category") category?: ProductCategory) {
    return this.productsService.findAll(category);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.productsService.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Post()
  create(@Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput) {
    return this.productsService.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Put(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput) {
    return this.productsService.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "OPS")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }
}
