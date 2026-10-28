import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  confirmaAReserva as confirmaPorLiquidacao,
  creditoAplicadoNaReserva,
  diaDaFesta,
  diaEmChapeco,
  formatarDiaDoMomento,
  pendenteDeTratamento,
  podeAguardarDevolucao,
  reembolsoPendente,
  fromCentsInt,
  motivoDeRecusaDaDistribuicao,
  normalizarDataDaFesta,
  saldoAPagar,
  toCentsInt,
} from "@festae/shared";
import type {
  CancelarReservaInput,
  CorrigirPagamentoInput,
  CreateReservationInput,
  RegistrarReembolsoInput,
  ReservationStatus,
  TratarPagamentoTardioInput,
  UpdateReservationStatusInput,
} from "@festae/shared";
import {
  creditoAplicadoEmCentavos,
  pagoEmCentavos,
  travarCredito,
  travarPedido,
} from "../creditos/ledger";
import { AvailabilityService } from "../availability/availability.service";
import { PaymentsService } from "../payments/payments.service";
import { itensDoKitDoPedido, mensagemDeConflito } from "../availability/item-commitment";
import { registrarConflitosDeAcervo } from "../availability/registro-de-conflitos";
import { pendentesAEncerrar } from "./encerrar-pendencias";
import { decidirCorrecao } from "./correcao-de-pagamento";
import { referenciaVisual, type ReferenciaVisual } from "./referencia-visual";

/**
 * O que a tela de reservas precisa saber do crédito Festaê e do cancelamento.
 *
 * Os movimentos de utilização dão o crédito aplicado; o crédito gerado dá o
 * voucher; o tratamento diz o que foi feito com o dinheiro da cancelada.
 */
/** O registro de uma devolução feita, como a tela o mostra. */
const SELECAO_DO_REEMBOLSO = {
  valor: true,
  realizadoEm: true,
  forma: true,
  observacao: true,
  registradoEm: true,
  registradoPor: { select: { name: true } },
} as const;

const INCLUSAO_DO_CREDITO = {
  creditosUtilizados: { select: { valor: true } },
  creditosGerados: {
    where: { tipo: "CREDITO_GERADO_CANCELAMENTO" as const },
    select: { id: true, numero: true, valor: true, createdAt: true },
    orderBy: { numero: "asc" as const },
  },
  pagamentosAposCancelamento: {
    select: { id: true, valor: true, registradoEm: true, tratamentoComplementarId: true },
    orderBy: { registradoEm: "asc" as const },
  },
  tratamentosComplementares: {
    select: {
      id: true,
      observacao: true,
      recebido: true,
      creditoGerado: true,
      reembolsado: true,
      retido: true,
      definidoEm: true,
      createdBy: { select: { name: true } },
      reembolsoRealizado: { select: SELECAO_DO_REEMBOLSO },
    },
    orderBy: { definidoEm: "asc" as const },
  },
  tratamentoDoCancelamento: {
    select: {
      id: true,
      motivo: true,
      contratado: true,
      recebido: true,
      creditoAplicadoDevolvido: true,
      creditoGerado: true,
      reembolsado: true,
      retido: true,
      definidoEm: true,
      createdBy: { select: { name: true } },
      reembolsoRealizado: { select: SELECAO_DO_REEMBOLSO },
    },
  },
  cancelledBy: { select: { name: true } },
};

/** Saldo de crédito por cliente — de todas, ou de uma só. */
async function saldosDeCredito(userId?: string): Promise<Map<string, number>> {
  const grupos = await prisma.creditoClienteMovimento.groupBy({
    by: ["userId"],
    ...(userId ? { where: { userId } } : {}),
    _sum: { valor: true },
  });
  return new Map(grupos.map((g) => [g.userId, Number(g._sum.valor ?? 0)]));
}

/**
 * A reserva com os números de crédito já somados.
 *
 * O painel recebe `creditoAplicado` pronto, em vez de somar movimentos: é a
 * mesma regra de @festae/shared que o Financeiro usa, e uma segunda soma na
 * tela seria a cópia que envelhece errado.
 */
function comCredito<
  T extends {
    creditosUtilizados: { valor: unknown }[];
    pagamentosAposCancelamento: { valor: unknown; tratamentoComplementarId: string | null }[];
    tratamentoDoCancelamento: { reembolsado: unknown; reembolsoRealizado: unknown } | null;
    tratamentosComplementares: { reembolsado: unknown; reembolsoRealizado: unknown }[];
    order: { event: { userId: string } };
  },
>(reserva: T, saldos: Map<string, number>) {
  const tratamentos = [
    ...(reserva.tratamentoDoCancelamento ? [reserva.tratamentoDoCancelamento] : []),
    ...reserva.tratamentosComplementares,
  ];
  return {
    ...reserva,
    creditoAplicado: creditoAplicadoNaReserva(
      reserva.creditosUtilizados.map((m) => ({ valor: Number(m.valor) })),
    ),
    creditoDisponivelDaCliente: saldos.get(reserva.order.event.userId) ?? 0,
    // Reembolso destinado à cliente e ainda não registrado como feito.
    reembolsoPendente: reembolsoPendente(
      tratamentos.map((t) => ({ reembolsado: Number(t.reembolsado), realizado: t.reembolsoRealizado !== null })),
    ),
    // Pagamento recebido depois do cancelamento que ainda não tem destino.
    tratamentoPendente: pendenteDeTratamento(
      reserva.pagamentosAposCancelamento.map((p) => ({
        valor: Number(p.valor),
        tratado: p.tratamentoComplementarId !== null,
      })),
    ),
  };
}

/** Estados de que a reserva não volta pelo seletor de etapa. */
const MORTAS = ["CANCELLED", "REJECTED"];

/**
 * O dia de uma devolução que já foi feita, ou nulo quando não foi.
 *
 * Dia de calendário, ancorado ao meio-dia UTC como o dia de um pagamento.
 * Nunca no futuro: registrar como feito um reembolso de amanhã tiraria do
 * caixa hoje um dinheiro que ainda está nele — para o que ainda vai
 * acontecer existe o reembolso a realizar.
 */
