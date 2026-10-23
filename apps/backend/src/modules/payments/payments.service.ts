import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { prisma, type Payment } from "@festae/database";
import {
  PERCENTUAL_DO_SALDO,
  PERCENTUAL_DO_SINAL,
  PIX_EXPIRATION_MINUTES,
  confirmaAReserva,
  saldoAPagar,
  splitPayment,
  type ReservationStatus,
} from "@festae/shared";
import type { CreateCheckoutInput as CreateCheckoutBody } from "@festae/shared";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./gateway/payment-gateway.interface";
import { travarPedido } from "../creditos/ledger";
import {
  TEXTO_DO_ALERTA,
  consolidarDecisoes,
  decidirPeloProvedor,
  type DecisaoConsolidada,
  type MotivoDoAlerta,
  type PagamentoNoProvedor,
} from "./conferencia-do-provedor";

/** Reserva que não existe mais como festa: cancelada ou recusada. */
const ENCERRADAS = ["CANCELLED", "REJECTED"];

/** O que aconteceu com as cobranças pendentes de uma reserva cancelada. */
export type EncerramentoDeCobrancas = {
  /** Encerradas: no provedor, ou só aqui quando nunca existiram lá. */
  encerradas: number;
  /** Já tinham sido pagas: viram pagamento após o cancelamento. */
  jaPagas: number;
  /** Não deu para confirmar o encerramento no provedor. */
  naoEncerradas: number;
};

/**
 * O que a cliente lê na fatura do Mercado Pago.
 *
 * A porcentagem vem da constante, não da mão: é texto que sai da Festaê e
 * chega no extrato de outra pessoa, e prometer 50% num lugar onde o sistema
 * cobra 30% é o tipo de divergência que só aparece na reclamação.
 */
const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: `Sinal (${PERCENTUAL_DO_SINAL}) da festa`,
  BALANCE: `Saldo restante (${PERCENTUAL_DO_SALDO}) da festa`,
};

/**
 * Quanto cobrar neste Pix.
 *
 * As duas metades desta conta são diferentes, e a diferença tem valor em
 * reais. O SINAL é uma fração do total — é o que a Festaê pede para segurar
 * a data. O SALDO é dívida: o que falta depois de tudo que já entrou.
 *
 * Enquanto o sinal foi 50% para todo mundo, `total − sinal` e `total − pago`
 * davam sempre o mesmo número, e a distinção não aparecia. Baixar o sinal
 * para 30% separou as duas: uma festa de R$ 600 cujo sinal de 50% (R$ 300)
 * já entrou cobraria R$ 420 de saldo se a conta fosse refeita pela taxa de
 * hoje — R$ 120 a mais do que a cliente deve. Por isso o saldo se mede pelo
 * que foi pago, nunca pela taxa vigente.
 *
 * Função separada e exportada porque é uma decisão sobre o dinheiro de outra
 * pessoa: merece teste próprio, sem precisar de banco nem de gateway.
 */
export function valorACobrar(
  tipo: "DEPOSIT" | "BALANCE" | string,
  total: number,
  pagamentosPagos: number[],
): number {
  if (tipo === "DEPOSIT") return splitPayment(total).deposit;
  const jaPago = pagamentosPagos.reduce((soma, valor) => soma + valor, 0);
  return saldoAPagar(total, jaPago);
}

/** Intervalo mínimo entre duas consultas ao Mercado Pago sobre o mesmo Pix. */
const SYNC_INTERVAL_MS = 20_000;

/** De quanto em quanto tempo os Pix pendentes são conferidos sem ninguém pedir. */
const INTERVALO_DA_CONFERENCIA_MS = 5 * 60_000;
/** Até quanto tempo depois de criado um Pix ainda é conferido sozinho. */
const IDADE_MAXIMA_DA_CONFERENCIA_MS = 48 * 60 * 60_000;
/** Quantas cobranças por rodada: limita as chamadas ao Mercado Pago. */
const COBRANCAS_POR_RODADA = 25;

