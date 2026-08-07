import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  addOrderItemSchema,
  selectKitSchema,
  setLogisticsSchema,
  updateOrderItemSchema,
} from "@festae/shared";
import type {
  AddOrderItemInput,
  SelectKitInput,
  SetLogisticsInput,
  UpdateOrderItemInput,
} from "@festae/shared";
import { OrdersService } from "./orders.service";
import { EventsService } from "../events/events.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("events/:eventId/order")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly eventsService: EventsService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    await this.eventsService.findById(eventId, user);
    return this.ordersService.findByEventId(eventId);
  }

  @Post("kit")
  async selectKit(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(selectKitSchema)) body: SelectKitInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.ordersService.selectKit(eventId, body);
  }

  @Patch("logistics")
  async setLogistics(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(setLogisticsSchema)) body: SetLogisticsInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.ordersService.setLogistics(eventId, body);
  }

  @Post("items")
  async addItem(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(addOrderItemSchema)) body: AddOrderItemInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.ordersService.addItem(eventId, body);
  }

  @Patch("items/:productId")
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Param("productId") productId: string,
    @Body(new ZodValidationPipe(updateOrderItemSchema)) body: UpdateOrderItemInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.ordersService.updateItem(eventId, productId, body);
  }
}
