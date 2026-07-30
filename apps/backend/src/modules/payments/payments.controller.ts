import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createCheckoutSchema } from "@festae/shared";
import type { CreateCheckoutInput } from "@festae/shared";
import { PaymentsService } from "./payments.service";
import { EventsService } from "../events/events.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("payments")
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly eventsService: EventsService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("events/:eventId/order/payments")
  async findByEvent(@CurrentUser() user: AuthUser, @Param("eventId") eventId: string) {
    const event = await this.eventsService.findById(eventId, user);
    return this.paymentsService.findByOrder(event.order!.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("events/:eventId/order/payments")
  async createCheckout(
    @CurrentUser() user: AuthUser,
    @Param("eventId") eventId: string,
    @Body(new ZodValidationPipe(createCheckoutSchema)) body: CreateCheckoutInput,
  ) {
    await this.eventsService.findById(eventId, user);
    return this.paymentsService.createCheckout(eventId, body, user.email);
  }

  // Sem guard: o Mercado Pago chama esta rota diretamente, sem token da
  // Festaê. A validação de autenticidade acontece ao buscar o pagamento
  // real na API do Mercado Pago dentro do gateway.
  @Post("payments/webhook/mercadopago")
  @HttpCode(200)
  async webhook(@Body() payload: unknown) {
    await this.paymentsService.handleWebhook(payload);
    return { received: true };
  }
}