/** Teto da conciliação: dias para trás e cobranças por pedido. */
export const DIAS_MAXIMOS_DA_CONCILIACAO = 90;
const COBRANCAS_POR_CONCILIACAO = 200;

export function emProducao(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * A conferência periódica liga sozinha em produção, com o Mercado Pago
 * configurado. `PAGAMENTOS_CONFERENCIA_PERIODICA=desligada` a desliga sem
 * deploy de código.
 */
export function conferenciaPeriodicaLigada(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== "production" || !env.MP_ACCESS_TOKEN?.trim()) return false;
  return env.PAGAMENTOS_CONFERENCIA_PERIODICA?.trim().toLowerCase() !== "desligada";
}

/** O que a conciliação diz de cada cobrança. */
export type SituacaoNaConciliacao =
  | "CONFERE"
  /** Aprovado no Mercado Pago, conferido, e ainda não registrado aqui. */
  | "PAGO_NAO_REGISTRADO"
  /** Pendente ou recusado lá também: nada a registrar. */
  | "SEM_PAGAMENTO"
  | "NAO_ENCONTRADO"
  | "ERRO_NA_CONSULTA"
  | MotivoDoAlerta;

export type ItemDaConciliacao = {
  pagamentoId: string;
  reservaId: string | null;
  contrato: number | null;
  tipo: string;
  metodo: string;
  statusAqui: string;
  valorAqui: number;
  recebidoEm: string | null;
  criadoEm: string;
  idNoProvedor: string | null;
  statusNoProvedor: string | null;
  valorNoProvedor: number | null;
  valorEstornado: number | null;
  situacao: SituacaoNaConciliacao;
};

