import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  confirmaAReserva,
  fromCentsInt,
  toCentsInt,
  type MovimentoDeCredito,
  type ReservationStatus,
} from "@festae/shared";
import { ManualReservationService } from "../reservations/manual-reservation.service";
import {
  creditoAplicadoEmCentavos,
  pagoEmCentavos,
  saldoEmCentavos,
  travarCredito,
  travarPedido,
  utilizarCredito,
} from "./ledger";

/** Reserva cancelada ou recusada não recebe nem devolve crédito por aqui. */
const MORTAS = ["CANCELLED", "REJECTED"];

const selecaoDoMovimento = {
  id: true,
  numero: true,
  tipo: true,
  valor: true,
  createdAt: true,
  movimentoReferenciaId: true,
  observacao: true,
  reservationOrigem: { select: { id: true, contractSeq: true } },
  reservationDestino: { select: { id: true, contractSeq: true } },
  createdBy: { select: { name: true } },
} as const;

type MovimentoDoBanco = {
  id: string;
  numero: number;
  tipo: MovimentoDeCredito["tipo"];
  valor: unknown;
  createdAt: Date;
  movimentoReferenciaId: string | null;
  observacao: string | null;
  reservationOrigem: { id: string; contractSeq: number } | null;
  reservationDestino: { id: string; contractSeq: number } | null;
  createdBy: { name: string } | null;
};

function paraMovimento(m: MovimentoDoBanco): MovimentoDeCredito {
  return {
    id: m.id,
    numero: m.numero,
    tipo: m.tipo,
    valor: Number(m.valor),
    criadoEm: m.createdAt.toISOString(),
    reservaOrigem: m.reservationOrigem
      ? { id: m.reservationOrigem.id, numero: m.reservationOrigem.contractSeq }
      : null,
    reservaDestino: m.reservationDestino
      ? { id: m.reservationDestino.id, numero: m.reservationDestino.contractSeq }
      : null,
    movimentoReferenciaId: m.movimentoReferenciaId,
    observacao: m.observacao,
    criadoPor: m.createdBy?.name ?? null,
  };
}

/**
 * O crédito Festaê das clientes: extrato, uso, estorno e voucher.
 *
 * O cancelamento que GERA crédito mora no serviço de reservas, porque é a
 * reserva que muda de estado; ele usa as mesmas funções de `ledger.ts`.
 * Nenhum caminho daqui grava saldo — só movimentos.
 */
@Injectable()
export class CreditosService {
  private readonly logger = new Logger(CreditosService.name);

  constructor(private readonly manualReservations: ManualReservationService) {}

