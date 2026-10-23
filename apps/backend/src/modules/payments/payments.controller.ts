import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { createCheckoutSchema } from "@festae/shared";
import type { CreateCheckoutInput } from "@festae/shared";
import { DIAS_MAXIMOS_DA_CONCILIACAO, PaymentsService, emProducao } from "./payments.service";
import { NotificacoesProcessadas, lerNotificacao, verificarAssinatura } from "./webhook-signature";
import { EventsService } from "../events/events.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("payments")
@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  private readonly processadas = new NotificacoesProcessadas();

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
   * Em lugar disso:
   *  - o id da notificação é lido uma vez; URL e corpo têm de concordar, e é
   *    esse id — o assinado — o único processado;
   *  - a assinatura é obrigatória em produção e precisa estar na janela;
   *  - a mesma notificação (x-request-id) não é processada duas vezes;
   *  - o status vem da API do Mercado Pago, e o pagamento é conferido contra
   *    a cobrança (referência, id do Pix, valor, moeda) antes de gravar.
   *
   * Erro ao processar responde erro, e o Mercado Pago reenvia. O que mesmo
   * assim se perder, a conferência periódica dos Pix pendentes encontra.
   */
  @Post("payments/webhook/mercadopago")
  @HttpCode(200)
  async webhook(
    @Body() payload: unknown,
    @Headers("x-signature") xSignature?: string,
    @Headers("x-request-id") xRequestId?: string,
    @Query("data.id") dataIdDaUrl?: unknown,
    @Query("type") tipo?: unknown,
    @Query("topic") topico?: unknown,
  ) {
    const notificacao = lerNotificacao({ dataId: dataIdDaUrl, type: tipo, topic: topico }, payload);
    if (!notificacao.ok) {
      this.logger.warn("Notificação do Mercado Pago recusada: o id da URL e o do corpo não conferem.");
      throw new BadRequestException("Notificação inválida.");
    }

    const agora = Date.now();
    const assinatura = verificarAssinatura(
      { xSignature, xRequestId, dataId: notificacao.dataId },
      { agora, producao: emProducao(), segredo: process.env.MP_WEBHOOK_SECRET },
    );
    if (!assinatura.valida) {
      if (assinatura.motivo === "SEM_SEGREDO_EM_PRODUCAO") {
        this.logger.error(
          "MP_WEBHOOK_SECRET não configurado: notificações do Mercado Pago recusadas. A conferência periódica segue registrando os Pix pagos.",
        );
      } else {
        this.logger.warn(`Notificação do Mercado Pago recusada: assinatura ${assinatura.motivo}.`);
      }
      throw new ForbiddenException("Assinatura inválida.");
    }
    if (!assinatura.conferida) {
      this.logger.warn("MP_WEBHOOK_SECRET não configurado: assinatura não verificada (fora de produção).");
    }

    if (!notificacao.ehPagamento || !notificacao.dataId) return { received: true };
    if (xRequestId && this.processadas.jaProcessada(xRequestId, agora)) return { received: true };

    await this.paymentsService.processarNotificacao(notificacao.dataId);
    if (xRequestId) this.processadas.marcar(xRequestId, agora);
    return { received: true };
  }

  /**
   * Conciliação com o Mercado Pago, só leitura. ADMIN: mostra valores e a
   * situação de cada recebimento online.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Get("pagamentos/conciliacao-mercado-pago")
  conciliar(@Query("dias") dias?: string) {
    const n = Number(dias ?? 30);
    if (!Number.isInteger(n) || n < 1 || n > DIAS_MAXIMOS_DA_CONCILIACAO) {
      throw new BadRequestException(`Informe de 1 a ${DIAS_MAXIMOS_DA_CONCILIACAO} dias.`);
    }
    return this.paymentsService.conciliar(n);
  }

  /**
   * Confere uma cobrança no Mercado Pago e registra o pagamento se ele
   * estiver aprovado e conferido. Mesma regra do webhook; divergência não
   * muda nada.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("pagamentos/:id/conferir-no-mercado-pago")
  conferir(@Param("id") id: string) {
    return this.paymentsService.conferirCobranca(id);
  }
}