function diaDoReembolsoJaFeito(dia: string | undefined): Date | null {
  if (!dia) return null;
  if (dia > diaEmChapeco(new Date())) {
    throw new BadRequestException(
      "Um reembolso no futuro ainda não foi feito. Deixe-o como reembolso a realizar e registre quando a devolução acontecer.",
    );
  }
  return normalizarDataDaFesta(dia);
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly availability: AvailabilityService,
    private readonly payments: PaymentsService,
  ) {}

  async requestReservation(eventId: string, input: CreateReservationInput) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        order: {
          include: {
            reservation: true,
            kit: { include: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });
    if (!event || !event.order) throw new NotFoundException("Orçamento do evento não encontrado.");
    if (!event.order.kitId) {
      throw new BadRequestException("Selecione um kit antes de solicitar a reserva.");
    }
    if (event.order.reservation) {
      throw new ConflictException("Este evento já possui uma reserva solicitada.");
    }
    // Sem limite de festas por dia: a data só recusa por material. Duas
    // festas no mesmo dia podem ter escolhido o mesmo painel, e sem esta
    // conferência a Festaê receberia dois sinais por um item que ela tem um só.
    const conflitos = await this.availability.conflitosDeItens(event.date, {
      itensDoKit: event.order.kit?.products ?? [],
      itensAvulsos: event.order.items,
    });
    if (conflitos.length > 0) {
      await registrarConflitosDeAcervo(conflitos, event.date, "LOJA", event.order.id);
      throw new ConflictException(mensagemDeConflito(conflitos));
    }

    // O pedido vira reserva com a composição que acabou de ser conferida
    // congelada junto. É ela que a disponibilidade passa a ler daqui em
    // diante — mudar o kit no cadastro depois não mexe nesta festa.
    const itensDoKit = event.order.kit?.products ?? [];
    const [reservation] = await prisma.$transaction([
      prisma.reservation.create({
        data: {
          orderId: event.order.id,
          eventDate: event.date,
          notes: input.notes,
        },
      }),
      prisma.orderKitItem.deleteMany({ where: { orderId: event.order.id } }),
      prisma.orderKitItem.createMany({
        data: itensDoKit.map((i) => ({
          orderId: event.order!.id,
          productId: i.productId,
          quantity: i.quantity,
        })),
      }),
      prisma.order.update({
        where: { id: event.order.id },
        data: { status: "REQUESTED", kitCongeladoEm: new Date() },
      }),
    ]);

    return reservation;
  }

  /**
   * Tudo que a operação precisa para atender uma reserva, numa consulta só.
   *
   * A Maria Luiza abre o painel para responder quatro perguntas: quem é,
   * o que separo, quando e onde entrego, e quanto já recebi. Trazer os
   * itens, o telefone, a logística e os pagamentos junto é o que evita que
   * ela precise abrir outra tela — ou pedir a informação por WhatsApp.
   */
  async findAllAdmin() {
    const [reservas, saldos] = await Promise.all([
      prisma.reservation.findMany({
      include: {
        order: {
          include: {
            event: { include: { user: true, theme: true } },
            kit: { include: { products: { include: { product: true } } } },
            // O que foi vendido. A lista de separação usa isto quando existe;
            // o kit acima fica para pedido anterior ao congelamento.
            kitItems: { include: { product: true } },
            items: { include: { product: true } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
        ...INCLUSAO_DO_CREDITO,
      },
      orderBy: { eventDate: "asc" },
      }),
      saldosDeCredito(),
    ]);
    return reservas.map((r) => comCredito(r, saldos));
  }

  /**
   * As fotos da decoração que a cliente viu na proposta que virou esta
   * reserva (só a opção aprovada). Lido quando o detalhe é aberto: a lista
   * não carrega isto. Reserva sem proposta devolve a lista vazia.
   */
  async referenciaVisual(id: string): Promise<ReferenciaVisual> {
    const proposta = await prisma.orcamento.findUnique({
      where: { reservationId: id },
      select: {
        imagens: true,
        opcaoAprovadaId: true,
        opcaoAprovadaNome: true,
        opcoes: { orderBy: { ordem: "asc" }, select: { id: true, nome: true, imagens: true } },
      },
    });
    return referenciaVisual(proposta);
  }

  /**
   * Uma reserva só, com tudo que o formulário de edição precisa reabrir.
   *
   * Existe em vez de o painel baixar a lista inteira e procurar dentro:
   * a tela de edição costuma ser aberta do celular, e trazer todas as
   * reservas para preencher um formulário é dado que não se usa.
   */
  async findOneAdmin(id: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            event: { include: { user: true, theme: true } },
            kit: { include: { products: { include: { product: true } } } },
            // O que foi vendido. A lista de separação usa isto quando existe;
            // o kit acima fica para pedido anterior ao congelamento.
            kitItems: { include: { product: true } },
            items: { include: { product: true } },
            payments: { orderBy: { createdAt: "desc" }, include: { registradoPor: { select: { name: true } } } },
          },
        },
        ...INCLUSAO_DO_CREDITO,
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    // O histórico das correções de pagamento: o antes, o depois e o porquê.
    const alteracoesDePagamentos = await prisma.alteracaoFinanceira.findMany({
      where: { entidade: "PAGAMENTO", entidadeId: { in: reserva.order.payments.map((p) => p.id) } },
      orderBy: { criadoEm: "desc" },
      include: { usuario: { select: { name: true } } },
    });
    return {
      ...comCredito(reserva, await saldosDeCredito(reserva.order.event.userId)),
      alteracoesDePagamentos,
    };
  }

  /**
   * Registra dinheiro que entrou por fora do aplicativo.
   *
   * Acrescenta um pagamento; nunca reescreve um existente. Dinheiro que
   * entrou é sempre seguro de registrar — editar um pagamento antigo é como
   * se apaga uma divergência de caixa sem ninguém perceber.
   *
   * Duas consequências acompanham o registro do sinal, e são o motivo de
   * isto viver no servidor e não numa tela:
   *
   * 1. A reserva que estava só solicitada passa a confirmada. É o mesmo que
   *    acontece quando o Pix da loja é aprovado — quem pagou o sinal tem a
   *    data, e a origem do dinheiro não muda isso.
   *
   * 2. Pendências são encerradas, e a regra tem dois níveis:
   *
   *    - as do MESMO TIPO, sempre. A cliente pagou o sinal por outro
   *      caminho; deixar o QR antigo "aguardando" faria o painel cobrar de
   *      novo alguém que já pagou.
   *
   *    - TODAS as restantes, quando este pagamento quita o pedido. Sem isto,
   *      um sinal pendente sobrevivia a um pagamento registrado como saldo,
   *      porque os tipos não batiam — e o pedido ficava quitado com uma
   *      cobrança órfã pendurada. Um pedido pago não tem o que cobrar, seja
   *      qual for o tipo do lançamento que o pagou.
   *
   * Nada aqui toca um pagamento PAID. Dinheiro que entrou é registro
   * histórico: o filtro `status: "PENDING"` na atualização é a garantia de
   * que nenhum caminho deste método reescreve um recebimento.
   */
  async registrarPagamento(
    id: string,
    dados: { tipo: "DEPOSIT" | "BALANCE"; valor: number; forma: string; recebidoEm?: string },
    usuarioId: string,
  ) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, total: true, payments: true } },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Reative ou registre uma nova antes de lançar o pagamento.",
      );
    }

    // Meio-dia UTC pela mesma razão da data da festa: é dia de calendário, e
    // meia-noite viraria o dia anterior no fuso de Chapecó.
    const recebidoEm = dados.recebidoEm ? normalizarDataDaFesta(dados.recebidoEm) : new Date();
    if (recebidoEm.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException("A data do pagamento não pode estar no futuro.");
    }

    // A regra única de confirmação: sinal pago (de qualquer valor) confirma a
    // solicitada; saldo não. Ver `confirmaAReserva` em @festae/shared.
    const confirmaAReserva = confirmaPorLiquidacao(
      reserva.status as ReservationStatus,
      dados.tipo === "DEPOSIT" ? "SINAL" : "SALDO",
    );
    const orderId = reserva.order.id;
    const totalDoPedido = Number(reserva.order.total);

    /**
     * Tudo daqui para baixo roda sob lock do pedido.
     *
     * A conferência de saldo não pode ser feita fora da transação. Duas
     * requisições simultâneas — clique duplo, retry do navegador, duas abas —
     * leriam o mesmo "já pago", as duas achariam que cabe, e as duas
     * gravariam. Foi assim que um pedido de R$ 400,00 chegou a R$ 610,00 em
     * recebimentos num teste de concorrência.
     *
     * O `FOR UPDATE` na linha do pedido serializa por pedido: a segunda
     * requisição espera a primeira terminar e só então relê os pagamentos,
     * já enxergando o que a primeira gravou. Pedidos diferentes não esperam
     * uns pelos outros.
     */
    const apurado = await prisma.$transaction(async (tx) => {
      // 1. O lock. É a linha do pedido, e não a dos pagamentos, porque o que
      //    precisa ser serializado é a decisão sobre o saldo dele.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      // 2. Reler dentro do lock. A leitura de fora serviu para validar a
      //    reserva; para decidir sobre dinheiro, ela já pode estar velha.
      const pagamentos = await tx.payment.findMany({
        where: { orderId },
        select: { id: true, type: true, status: true, amount: true },
      });

      // 3. Saldo em centavos: comparar dinheiro em ponto flutuante deixa
      //    passar um centavo, e um centavo a mais é sobrepagamento igual.
      //    Crédito Festaê aplicado já cobre parte do pedido: o que falta é
      //    o total menos o pago menos o crédito.
      const pagoEmCentavos = pagamentos
        .filter((p) => p.status === "PAID")
        .reduce((soma, p) => soma + toCentsInt(Number(p.amount)), 0);
      const creditoEmCentavos = await creditoAplicadoEmCentavos(tx, id);
      const totalEmCentavos = toCentsInt(totalDoPedido);
      const saldoEmCentavos = totalEmCentavos - pagoEmCentavos - creditoEmCentavos;
      const valorEmCentavos = toCentsInt(dados.valor);

      // 4. Pedido quitado não recebe mais nada. A recusa diz os números, em
      //    vez de mandar a operação ir conferir em outra tela.
      if (saldoEmCentavos <= 0) {
        throw new ConflictException(
          `Este pedido já está quitado: R$ ${fromCentsInt(pagoEmCentavos).toFixed(2)} ` +
            `recebidos de R$ ${totalDoPedido.toFixed(2)}` +
            (creditoEmCentavos > 0
              ? `, mais R$ ${fromCentsInt(creditoEmCentavos).toFixed(2)} de crédito Festaê. `
              : ". ") +
            "Nenhum recebimento novo pode ser lançado.",
        );
      }

      // 5. Pagar mais que o saldo também é sobrepagamento.
      if (valorEmCentavos > saldoEmCentavos) {
        throw new ConflictException(
          `O valor excede o saldo deste pedido. Saldo disponível: ` +
            `R$ ${fromCentsInt(saldoEmCentavos).toFixed(2)}.`,
        );
      }

      // 6. Cabe. A partir daqui é escrita.
      const quita = valorEmCentavos >= saldoEmCentavos;
      const aEncerrar = pendentesAEncerrar(
        pagamentos,
        { tipo: dados.tipo, valor: dados.valor },
        // O crédito entra como se já tivesse sido pago: é o que faz o
        // pagamento que fecha o restante encerrar as cobranças pendentes.
        totalDoPedido,
        fromCentsInt(pagoEmCentavos + creditoEmCentavos),
      );

      await tx.payment.create({
        data: {
          orderId,
          type: dados.tipo,
          amount: dados.valor,
          method: dados.forma as never,
          status: "PAID",
          paidAt: recebidoEm,
          origem: "REGISTRO_MANUAL",
          registradoPorId: usuarioId,
        },
      });

      // 7. Quitar encerra o que restou pendente — a regra do 8a77a08.
      if (aEncerrar.length > 0) {
        await tx.payment.updateMany({
          // `status: "PENDING"` no filtro não é redundante nem sob lock: é a
          // garantia estrutural de que nenhum caminho deste método reescreve
          // um recebimento já registrado.
          where: { id: { in: aEncerrar }, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }

      if (confirmaAReserva) {
        await tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
      }

      // O funil só sabe que a loja vende quando o dinheiro entra. Pagamento
      // recebido por fora conta igual — senão o relatório subestima a
      // empresa justamente nas vendas fechadas na conversa.
      await tx.analyticsEvent.create({
        data: {
          type: "PAGAMENTO_REALIZADO",
          metadata: {
            orderId,
            tipo: dados.tipo,
            valor: String(dados.valor),
            registradoPor: usuarioId,
            manual: true,
          },
        },
      });

      return {
        pago: fromCentsInt(pagoEmCentavos + valorEmCentavos),
        credito: fromCentsInt(creditoEmCentavos),
        encerradas: aEncerrar.length,
        quita,
      };
    });

    this.logger.log(
      `Pagamento (${dados.tipo}) registrado por ${usuarioId} ` +
        `na reserva ${id}${confirmaAReserva ? " — reserva confirmada" : ""}.`,
    );

    return {
      registrado: true,
      total: totalDoPedido,
      pago: apurado.pago,
      saldo: saldoAPagar(totalDoPedido, apurado.pago + apurado.credito),
      reservaConfirmada: confirmaAReserva,
      pixPendentesEncerrados: apurado.encerradas,
      pedidoQuitado: apurado.quita,
    };
  }

  /**
   * Corrige um pagamento lançado à mão: valor, data, ou anulação.
   *
   * A exceção à regra "dinheiro que entrou não se reescreve" — e por isso
   * cercada: só ADMIN, só lançamento manual, nunca em reserva cancelada, sob
   * a trava do pedido, e sempre com o antes, o depois, quem e por quê em
   * `AlteracaoFinanceira`. Anular não apaga: o pagamento vira ANULADO e sai
   * de todas as contas (que só leem PAID), continuando visível com o motivo.
   *
   * A regra de decisão está em `correcao-de-pagamento.ts`, testada sozinha.
   */
  async corrigirPagamento(reservaId: string, pagamentoId: string, input: CorrigirPagamentoInput, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id: reservaId },
      select: {
        status: true,
        cancelledAt: true,
        order: { select: { id: true, total: true } },
        tratamentoDoCancelamento: { select: { id: true } },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    const orderId = reserva.order.id;

    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const pagamentos = await tx.payment.findMany({
        where: { orderId },
        select: {
          id: true,
          status: true,
          amount: true,
          paidAt: true,
          externalReference: true,
          aposCancelamento: { select: { id: true } },
        },
      });
      const pagamento = pagamentos.find((p) => p.id === pagamentoId);
      if (!pagamento) throw new NotFoundException("Pagamento não encontrado nesta reserva.");

      const decisao = decidirCorrecao(
        {
          pagamento: {
            status: pagamento.status,
            externalReference: pagamento.externalReference,
            aposCancelamento: pagamento.aposCancelamento !== null,
            valor: Number(pagamento.amount),
            recebidoEm: pagamento.paidAt,
          },
          reservaCancelada:
            reserva.status === "CANCELLED" ||
            reserva.status === "REJECTED" ||
            reserva.cancelledAt !== null ||
            reserva.tratamentoDoCancelamento !== null,
          outrosRecebidosEmCentavos: pagamentos
            .filter((p) => p.id !== pagamentoId && p.status === "PAID")
            .reduce((t, p) => t + toCentsInt(Number(p.amount)), 0),
          creditoEmCentavos: await creditoAplicadoEmCentavos(tx, reservaId),
          totalEmCentavos: toCentsInt(Number(reserva.order.total)),
          agora: new Date(),
        },
        input,
      );
      if (!decisao.ok) throw new ConflictException(decisao.erro);

      // `status: "PAID"` no filtro: duas correções simultâneas não anulam o
      // que a outra acabou de mudar — a trava acima já serializa, isto é a
      // garantia estrutural.
      const { count } = await tx.payment.updateMany({
        where: { id: pagamentoId, status: "PAID" },
        data: decisao.dados,
      });
      if (count === 0) throw new ConflictException("Este pagamento mudou enquanto a tela estava aberta. Recarregue.");

      await tx.alteracaoFinanceira.create({
        data: {
          entidade: "PAGAMENTO",
          entidadeId: pagamentoId,
          acao: decisao.acao,
          antes: decisao.antes as never,
          depois: decisao.depois as never,
          justificativa: input.justificativa,
          usuarioId,
        },
      });
      return decisao;
    });

    this.logger.log(`Pagamento ${pagamentoId} da reserva ${reservaId}: ${resultado.acao} por ${usuarioId}.`);
    return { corrigido: true, acao: resultado.acao, antes: resultado.antes, depois: resultado.depois };
  }

  /**
   * Cancela uma reserva, guardando o histórico e dizendo o que foi feito com
   * o dinheiro.
   *
   * Cancelar não apaga nada: a reserva continua no banco com status
   * CANCELLED, e com ela o pedido, os itens e os pagamentos. O que muda é o
   * efeito no presente — a data e o material voltam a ficar livres — e o
   * destino do que foi pago, que fica gravado num tratamento:
   *
   * - **o pago (só PAID) é distribuído por inteiro** entre crédito Festaê,
   *   reembolso e retenção. A soma tem de ser exatamente o pago, conferida
   *   sob trava contra o pago lido na hora — não contra o que a tela viu;
   *
   * - **o pagamento continua no caixa**, na data em que entrou. O reembolso
   *   é destino, não saída: fica "a realizar" até a Festaê devolver o dinheiro
   *   (por fora do sistema) e registrar que devolveu — só então sai do caixa,
   *   na data em que saiu. Se a devolução já foi feita, ela é registrada
   *   junto. A retenção é receita de retenção do mês do cancelamento, nunca
   *   faturamento de festa;
   *
   * - **crédito Festaê que estava aplicado volta sozinho** ao saldo da
   *   cliente, por um movimento próprio no extrato. A utilização original
   *   continua lá: o extrato mostra que foi usado e que voltou.
   *
   * Tudo numa transação: reserva cancelada sem tratamento, ou crédito gerado
   * sem reserva cancelada, é registro pela metade que ninguém encontra.
   *
   * Registra quem cancelou. Sem autoria, "por que essa data liberou?" é uma
   * pergunta sem resposta.
   */
  async cancelar(id: string, input: CancelarReservaInput, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        contractSeq: true,
        order: { select: { total: true, event: { select: { userId: true } } } },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (MORTAS.includes(reserva.status)) {
      throw new BadRequestException("Esta reserva já está cancelada.");
    }

    const reembolso = toCentsInt(input.reembolso);
    // Sem data, o reembolso fica a realizar. Com data, ele já foi feito.
    const reembolsadoEm = reembolso > 0 ? diaDoReembolsoJaFeito(input.reembolsadoEm) : null;

    const userId = reserva.order.event.userId;
    const resultado = await prisma.$transaction(
      async (tx) => {
        // Mesma ordem de travas de todo caminho que mexe em dinheiro do
        // pedido: o pedido primeiro, o crédito da cliente depois.
        await travarPedido(tx, reserva.orderId);
        const atual = await tx.reservation.findUniqueOrThrow({
          where: { id },
          select: { status: true, order: { select: { total: true } } },
        });
        if (MORTAS.includes(atual.status)) {
          throw new BadRequestException("Esta reserva já está cancelada.");
        }
        await travarCredito(tx, userId);

        const recebido = await pagoEmCentavos(tx, reserva.orderId);
        const recusa = motivoDeRecusaDaDistribuicao(fromCentsInt(recebido), {
          credito: input.credito,
          reembolso: input.reembolso,
          retencao: input.retencao,
        });
        if (recusa) {
          throw new ConflictException({
            message: recusa,
            codigo: "DISTRIBUICAO_INVALIDA",
            recebido: fromCentsInt(recebido),
          });
        }

        const creditoDevolvido = await creditoAplicadoEmCentavos(tx, id);
        const agora = new Date();

        await tx.reservation.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: agora, cancelledById: usuarioId },
        });
        await tx.order.update({ where: { id: reserva.orderId }, data: { status: "CANCELLED" } });

        if (creditoDevolvido > 0) {
          await tx.creditoClienteMovimento.create({
            data: {
              userId,
              tipo: "ESTORNO_CREDITO_POR_CANCELAMENTO",
              valor: fromCentsInt(creditoDevolvido),
              // Aponta para a reserva onde o crédito estava: o aplicado dela
              // volta a zero, e o extrato diz de onde o valor voltou.
              reservationDestinoId: id,
              observacao: `Reserva nº ${reserva.contractSeq} cancelada`,
              createdById: usuarioId,
            },
          });
        }

        const credito = toCentsInt(input.credito);
        const gerado =
          credito > 0
            ? await tx.creditoClienteMovimento.create({
                data: {
                  userId,
                  tipo: "CREDITO_GERADO_CANCELAMENTO",
                  valor: fromCentsInt(credito),
                  reservationOrigemId: id,
                  observacao: input.motivo,
                  createdById: usuarioId,
                },
                select: { id: true, numero: true, valor: true },
              })
            : null;

        const tratamento = await tx.tratamentoDeCancelamento.create({
          data: {
            reservationId: id,
            motivo: input.motivo,
            contratado: Number(atual.order.total),
            recebido: fromCentsInt(recebido),
            creditoAplicadoDevolvido: fromCentsInt(creditoDevolvido),
            creditoGerado: fromCentsInt(credito),
            reembolsado: fromCentsInt(reembolso),
            retido: fromCentsInt(toCentsInt(input.retencao)),
            definidoEm: agora,
            createdById: usuarioId,
          },
        });

        // Devolução que já aconteceu é registrada junto; senão, fica a realizar.
        if (reembolsadoEm) {
          await tx.reembolsoRealizado.create({
            data: {
              reservationId: id,
              tratamentoId: tratamento.id,
              valor: fromCentsInt(reembolso),
              realizadoEm: reembolsadoEm,
              forma: input.formaDoReembolso ?? "PIX",
              registradoPorId: usuarioId,
            },
          });
        }

        return {
          recebido: fromCentsInt(recebido),
          creditoDevolvido: fromCentsInt(creditoDevolvido),
          voucher: gerado ? { id: gerado.id, numero: gerado.numero, valor: Number(gerado.valor) } : null,
        };
      },
      { timeout: 15_000 },
    );

    this.logger.log(
      `Reserva ${id} cancelada por ${usuarioId}: ${tratamentoNoLog(input)}` +
        (resultado.creditoDevolvido > 0 ? "; crédito usado devolvido ao saldo." : "."),
    );

    // Depois de gravado, e só então, as cobranças que ficaram vivas são
    // encerradas — no Mercado Pago, quando existem lá. A que já tinha sido
    // paga é registrada agora e, com a reserva cancelada, vira pagamento após
    // o cancelamento, com pendência. Falha aqui não desfaz o cancelamento:
    // o que não encerrou fica dito na resposta.
    let cobrancas = { encerradas: 0, jaPagas: 0, naoEncerradas: 0 };
    try {
      cobrancas = await this.payments.encerrarCobrancasPendentes(reserva.orderId);
    } catch (error) {
      this.logger.error(`Falha ao encerrar cobranças da reserva ${id} cancelada: ${error}`);
      const restantes = await prisma.payment.count({ where: { orderId: reserva.orderId, status: "PENDING" } });
      cobrancas = { encerradas: 0, jaPagas: 0, naoEncerradas: restantes };
    }

    return {
      cancelada: true,
      clienteId: userId,
      ...resultado,
      cobrancas,
    };
  }

  /**
   * Dá destino a pagamentos recebidos depois do cancelamento.
   *
   * Não mexe no tratamento original: grava um tratamento complementar, com
   * autoria e data, para todo o valor tardio que está pendente agora. A
   * distribuição tem de ser exatamente esse valor — conferido sob a trava do
   * pedido, a mesma do registro de pagamento, para um Pix que caia durante
   * esta operação ficar pendente em vez de entrar pela metade.
   */
  async tratarPagamentoTardio(id: string, input: TratarPagamentoTardioInput, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        status: true,
        contractSeq: true,
        order: { select: { event: { select: { userId: true } } } },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (!MORTAS.includes(reserva.status)) {
      throw new BadRequestException("Só reserva cancelada tem pagamento após o cancelamento a tratar.");
    }

    // Sem data, o reembolso fica a realizar; com data, já foi feito.
    const reembolsadoEm = toCentsInt(input.reembolso) > 0 ? diaDoReembolsoJaFeito(input.reembolsadoEm) : null;

    const userId = reserva.order.event.userId;
    const resultado = await prisma.$transaction(
      async (tx) => {
        await travarPedido(tx, reserva.orderId);
        await travarCredito(tx, userId);

        const pendentes = await tx.pagamentoAposCancelamento.findMany({
          where: { reservationId: id, tratamentoComplementarId: null },
          select: { id: true, valor: true },
        });
        const pendente = pendentes.reduce((t, p) => t + toCentsInt(Number(p.valor)), 0);
        if (pendente === 0) {
          throw new ConflictException({
            message: "Não há pagamento recebido após o cancelamento aguardando tratamento.",
            codigo: "SEM_PENDENCIA",
          });
        }
        const recusa = motivoDeRecusaDaDistribuicao(fromCentsInt(pendente), {
          credito: input.credito,
          reembolso: input.reembolso,
          retencao: input.retencao,
        });
        if (recusa) {
          throw new ConflictException({ message: recusa, codigo: "DISTRIBUICAO_INVALIDA", recebido: fromCentsInt(pendente) });
        }

        const credito = toCentsInt(input.credito);
        const gerado =
          credito > 0
            ? await tx.creditoClienteMovimento.create({
                data: {
                  userId,
                  tipo: "CREDITO_GERADO_CANCELAMENTO",
                  valor: fromCentsInt(credito),
                  reservationOrigemId: id,
                  observacao: input.observacao?.trim() || "Pagamento recebido após o cancelamento",
                  createdById: usuarioId,
                },
                select: { id: true, numero: true, valor: true },
              })
            : null;

        const complementar = await tx.tratamentoComplementarDeCancelamento.create({
          data: {
            reservationId: id,
            observacao: input.observacao?.trim() || null,
            recebido: fromCentsInt(pendente),
            creditoGerado: fromCentsInt(credito),
            reembolsado: fromCentsInt(toCentsInt(input.reembolso)),
            retido: fromCentsInt(toCentsInt(input.retencao)),
            createdById: usuarioId,
            movimentoDeCreditoId: gerado?.id ?? null,
          },
        });

        if (reembolsadoEm) {
          await tx.reembolsoRealizado.create({
            data: {
              reservationId: id,
              tratamentoComplementarId: complementar.id,
              valor: fromCentsInt(toCentsInt(input.reembolso)),
              realizadoEm: reembolsadoEm,
              forma: input.formaDoReembolso ?? "PIX",
              registradoPorId: usuarioId,
            },
          });
        }

        // Liga cada pagamento tardio a este tratamento. O filtro de nulo e a
        // contagem garantem que nenhum valor é tratado duas vezes.
        const { count } = await tx.pagamentoAposCancelamento.updateMany({
          where: { id: { in: pendentes.map((p) => p.id) }, tratamentoComplementarId: null },
          data: { tratamentoComplementarId: complementar.id },
        });
        if (count !== pendentes.length) {
          throw new ConflictException({
            message: "Outro tratamento foi registrado ao mesmo tempo. Recarregue a reserva.",
            codigo: "TRATAMENTO_CONCORRENTE",
          });
        }

        return {
          valorTratado: fromCentsInt(pendente),
          voucher: gerado ? { id: gerado.id, numero: gerado.numero, valor: Number(gerado.valor) } : null,
        };
      },
      { timeout: 15_000 },
    );

    this.logger.log(
      `Pagamento após o cancelamento da reserva ${id} tratado por ${usuarioId}.`,
    );
    return { tratado: true, clienteId: userId, ...resultado };
  }

  /**
   * Registra uma devolução que a Festaê já fez.
   *
   * Não transfere dinheiro — o sistema não devolve nada pelo Mercado Pago nem
   * por banco algum. A Festaê faz o Pix ou a transferência por fora e diz
   * aqui o dia em que o dinheiro saiu; é esse registro que tira o valor do
   * caixa, naquele dia. Um registro por tratamento, sempre do valor inteiro
   * destinado a reembolso, nunca editado nem apagado: confirmar duas vezes
   * não pode tirar o dinheiro do caixa duas vezes.
   */
  async registrarReembolso(id: string, input: RegistrarReembolsoInput, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true, orderId: true, status: true },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (!MORTAS.includes(reserva.status)) {
      throw new BadRequestException("Só reserva cancelada tem reembolso a registrar.");
    }
    const realizadoEm = diaDoReembolsoJaFeito(input.realizadoEm)!;

    const registro = await prisma.$transaction(
      async (tx) => {
        // A mesma trava do pedido: duas confirmações ao mesmo tempo passam
        // uma de cada vez, e a segunda já encontra o reembolso registrado.
        await travarPedido(tx, reserva.orderId);

        const tratamento = input.tratamentoComplementarId
          ? await tx.tratamentoComplementarDeCancelamento.findFirst({
              where: { id: input.tratamentoComplementarId, reservationId: id },
              select: { id: true, reembolsado: true, definidoEm: true, reembolsoRealizado: { select: { id: true } } },
            })
          : await tx.tratamentoDeCancelamento.findUnique({
              where: { reservationId: id },
              select: { id: true, reembolsado: true, definidoEm: true, reembolsoRealizado: { select: { id: true } } },
            });
        if (!tratamento || toCentsInt(Number(tratamento.reembolsado)) <= 0) {
          throw new BadRequestException("Este tratamento não tem reembolso destinado à cliente.");
        }
        if (tratamento.reembolsoRealizado) {
          throw new ConflictException({
            message: "Este reembolso já foi registrado como realizado.",
            codigo: "REEMBOLSO_JA_REGISTRADO",
          });
        }
        // Ficou pendente no dia em que o tratamento foi definido: não pode
        // ter sido feito antes disso.
        if (input.realizadoEm < diaEmChapeco(tratamento.definidoEm)) {
          throw new BadRequestException(
            `O reembolso ficou pendente em ${formatarDiaDoMomento(tratamento.definidoEm)}: a data em que foi feito não pode ser anterior.`,
          );
        }

        return tx.reembolsoRealizado.create({
          data: {
            reservationId: id,
            ...(input.tratamentoComplementarId
              ? { tratamentoComplementarId: tratamento.id }
              : { tratamentoId: tratamento.id }),
            valor: tratamento.reembolsado,
            realizadoEm,
            forma: input.forma,
            observacao: input.observacao?.trim() || null,
            registradoPorId: usuarioId,
          },
          select: { id: true, valor: true, realizadoEm: true },
        });
      },
      { timeout: 15_000 },
    );

    this.logger.log(
      `Reembolso da reserva ${id} registrado como realizado em ${input.realizadoEm} por ${usuarioId}.`,
    );
    return { registrado: true, valor: Number(registro.valor), realizadoEm: registro.realizadoEm.toISOString() };
  }

  /**
   * Apaga de vez uma reserva de teste ou lançada por engano.
   *
   * Exclusão física, e não arquivamento, por uma razão concreta: um registro
   * "arquivado" precisaria ser filtrado na agenda, na conferência de estoque,
   * na lista de reservas, na tela de operação e no funil. Um filtro esquecido
   * em qualquer um desses lugares vira uma reserva invisível que continua
   * segurando uma data — exatamente a classe de defeito que este projeto já
   * passou meses corrigindo. Apagar resolve os cinco lugares de uma vez.
   *
   * É seguro porque o banco cascateia: apagar a festa leva junto pedido,
   * itens, pagamentos, reserva e tarefas, sem deixar órfão. Nenhuma outra
   * festa, cliente ou pagamento é tocado — cada festa tem o seu próprio
   * pedido, e não há registro compartilhado entre elas.
   *
   * A ficha do cliente só cai junto quando ela existe apenas por causa desta
   * reserva: sem senha (nunca foi uma conta de verdade) e sem outra festa. É
   * o que impede o painel de acumular clientes de teste órfãos.
   */
  async excluirDefinitivamente(id: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            payments: { select: { id: true, status: true, amount: true } },
            event: {
              select: {
                id: true,
                userId: true,
                user: { select: { id: true, name: true, passwordHash: true } },
              },
            },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");

    // Crédito Festaê e tratamento de cancelamento são o extrato de outra
    // pessoa e a explicação de dinheiro que entrou: apagar a reserva levaria
    // os dois junto (o banco recusaria, e a tela mostraria um erro mudo).
    const vinculos = await prisma.reservation.findUnique({
      where: { id },
      select: {
        tratamentoDoCancelamento: { select: { id: true } },
        _count: {
          select: { creditosGerados: true, creditosUtilizados: true, pagamentosAposCancelamento: true },
        },
      },
    });
    if (
      vinculos?.tratamentoDoCancelamento ||
      (vinculos?._count.creditosGerados ?? 0) > 0 ||
      (vinculos?._count.creditosUtilizados ?? 0) > 0 ||
      (vinculos?._count.pagamentosAposCancelamento ?? 0) > 0
    ) {
      throw new ConflictException({
        message:
          "Esta reserva tem crédito Festaê ou tratamento de cancelamento registrado, e não pode ser excluída: " +
          "isso apagaria o extrato da cliente e a explicação do dinheiro recebido.",
        codigo: "TEM_CREDITO_OU_TRATAMENTO",
      });
    }

    const evento = reserva.order.event;
    const pagos = reserva.order.payments.filter((p) => p.status === "PAID");

    const outrasFestas = await prisma.event.count({
      where: { userId: evento.userId, id: { not: evento.id } },
    });

    // Ficha criada só para esta reserva: some junto. Conta de verdade (tem
    // senha) ou cliente com outra festa ficam onde estão.
    const clienteFicaOrfao = outrasFestas === 0 && !evento.user.passwordHash;

    await prisma.$transaction(async (tx) => {
      // Apagar a festa cascateia para pedido, itens, pagamentos, reserva e
      // tarefas. Uma chamada só, sem chance de deixar metade para trás.
      await tx.event.delete({ where: { id: evento.id } });
      if (clienteFicaOrfao) {
        await tx.user.delete({ where: { id: evento.userId } });
      }
    });

    this.logger.warn(
      `Reserva ${id} EXCLUÍDA por ${usuarioId} — festa ${evento.id}, ` +
        `${pagos.length} pagamento(s) marcado(s) como pago apagado(s)` +
        `${clienteFicaOrfao ? `, ficha do cliente "${evento.user.name}" removida` : ""}.`,
    );

    return {
      excluida: true,
      pagamentosApagados: pagos.length,
      valorApagado: pagos.reduce((soma, p) => soma + Number(p.amount), 0),
      clienteRemovido: clienteFicaOrfao ? evento.user.name : null,
    };
  }

  /**
   * Muda a data de uma festa já reservada.
   *
   * A cliente que reservou para o dia 25 e pediu o 27 não tinha caminho no
   * painel: a operação teria que cancelar e lançar de novo, perdendo o
   * histórico, o pagamento e o checklist.
   *
   * A data nova passa pelas mesmas duas conferências de uma reserva nova —
   * cabe mais uma festa nesse dia? o material está livre? — porque remarcar
   * é ocupar uma data, e ocupar sem conferir é como se vendem duas festas
   * para o mesmo sábado.
   *
   * A própria reserva é ignorada nas duas contagens: ela não pode disputar
   * vaga nem material consigo mesma.
   *
   * Grava a data nos DOIS lugares onde ela vive. `Reservation.eventDate`
   * manda na agenda e no painel; `Event.date` é o que a cliente vê no app.
   * Mover só um deixaria a loja e a operação discordando sobre quando é a
   * festa — o pior desacordo possível.
   */
  async alterarData(id: string, novaDataISO: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            kitItems: { select: { productId: true, quantity: true } },
            // Só para pedido anterior ao congelamento: a remarcação continua
            // lendo o kit como sempre leu (sem produto desativado).
            kit: {
              select: {
                products: {
                  where: { product: { active: true } },
                  select: { productId: true, quantity: true },
                },
              },
            },
            items: { select: { productId: true, quantity: true } },
            event: { select: { id: true, date: true } },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Registre uma nova reserva para a data desejada.",
      );
    }

    let novaData: Date;
    try {
      novaData = normalizarDataDaFesta(novaDataISO);
    } catch {
      throw new BadRequestException("Data inválida.");
    }

    const mesmoDia = diaDaFesta(reserva.eventDate) === diaDaFesta(novaData);
    if (mesmoDia) {
      throw new BadRequestException("A festa já está marcada para esta data.");
    }

    // O que muda de dia é o que foi vendido — o congelado —, e não o kit como
    // está cadastrado hoje.
    const conflitos = await this.availability.conflitosDeItens(
      novaData,
      {
        itensDoKit: itensDoKitDoPedido(reserva.order),
        itensAvulsos: reserva.order.items,
      },
      reserva.order.id,
    );
    if (conflitos.length > 0) {
      await registrarConflitosDeAcervo(conflitos, novaData, "REAGENDAMENTO", id);
      throw new ConflictException({
        message: "Falta material na data nova.",
        conflitos: conflitos.map((c) => ({
          produto: c.nome,
          estoqueTotal: c.estoque,
          jaComprometido: c.jaComprometido,
          necessario: c.pedido,
          disponivel: Math.max(0, c.estoque - c.jaComprometido),
        })),
      });
    }

    const dataAnterior = reserva.eventDate;

    const [atualizada] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          eventDate: novaData,
          rescheduledAt: new Date(),
          // Guarda a primeira data, não a penúltima: se a festa for remarcada
          // duas vezes, o que interessa é de onde ela saiu originalmente.
          rescheduledFrom: reserva.rescheduledFrom ?? dataAnterior,
        },
      }),
      prisma.event.update({ where: { id: reserva.order.event.id }, data: { date: novaData } }),
    ]);

    this.logger.log(
      `Reserva ${id} remarcada por ${usuarioId}: ` +
        `${diaDaFesta(dataAnterior)} -> ${diaDaFesta(novaData)}.`,
    );

    return atualizada;
  }

  async updateStatus(id: string, input: UpdateReservationStatusInput) {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        tratamentoDoCancelamento: { select: { id: true } },
        _count: { select: { creditosUtilizados: true, pagamentosAposCancelamento: true } },
        order: {
          select: { payments: { where: { status: "PAID" }, select: { id: true } } },
        },
      },
    });
    if (!reservation) throw new NotFoundException("Reserva não encontrada.");

    // "Aguardando devolução" quer dizer que a festa aconteceu: só a partir do
    // dia dela. A tela já não oferece antes; o servidor garante.
    if (
      input.status === "AGUARDANDO_DEVOLUCAO" &&
      reservation.status !== "AGUARDANDO_DEVOLUCAO" &&
      !podeAguardarDevolucao(reservation.eventDate, new Date())
    ) {
      throw new BadRequestException(
        "Aguardando devolução vale a partir do dia da festa: é a festa que já aconteceu, com o material ainda fora.",
      );
    }

    // Cancelar passa sempre pelo cancelamento: é lá que ficam o motivo e o
    // destino do dinheiro. Pelo seletor, a reserva paga sairia da agenda sem
    // ninguém dizer o que foi feito com o sinal.
    if (input.status === "CANCELLED" && reservation.status !== "CANCELLED") {
      throw new BadRequestException(
        'Para cancelar, use "Cancelar reserva": é onde ficam o motivo e o que fazer com o valor pago.',
      );
    }
    // Recusar continua no seletor para a solicitação que nunca foi paga.
    // Com dinheiro ou crédito, a recusa vira cancelamento com tratamento.
    if (
      input.status === "REJECTED" &&
      reservation.status !== "REJECTED" &&
      (reservation.order.payments.length > 0 || reservation._count.creditosUtilizados > 0)
    ) {
      throw new BadRequestException(
        'Esta reserva tem pagamento ou crédito Festaê. Use "Cancelar reserva" para dizer o que fazer com esse valor.',
      );
    }
    // Cancelamento com tratamento não volta atrás pelo seletor: o crédito, o
    // reembolso e a retenção já foram registrados, e reativar deixaria a
    // festa de pé com o dinheiro dela distribuído.
    if (
      MORTAS.includes(reservation.status) &&
      !MORTAS.includes(input.status) &&
      (reservation.tratamentoDoCancelamento || reservation._count.pagamentosAposCancelamento > 0)
    ) {
      throw new BadRequestException(
        "Esta reserva foi cancelada com tratamento financeiro registrado. Para retomar a festa, registre uma nova reserva.",
      );
    }

    // PREPARING, READY, AGUARDANDO_DEVOLUCAO e COMPLETED são etapas
    // posteriores à confirmação: o pedido continua CONFIRMED e só a etapa
    // operacional avança.
    const orderStatus =
      input.status === "CONFIRMED" ||
      input.status === "PREPARING" ||
      input.status === "READY" ||
      input.status === "AGUARDANDO_DEVOLUCAO" ||
      input.status === "COMPLETED"
        ? ("CONFIRMED" as const)
        : input.status === "CANCELLED" || input.status === "REJECTED"
          ? ("CANCELLED" as const)
          : undefined;

    const [updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          status: input.status,
          confirmedAt: input.status === "CONFIRMED" ? new Date() : reservation.confirmedAt,
        },
      }),
      ...(orderStatus
        ? [prisma.order.update({ where: { id: reservation.orderId }, data: { status: orderStatus } })]
        : []),
    ]);

    return updated;
  }

  /**
   * O material voltou: a festa está concluída.
   *
   * Um passo só para as duas coisas que a operação faz ao receber as peças —
   * marcar a devolução no checklist e fechar a reserva —, para uma não ficar
   * feita sem a outra. Só sai de "aguardando devolução": concluir direto,
   * sem passar por ela, continua pelo seletor de etapa como sempre.
   */
  async confirmarDevolucao(id: string, usuarioId: string) {
    const concluida = await prisma.$transaction(async (tx) => {
      const { count } = await tx.reservation.updateMany({
        where: { id, status: "AGUARDANDO_DEVOLUCAO" },
        data: { status: "COMPLETED" },
      });
      if (count === 0) {
        const existe = await tx.reservation.findUnique({ where: { id }, select: { status: true } });
        if (!existe) throw new NotFoundException("Reserva não encontrada.");
        throw new BadRequestException("Esta reserva não está aguardando devolução.");
      }
      await tx.reservationTask.upsert({
        where: { reservationId_key: { reservationId: id, key: "devolucao_concluida" } },
        create: { reservationId: id, key: "devolucao_concluida", doneById: usuarioId },
        update: {},
      });
      return tx.reservation.findUniqueOrThrow({ where: { id } });
    });

    this.logger.log(`Devolução da reserva ${id} confirmada por ${usuarioId}; reserva concluída.`);
    return concluida;
  }
}

/**
 * As partes do tratamento de um cancelamento, sem valores, para o log: o
 * tratamento gravado guarda cada parte com autor e data.
 */
export function tratamentoNoLog(partes: { credito: number; reembolso: number; retencao: number }): string {
  const nomes = [
    partes.credito > 0 && "crédito",
    partes.reembolso > 0 && "reembolso",
    partes.retencao > 0 && "retenção",
  ].filter(Boolean);
  return nomes.length > 0 ? `tratamento ${nomes.join(" + ")}` : "sem valores a tratar";
}