function paraConferir(c: Pick<Payment, "id" | "status" | "method" | "amount" | "externalReference">) {
  return {
    id: c.id,
    status: c.status,
    metodo: c.method,
    valor: Number(c.amount),
    externalReference: c.externalReference,
  };
}

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private conferencia?: NodeJS.Timeout;
  private conferindo = false;

  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  onModuleInit() {
    if (!conferenciaPeriodicaLigada()) return;
    this.conferencia = setInterval(() => void this.conferirPendentes(), INTERVALO_DA_CONFERENCIA_MS);
    this.conferencia.unref();
  }

  onModuleDestroy() {
    if (this.conferencia) clearInterval(this.conferencia);
  }

  /**
   * Pagamentos do pedido, com o pendente reconferido no Mercado Pago.
   *
   * A tela do cliente consulta este endpoint enquanto espera o Pix cair. Se
   * o webhook se perder — configuração errada, instabilidade, retentativa
   * que nunca chega —, é esta consulta que descobre o pagamento e destrava
   * o cliente sozinho.
   */
  async findByOrder(orderId: string) {
    const payments = await prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });

    const pending = payments.find((payment) => payment.status === "PENDING");
    if (pending) await this.syncWithGateway(pending.id);

    return prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  }

  /**
   * Confere no Mercado Pago um pagamento pendente.
   *
   * Só pergunta se faz sentido perguntar: consultar a cada 5 segundos por
   * cliente com a tela aberta estouraria o limite de requisições deles sem
   * necessidade — e a marca de "consultado" é gravada antes da chamada, para
   * o intervalo valer também quando o Mercado Pago está falhando. Pix vencido
   * é perguntado uma última vez antes de virar recusado: pago no último minuto
   * e com o aviso perdido, ele seria dado como não pago com o dinheiro na conta.
   *
   * Devolve se a consulta aconteceu.
   */
  private async syncWithGateway(paymentId: string): Promise<boolean> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== "PENDING" || !payment.externalReference) return false;

    const recentlySynced =
      payment.syncedAt && Date.now() - payment.syncedAt.getTime() < SYNC_INTERVAL_MS;
    if (recentlySynced) return false;
    await prisma.payment.update({ where: { id: payment.id }, data: { syncedAt: new Date() } });

    let resultado: DecisaoConsolidada;
    try {
      resultado = await this.conferirNoProvedor(payment);
    } catch (error) {
      // Consulta ativa é rede de segurança, não caminho principal: se o
      // Mercado Pago estiver fora do ar, a cobrança espera a próxima consulta
      // em vez de mostrar erro — e nem o Pix vencido é dado como recusado.
      this.logger.warn(`Não foi possível consultar o pagamento ${payment.id} no Mercado Pago: ${error}`);
      return false;
    }
    if (resultado.acao === "LIQUIDAR") {
      this.logger.log(`Pagamento ${payment.id} confirmado por consulta ativa.`);
      return true;
    }

    // Vencido sem pagamento lá vira recusado. Com alerta (aprovado com outro
    // valor, contestado) fica como está: alerta não muda nada, e a
    // conciliação mostra o caso.
    const expired = payment.expiresAt && payment.expiresAt.getTime() < Date.now();
    if (expired && resultado.acao === "NADA" && resultado.alertas.length === 0) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
    }
    return true;
  }

  /**
   * Consulta a cobrança no Mercado Pago e aplica a conferência.
   *
   * Pix: pelo id do Pix gravado na criação — o pagamento exato, não "algum
   * pagamento com esta referência". Cartão: pela referência, porque o id só
   * existe depois de pagar; cada resultado passa pela mesma conferência.
   *
   * Falha de comunicação sobe como exceção: quem chama decide se espera.
   */
  private async conferirNoProvedor(cobranca: Payment): Promise<DecisaoConsolidada> {
    const encontrados = await this.consultarCobranca(cobranca);
    await prisma.payment.update({ where: { id: cobranca.id }, data: { syncedAt: new Date() } });
    return this.aplicarDecisoes(cobranca, encontrados);
  }

  private async consultarCobranca(cobranca: Payment): Promise<PagamentoNoProvedor[]> {
    if (!cobranca.externalReference) return [];
    if (cobranca.method === "PIX") {
      const achado = await this.gateway.consultarPagamento(cobranca.externalReference);
      return achado ? [achado] : [];
    }
    return this.gateway.buscarPorReferencia(cobranca.id);
  }

  /**
   * Confere os pagamentos do provedor contra a cobrança e aplica o resultado.
   *
   * Uma aprovação conferida liquida, mesmo com outras tentativas recusadas na
   * mesma referência (cartão); recusa só quando todas recusam. Alerta nunca
   * muda nada: vai para o log, sem valores, e aparece na conciliação — e é
   * registrado mesmo quando outra tentativa liquida.
   */
  private async aplicarDecisoes(
    cobranca: Payment,
    noProvedor: readonly PagamentoNoProvedor[],
  ): Promise<DecisaoConsolidada> {
    const resultado = consolidarDecisoes(
      noProvedor.map((p) => decidirPeloProvedor(paraConferir(cobranca), p, { producao: emProducao() })),
    );
    for (const motivo of resultado.alertas) {
      this.logger.warn(
        `Pagamento ${cobranca.id}: ${TEXTO_DO_ALERTA[motivo]}. Nada foi alterado por isso; confira na conciliação do Mercado Pago.`,
      );
    }
    if (resultado.acao === "LIQUIDAR") await this.settle(cobranca.id, "PAID");
    else if (resultado.acao === "RECUSAR") await this.settle(cobranca.id, "FAILED");
    return resultado;
  }

  /**
   * Rede de segurança para aviso perdido: confere, sem ninguém pedir, as
   * cobranças online das últimas 48 horas que ainda estão pendentes, e as
   * vencidas que ainda não foram conferidas depois de vencer.
   *
   * É o que permite a assinatura do webhook ser estrita: uma notificação
   * verdadeira recusada (janela, troca de segredo) não deixa um pagamento
   * para trás — no máximo, ele é registrado alguns minutos depois.
   *
   * Rodízio pela última consulta: a menos conferida vai primeiro, e um
   * acúmulo de cobranças abandonadas não impede as recentes de serem vistas.
   */
  async conferirPendentes(): Promise<number> {
    if (this.conferindo) return 0;
    this.conferindo = true;
    try {
      const agora = new Date();
      const desde = new Date(agora.getTime() - IDADE_MAXIMA_DA_CONFERENCIA_MS);
      const aindaNaoConferidaDepoisDeVencer = {
        expiresAt: { not: null, lt: agora },
        OR: [{ syncedAt: null }, { syncedAt: { lte: prisma.payment.fields.expiresAt } }],
      };
      const daVez = await prisma.payment.findMany({
        where: {
          externalReference: { not: null },
          createdAt: { gte: desde },
          OR: [
            // Pendente: o cartão (sem validade) e o Pix ainda válido, sempre;
            // o Pix vencido, uma última vez.
            { status: "PENDING", OR: [{ expiresAt: null }, { expiresAt: { gte: agora } }] },
            { status: "PENDING", ...aindaNaoConferidaDepoisDeVencer },
            // Recusada por vencimento, mas talvez paga no último minuto.
            { status: "FAILED", ...aindaNaoConferidaDepoisDeVencer },
          ],
        },
        orderBy: [{ syncedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        take: COBRANCAS_POR_RODADA,
      });

      let conferidas = 0;
      for (const cobranca of daVez) {
        try {
          if (cobranca.status === "PENDING") {
            if (await this.syncWithGateway(cobranca.id)) conferidas += 1;
          } else {
            await this.conferirNoProvedor(cobranca);
            conferidas += 1;
          }
        } catch (error) {
          this.logger.warn(`Conferência periódica: não foi possível conferir ${cobranca.id}: ${error}`);
        }
      }
      return conferidas;
    } finally {
      this.conferindo = false;
    }
  }

  /**
   * Gera — ou reaproveita — o Pix de um pagamento.
   *
   * Reaproveitar é a parte que importa: criar um Pix novo a cada chamada
   * deixaria dois QR válidos ao mesmo tempo para a mesma cobrança, e o
   * cliente poderia pagar duas vezes. Só quando o anterior venceu é que um
   * novo é gerado no lugar dele.
   */
  async createCheckout(eventId: string, input: CreateCheckoutBody, payerEmail: string) {
    const order = await prisma.order.findUnique({
      where: { eventId },
      include: { payments: true, event: { include: { user: true } }, reservation: { select: { status: true } } },
    });
    if (!order) throw new NotFoundException("Orçamento do evento não encontrado.");
    // Reserva cancelada não gera cobrança nova: um Pix de uma festa que não
    // existe mais seria dinheiro entrando sem destino.
    if (order.status === "CANCELLED" || (order.reservation && ENCERRADAS.includes(order.reservation.status))) {
      throw new ConflictException("Esta reserva foi cancelada. Não há pagamento a gerar.");
    }
    if (!order.kitId) {
      throw new ConflictException("Selecione um kit antes de gerar o pagamento.");
    }
    if (order.payments.some((p) => p.type === input.type && p.status === "PAID")) {
      throw new ConflictException("Este pagamento já foi realizado.");
    }

    const now = Date.now();
    const reusable = order.payments.find(
      (p) =>
        p.type === input.type &&
        p.status === "PENDING" &&
        p.pixQrCode &&
        (!p.expiresAt || p.expiresAt.getTime() > now),
    );
    if (reusable) return reusable;

    // Pendentes vencidos saem do caminho para não confundirem a tela nem a
    // conferência da Maria Luiza com QR que ninguém mais consegue pagar.
    const stale = order.payments.filter(
      (p) => p.type === input.type && p.status === "PENDING" && p.expiresAt && p.expiresAt.getTime() <= now,
    );
    if (stale.length > 0) {
      await prisma.payment.updateMany({
        where: { id: { in: stale.map((p) => p.id) } },
        data: { status: "FAILED" },
      });
    }

    const amount = valorACobrar(
      input.type,
      Number(order.total),
      order.payments.filter((p) => p.status === "PAID").map((p) => Number(p.amount)),
    );

    if (amount <= 0) {
      throw new ConflictException("Esta festa já está paga integralmente.");
    }
    const expiresAt = new Date(now + PIX_EXPIRATION_MINUTES * 60_000);

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        type: input.type,
        method: input.method,
        amount,
        status: "PENDING",
        expiresAt: input.method === "PIX" ? expiresAt : null,
      },
    });

    let checkout;
    try {
      const [firstName, ...restOfName] = (order.event.user.name ?? "").trim().split(/\s+/);
      checkout = await this.gateway.createCheckout({
        paymentId: payment.id,
        amount,
        description: `${PAYMENT_TYPE_LABEL[input.type]} — Festaê`,
        payerEmail,
        payerFirstName: firstName || undefined,
        payerLastName: restOfName.join(" ") || undefined,
        method: input.method,
        expiresAt: input.method === "PIX" ? expiresAt : undefined,
      });
    } catch (error) {
      // Não deixa um registro PENDING órfão (sem checkout de verdade) toda
      // vez que o gateway falha — ele nunca vai virar um pagamento real.
      await prisma.payment.delete({ where: { id: payment.id } });
      throw error;
    }

    return prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalReference: checkout.externalReference,
        checkoutUrl: checkout.checkoutUrl,
        pixQrCode: checkout.pixQrCode,
        pixQrCodeBase64: checkout.pixQrCodeBase64,
      },
    });
  }

  /**
   * Grava o resultado de um pagamento e, se for o sinal, confirma a reserva.
   *
   * A data já foi conferida contra a capacidade do dia quando a reserva foi
   * solicitada, então não há decisão humana pendente: quem pagou o sinal tem
   * a data. Deixar a pessoa pagando e esperando resposta é justamente o que
   * se quis eliminar.
   *
   * Roda sob a trava do pedido — a mesma do cancelamento e do registro
   * manual. Isso decide, sem ambiguidade, de que lado do cancelamento o
   * pagamento caiu: confirmado antes, o cancelamento o enxerga e ele entra no
   * tratamento; confirmado depois, a reserva já está cancelada aqui dentro e
   * ele vira "pagamento após o cancelamento", com pendência explícita. Em
   * nenhum dos dois casos o dinheiro some ou é contado duas vezes.
   */
  async settle(paymentId: string, status: "PAID" | "FAILED" | "PENDING") {
    const alvo = await prisma.payment.findUnique({ where: { id: paymentId }, select: { orderId: true } });
    if (!alvo) return;

    const registro = await prisma.$transaction(async (tx) => {
      await travarPedido(tx, alvo.orderId);

      // Relido sob a trava: o webhook repetido e a consulta ativa podem ter
      // chegado juntos, e o cancelamento pode ter acabado de gravar.
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: { include: { reservation: true } } },
      });
      // Pago não se liquida de novo; anulado foi decisão humana registrada e
      // não volta sozinho (a conferência transforma isso em alerta).
      if (!payment || payment.status === "PAID" || payment.status === "ANULADO") return null;

      const reserva = payment.order.reservation;
      const confirmsReservation =
        status === "PAID" &&
        reserva !== null &&
        confirmaAReserva(reserva.status as ReservationStatus, payment.type === "DEPOSIT" ? "SINAL" : "SALDO");
      const aposCancelamento = status === "PAID" && reserva !== null && ENCERRADAS.includes(reserva.status);

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status,
          paidAt: status === "PAID" ? new Date() : payment.paidAt,
          syncedAt: new Date(),
        },
      });

      if (confirmsReservation) {
        await tx.reservation.update({
          where: { id: reserva!.id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        await tx.order.update({ where: { id: payment.orderId }, data: { status: "CONFIRMED" } });
      }

      // Dinheiro que entrou numa festa cancelada: fica registrado como pago
      // e ganha a pendência que pede o tratamento complementar.
      if (aposCancelamento) {
        await tx.pagamentoAposCancelamento.create({
          data: { paymentId: payment.id, reservationId: reserva!.id, valor: payment.amount },
        });
      }

      // O último degrau do funil só pode ser registrado aqui: é o Mercado
      // Pago que diz que o dinheiro entrou, não o aplicativo. Sem isto o
      // relatório terminava sempre em zero pagamentos — a única linha que
      // realmente responde se a loja vende.
      if (status === "PAID") {
        await tx.analyticsEvent.create({
          data: {
            type: "PAGAMENTO_REALIZADO",
            metadata: {
              paymentId: payment.id,
              orderId: payment.orderId,
              tipo: payment.type,
              valor: payment.amount.toString(),
            },
          },
        });
      }

      return { payment, reserva, aposCancelamento, confirmsReservation };
    });

    if (registro?.aposCancelamento) {
      this.logger.warn(
        `Pagamento ${registro.payment.id} confirmado com a ` +
          `reserva ${registro.reserva!.id} já cancelada: registrado como pago, com tratamento financeiro pendente.`,
      );
    } else if (
      registro &&
      status === "PAID" &&
      registro.payment.type === "DEPOSIT" &&
      !registro.confirmsReservation
    ) {
      this.logger.warn(
        `Sinal do pagamento ${registro.payment.id} chegou com a reserva em ${registro.reserva?.status ?? "nenhuma"}. Confira no painel.`,
      );
    }
  }

  /**
   * Encerra as cobranças ainda pendentes de uma reserva que acabou de ser
   * cancelada.
   *
   * Roda depois que o cancelamento foi gravado — nunca antes: cancelar o Pix
   * da cliente e depois descobrir que a reserva não pôde ser cancelada
   * deixaria uma festa de pé sem como pagar.
   *
   * - Cobrança que só existe aqui (lançada à mão, sem Pix no provedor) ou Pix
   *   já vencido: não há o que pagar; é encerrada aqui.
   * - Pix vivo no Mercado Pago: cancelado lá, pela API real. Se o provedor
   *   disser que ele já foi pago, o pagamento é registrado agora — e, como a
   *   reserva já está cancelada, entra como pagamento após o cancelamento.
   * - Não deu para confirmar no provedor: fica como está, e a resposta diz
   *   isso. Se for pago depois, cai no mesmo caminho do pagamento tardio.
   */
  async encerrarCobrancasPendentes(orderId: string): Promise<EncerramentoDeCobrancas> {
    const pendentes = await prisma.payment.findMany({
      where: { orderId, status: "PENDING" },
      select: { id: true, method: true, externalReference: true, expiresAt: true },
    });
    const resultado: EncerramentoDeCobrancas = { encerradas: 0, jaPagas: 0, naoEncerradas: 0 };
    const agora = Date.now();

    for (const p of pendentes) {
      const soAqui = !p.externalReference;
      const vencido = p.expiresAt !== null && p.expiresAt.getTime() <= agora;
      if (soAqui || vencido) {
        // `status: "PENDING"` no filtro: nada aqui reescreve um pagamento que
        // o webhook acabou de confirmar.
        const { count } = await prisma.payment.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        resultado.encerradas += count;
        continue;
      }
      if (p.method !== "PIX") {
        resultado.naoEncerradas += 1;
        continue;
      }

      const noProvedor = await this.gateway.cancelar(p.externalReference!);
      if (noProvedor === "ENCERRADA") {
        const { count } = await prisma.payment.updateMany({
          where: { id: p.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        resultado.encerradas += count;
      } else if (noProvedor === "JA_PAGA") {
        // "Já paga" diz só o status: o registro passa pela mesma conferência
        // de id e valor que o webhook. Divergência fica como não encerrada.
        const cobranca = await prisma.payment.findUnique({ where: { id: p.id } });
        const conferida = cobranca
          ? await this.conferirNoProvedor(cobranca).catch((error) => {
              this.logger.warn(`Pagamento ${p.id}: pago no Mercado Pago, mas não foi possível conferir agora: ${error}`);
              return null;
            })
          : null;
        if (conferida?.acao === "LIQUIDAR") resultado.jaPagas += 1;
        else resultado.naoEncerradas += 1;
      } else {
        resultado.naoEncerradas += 1;
      }
    }

    if (pendentes.length > 0) {
      this.logger.log(
        `Cobranças pendentes do pedido ${orderId} após o cancelamento: ${resultado.encerradas} encerrada(s), ` +
          `${resultado.jaPagas} já paga(s), ${resultado.naoEncerradas} sem confirmação do provedor.`,
      );
    }
    return resultado;
  }

  /**
   * Notificação do Mercado Pago, já autenticada no controller.
   *
   * Recebe só o id que foi assinado. O corpo da notificação não decide nada:
   * o pagamento é buscado na API pelo id e conferido contra a cobrança antes
   * de qualquer gravação. Falha na API sobe como exceção (500), e o Mercado
   * Pago reenvia.
   */
  async processarNotificacao(idNoProvedor: string): Promise<void> {
    const noProvedor = await this.gateway.consultarPagamento(idNoProvedor);
    if (!noProvedor?.referencia) return;

    const cobranca = await prisma.payment.findUnique({ where: { id: noProvedor.referencia } });
    if (!cobranca) return;

    // Pix: decide pelo pagamento notificado — se não for o Pix da cobrança, é
    // alerta. Cartão: uma tentativa recusada não decide sozinha enquanto a
    // cliente tenta de novo; todas as tentativas da referência entram juntas.
    const pagamentos = cobranca.method === "PIX" ? [noProvedor] : await this.tentativasDoCartao(cobranca, noProvedor);
    await this.aplicarDecisoes(cobranca, pagamentos);
  }

  private async tentativasDoCartao(cobranca: Payment, notificado: PagamentoNoProvedor) {
    const todas = await this.gateway.buscarPorReferencia(cobranca.id);
    return todas.some((p) => p.id === notificado.id) ? todas : [...todas, notificado];
  }

  /**
   * Confere uma cobrança no Mercado Pago a pedido da administração.
   *
   * Mesmo caminho e mesma conferência do webhook: registra o que estiver
   * aprovado e conferido, e não muda nada no que divergir.
   */
  async conferirCobranca(pagamentoId: string) {
    const cobranca = await prisma.payment.findUnique({ where: { id: pagamentoId } });
    if (!cobranca) throw new NotFoundException("Pagamento não encontrado.");
    if (!cobranca.externalReference) {
      throw new ConflictException("Este pagamento não foi feito pelo Mercado Pago.");
    }
    const resultado = await this.conferirNoProvedor(cobranca);
    const depois = await prisma.payment.findUniqueOrThrow({ where: { id: pagamentoId }, select: { status: true } });
    return { resultado: resultado.acao, alertas: resultado.alertas, status: depois.status };
  }

  /**
   * Conciliação com o Mercado Pago: só leitura.
   *
   * Para cada cobrança online do período — recebida, pendente ou recusada —,
   * diz se o que está aqui bate com o que está lá: valor, situação, estorno,
   * contestação. Não grava nada; registrar um pagamento encontrado é outra
   * ação (`conferirCobranca`), com a mesma conferência do webhook.
   */
  async conciliar(dias: number): Promise<{
    de: string;
    ate: string;
    total: number;
    limitado: boolean;
    itens: ItemDaConciliacao[];
  }> {
    const agora = new Date();
    const desde = new Date(agora.getTime() - dias * 24 * 60 * 60_000);
    const cobrancas = await prisma.payment.findMany({
      where: {
        externalReference: { not: null },
        OR: [
          { status: "PAID", paidAt: { gte: desde } },
          // Recebido sem data de recebimento não some da conferência.
          { status: "PAID", paidAt: null, createdAt: { gte: desde } },
          { status: { in: ["PENDING", "FAILED", "ANULADO"] }, createdAt: { gte: desde } },
        ],
      },
      include: { order: { select: { reservation: { select: { id: true, contractSeq: true } } } } },
      orderBy: { createdAt: "desc" },
      take: COBRANCAS_POR_CONCILIACAO + 1,
    });
    const limitado = cobrancas.length > COBRANCAS_POR_CONCILIACAO;
    const lista = cobrancas.slice(0, COBRANCAS_POR_CONCILIACAO);

    const itens: ItemDaConciliacao[] = [];
    // Poucas por vez: o limite de requisições do Mercado Pago vale para a
    // conta inteira, inclusive para o checkout das clientes.
    for (let i = 0; i < lista.length; i += 4) {
      itens.push(...(await Promise.all(lista.slice(i, i + 4).map((c) => this.conciliarCobranca(c)))));
    }
    return { de: desde.toISOString(), ate: agora.toISOString(), total: itens.length, limitado, itens };
  }

  private async conciliarCobranca(
    c: Payment & { order: { reservation: { id: string; contractSeq: number } | null } },
  ): Promise<ItemDaConciliacao> {
    const base = {
      pagamentoId: c.id,
      reservaId: c.order.reservation?.id ?? null,
      contrato: c.order.reservation?.contractSeq ?? null,
      tipo: c.type,
      metodo: c.method,
      statusAqui: c.status,
      valorAqui: Number(c.amount),
      recebidoEm: c.paidAt?.toISOString() ?? null,
      criadoEm: c.createdAt.toISOString(),
    };
    let encontrados: PagamentoNoProvedor[];
    try {
      encontrados = await this.consultarCobranca(c);
    } catch {
      return { ...base, ...semProvedor(c), situacao: "ERRO_NA_CONSULTA" };
    }
    if (encontrados.length === 0) return { ...base, ...semProvedor(c), situacao: "NAO_ENCONTRADO" };

    const conferidos = encontrados.map((p) => ({
      p,
      d: decidirPeloProvedor(paraConferir(c), p, { producao: emProducao() }),
    }));
    const consolidado = consolidarDecisoes(conferidos.map((x) => x.d));
    const alerta = PRIORIDADE_DOS_ALERTAS.find((m) => consolidado.alertas.includes(m));
    const situacao: SituacaoNaConciliacao = alerta
      ? alerta
      : consolidado.acao === "LIQUIDAR"
        ? "PAGO_NAO_REGISTRADO"
        : consolidado.confere
          ? "CONFERE"
          : "SEM_PAGAMENTO";
    // O pagamento mostrado é o que explica a situação.
    const mostrado =
      (alerta && conferidos.find((x) => x.d.acao === "ALERTA" && x.d.motivo === alerta)) ||
      conferidos.find((x) => x.d.acao === "LIQUIDAR" || x.d.acao === "CONFERE") ||
      conferidos[0];
    const { p } = mostrado;
    return {
      ...base,
      idNoProvedor: p.id,
      statusNoProvedor: p.status,
      valorNoProvedor: p.valor,
      valorEstornado: p.valorEstornado,
      situacao,
    };
  }
}

/** Quando há mais de um alerta, o que aparece é o mais grave. */
const PRIORIDADE_DOS_ALERTAS: MotivoDoAlerta[] = [
  "ESTORNO_NO_PROVEDOR",
  "CONTESTACAO_NO_PROVEDOR",
  "VALOR_DIVERGENTE",
  "NAO_APROVADO_NO_PROVEDOR",
  "ID_DIVERGENTE",
  "REFERENCIA_DIVERGENTE",
  "MOEDA_DIVERGENTE",
  "PAGAMENTO_DE_TESTE",
  "COBRANCA_ANULADA",
];

function semProvedor(c: Payment) {
  return {
    idNoProvedor: c.method === "PIX" ? c.externalReference : null,
    statusNoProvedor: null,
    valorNoProvedor: null,
    valorEstornado: null,
  };
}
