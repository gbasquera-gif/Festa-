import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createCheckoutSchema } from "@festae/shared";
import type { CreateCheckoutInput } from "@festae/shared";
import { PaymentsService } from "./payments.service";
import { isValidWebhookSignature } from "./webhook-signature";
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

  /**
   * Notificação do Mercado Pago.
   *
   * Sem guard de JWT: quem chama é o Mercado Pago, que não tem token nosso.
   * Em lugar disso, duas camadas — a assinatura do cabeçalho comprova que a
   * chamada veio deles, e o status nunca sai do corpo da notificação, é
   * buscado na API deles dentro do gateway.
   *
   * Responde 200 mesmo em erro de processamento: o Mercado Pago reenvia o
   * que não for confirmado, e reenvio em looping por causa de um problema
   * nosso não ajuda ninguém. Assinatura inválida, essa sim, é recusada.
   */
  @Post("payments/webhook/mercadopago")
  @HttpCode(200)
  async webhook(
    @Body() payload: unknown,
    @Headers("x-signature") xSignature?: string,
    @Headers("x-request-id") xRequestId?: string,
    @Query("data.id") dataIdFromQuery?: string,
  ) {
    const dataId =
      dataIdFromQuery ?? (payload as { data?: { id?: string } })?.data?.id ?? undefined;

    if (!isValidWebhookSignature({ xSignature, xRequestId, dataId })) {
      throw new ForbiddenException("Assinatura inválida.");
    }

    await this.paymentsService.handleWebhook(payload);
    return { received: true };
  }
}