  /** O cadastro da cliente com o crédito: saldo, extrato e festas. */
  async daCliente(userId: string) {
    const cliente = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true, deletedAt: true },
    });
    if (!cliente) throw new NotFoundException("Cliente não encontrada.");

    const [movimentos, reservas] = await Promise.all([
      prisma.creditoClienteMovimento.findMany({
        where: { userId },
        select: selecaoDoMovimento,
        orderBy: [{ createdAt: "asc" }, { numero: "asc" }],
      }),
      prisma.reservation.findMany({
        where: { order: { event: { userId } } },
        select: {
          id: true,
          contractSeq: true,
          eventDate: true,
          status: true,
          order: {
            select: {
              total: true,
              payments: { where: { status: "PAID" }, select: { amount: true } },
            },
          },
          creditosUtilizados: { select: { valor: true } },
        },
        orderBy: { eventDate: "desc" },
      }),
    ]);

    const extrato = movimentos.map(paraMovimento);
    return {
      cliente: {
        id: cliente.id,
        nome: cliente.name,
        telefone: cliente.phone,
        email: cliente.email,
        perfil: cliente.role,
        desde: cliente.createdAt.toISOString(),
        excluida: cliente.deletedAt !== null,
      },
      saldo: fromCentsInt(extrato.reduce((t, m) => t + toCentsInt(m.valor), 0)),
      movimentos: extrato,
      festas: reservas.map((r) => {
        const recebido = r.order.payments.reduce((t, p) => t + toCentsInt(Number(p.amount)), 0);
        const credito = Math.max(
          0,
          -r.creditosUtilizados.reduce((t, m) => t + toCentsInt(Number(m.valor)), 0),
        );
        return {
          id: r.id,
          numero: r.contractSeq,
          festaEm: r.eventDate.toISOString(),
          status: r.status,
          valor: Number(r.order.total),
          recebido: fromCentsInt(recebido),
          creditoAplicado: fromCentsInt(credito),
        };
      }),
    };
  }

  /**
   * A ficha que a venda manual vai usar, e o crédito dela.
   *
   * Mesma regra de reaproveitamento do cadastro da venda manual (e-mail; na
   * falta, telefone): a tela só pode oferecer o crédito da ficha que a venda
   * vai de fato usar.
   */
  async porContato(telefone: string, email?: string) {
    const cliente = await this.manualReservations.clienteExistente({ telefone, email });
    if (!cliente) return { cliente: null, saldo: 0 };
    const saldo = fromCentsInt(await saldoEmCentavos(prisma, cliente.id));
    return { cliente: { id: cliente.id, nome: cliente.name }, saldo };
  }

  /**
   * Usa crédito numa reserva já existente.
   *
   * Reserva solicitada (sem sinal) que recebe crédito passa a confirmada pela
   * mesma regra do sinal: hoje, sinal pago de qualquer valor confirma — não
   * existe valor mínimo —, e o crédito participa como forma de liquidação,
   * nem antes nem com menos. Sem isso, a limpeza de reservas sem sinal
   * cancelaria uma festa que tem crédito aplicado.
   */
  async aplicar(reservationId: string, valor: number, observacao: string | undefined, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true, orderId: true, contractSeq: true, order: { select: { event: { select: { userId: true } } } } },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (MORTAS.includes(reserva.status)) {
      throw new BadRequestException("Reserva cancelada não recebe crédito.");
    }
    const userId = reserva.order.event.userId;

    const resultado = await prisma.$transaction(
      async (tx) => {
        await travarPedido(tx, reserva.orderId);
        // Relido sob a trava: entre o clique e aqui a reserva pode ter sido
        // cancelada ou o total, editado.
        const atual = await tx.reservation.findUniqueOrThrow({
          where: { id: reservationId },
          select: { status: true, order: { select: { total: true } } },
        });
        if (MORTAS.includes(atual.status)) {
          throw new BadRequestException("Reserva cancelada não recebe crédito.");
        }

        const movimento = await utilizarCredito(tx, {
          userId,
          reservationId,
          orderId: reserva.orderId,
          totalDoPedido: Number(atual.order.total),
          valor,
          createdById: usuarioId,
          observacao,
        });

        // Crédito liquida como o sinal liquidaria: confirma nas mesmas
        // condições e em nenhuma outra (`confirmaAReserva`, regra única).
        const confirma = confirmaAReserva(atual.status as ReservationStatus, "CREDITO");
        if (confirma) {
          await tx.reservation.update({
            where: { id: reservationId },
            data: { status: "CONFIRMED", confirmedAt: new Date() },
          });
          await tx.order.update({ where: { id: reserva.orderId }, data: { status: "CONFIRMED" } });
        }

        const aplicado = await creditoAplicadoEmCentavos(tx, reservationId);
        const saldo = await saldoEmCentavos(tx, userId);
        const pago = await pagoEmCentavos(tx, reserva.orderId);
        return {
          movimentoId: movimento.id,
          aplicado: fromCentsInt(toCentsInt(valor)),
          creditoAplicadoNaReserva: fromCentsInt(aplicado),
          saldoDaCliente: fromCentsInt(saldo),
          faltaPagar: fromCentsInt(Math.max(0, toCentsInt(Number(atual.order.total)) - pago - aplicado)),
          reservaConfirmada: confirma,
        };
      },
      { timeout: 15_000 },
    );

    this.logger.log(
      `Crédito de R$ ${resultado.aplicado.toFixed(2)} aplicado na reserva ${reservationId} por ${usuarioId}.`,
    );
    return resultado;
  }

  /**
   * Desfaz uma utilização lançada por engano.
   *
   * Grava o movimento contrário, apontando para a utilização; nada é apagado.
   * Utilização de reserva já cancelada não se estorna aqui: o cancelamento já
   * devolveu esse crédito ao saldo, e estornar de novo daria à cliente o
   * mesmo valor duas vezes.
   */
  async estornar(movimentoId: string, motivo: string, usuarioId: string) {
    const original = await prisma.creditoClienteMovimento.findUnique({
      where: { id: movimentoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        userId: true,
        reservationDestinoId: true,
        reservationDestino: { select: { orderId: true, contractSeq: true } },
      },
    });
    if (!original) throw new NotFoundException("Movimento de crédito não encontrado.");
    if (original.tipo !== "CREDITO_UTILIZADO" || !original.reservationDestinoId || !original.reservationDestino) {
      throw new BadRequestException("Só uma utilização de crédito pode ser estornada.");
    }
    const destinoId = original.reservationDestinoId;
    const orderId = original.reservationDestino.orderId;
    const valorUsado = -toCentsInt(Number(original.valor));

    const estorno = await prisma.$transaction(
      async (tx) => {
        await travarPedido(tx, orderId);
        await travarCredito(tx, original.userId);

        const ja = await tx.creditoClienteMovimento.findFirst({
          where: { movimentoReferenciaId: original.id },
          select: { id: true },
        });
        if (ja) throw new ConflictException({ message: "Esta utilização já foi estornada.", codigo: "JA_ESTORNADA" });

        const aplicado = await creditoAplicadoEmCentavos(tx, destinoId);
        if (aplicado < valorUsado) {
          throw new ConflictException({
            message:
              "O crédito desta reserva já voltou ao saldo da cliente no cancelamento. Não há o que estornar.",
            codigo: "CREDITO_JA_DEVOLVIDO",
          });
        }

        return tx.creditoClienteMovimento.create({
          data: {
            userId: original.userId,
            tipo: "CREDITO_ESTORNADO",
            valor: fromCentsInt(valorUsado),
            reservationDestinoId: destinoId,
            movimentoReferenciaId: original.id,
            observacao: motivo.trim(),
            createdById: usuarioId,
          },
        });
      },
      { timeout: 15_000 },
    );

    this.logger.warn(
      `Utilização de crédito ${original.id} (reserva nº ${original.reservationDestino.contractSeq}) estornada por ${usuarioId}.`,
    );
    return { estornado: true, movimentoId: estorno.id, valor: fromCentsInt(valorUsado) };
  }

  /**
   * Os dados do Voucher de Crédito, sempre recalculados do registro.
   *
   * Nada é guardado em arquivo: o voucher é refeito a cada pedido a partir do
   * movimento que gerou o crédito, e por isso sai igual hoje e daqui a um ano.
   * O valor é o concedido — o voucher não acompanha o saldo, que muda a cada
   * uso; para o saldo existe o comprovante do saldo atual.
   */
  async voucher(movimentoId: string) {
    const m = await prisma.creditoClienteMovimento.findUnique({
      where: { id: movimentoId },
      select: {
        id: true,
        numero: true,
        tipo: true,
        valor: true,
        createdAt: true,
        user: { select: { id: true, name: true, phone: true, email: true } },
        reservationOrigem: {
          select: {
            id: true,
            contractSeq: true,
            eventDate: true,
            tratamentoDoCancelamento: { select: { motivo: true, definidoEm: true } },
          },
        },
      },
    });
    if (!m || m.tipo !== "CREDITO_GERADO_CANCELAMENTO" || !m.reservationOrigem) {
      throw new NotFoundException("Voucher não encontrado.");
    }
    return {
      id: m.id,
      numero: m.numero,
      valor: Number(m.valor),
      geradoEm: m.createdAt.toISOString(),
      cliente: { id: m.user.id, nome: m.user.name, telefone: m.user.phone, email: m.user.email },
      origem: {
        reservaId: m.reservationOrigem.id,
        numero: m.reservationOrigem.contractSeq,
        festaEm: m.reservationOrigem.eventDate.toISOString(),
      },
      motivo: m.reservationOrigem.tratamentoDoCancelamento?.motivo ?? null,
    };
  }

  /** O saldo de hoje, para o comprovante do saldo atual. */
  async comprovanteDoSaldo(userId: string) {
    const dados = await this.daCliente(userId);
    return {
      cliente: dados.cliente,
      saldo: dados.saldo,
      emitidoEm: new Date().toISOString(),
      movimentos: dados.movimentos,
    };
  }

  /** Saldo por cliente, para a lista de clientes. Só quem tem extrato. */
  async saldosPorCliente(): Promise<Map<string, number>> {
    const grupos = await prisma.creditoClienteMovimento.groupBy({
      by: ["userId"],
      _sum: { valor: true },
    });
    return new Map(grupos.map((g) => [g.userId, Number(g._sum.valor ?? 0)]));
  }
}
