import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@festae/database";
import { RESERVATION_HOLD_MINUTES } from "@festae/shared";
import { getMaxReservationsPerDay } from "../../common/operations-config";
import {
  conflitosDoPedido,
  somarCompromisso,
  type Conflito,
  type PedidoComprometido,
} from "./item-commitment";

/**
 * Estados que ocupam a agenda do dia. PREPARING, READY e COMPLETED contam
 * tanto quanto CONFIRMED: a festa existe e o material está comprometido.
 * Só REJECTED e CANCELLED liberam a data.
 */
const COUNTED_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

export interface DayAvailability {
  date: string;
  reserved: number;
  remaining: number;
  available: boolean;
  /**
   * Presente só quando o dia caiu por falta de material, não por agenda cheia.
   * Traz o id para a loja poder oferecer a remoção do item, e `esgotado` para
   * separar "não temos essa peça" de "essa peça já saiu nesse dia" — são
   * problemas diferentes e a saída para a cliente é diferente.
   */
  itensIndisponiveis?: { productId: string; nome: string; esgotado: boolean }[];
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  /**
   * Devolve à agenda as reservas que ninguém pagou.
   *
   * Com capacidade de poucas festas por dia, uma reserva sem sinal é o
   * recurso mais escasso da empresa parado: duas delas fecham uma data
   * inteira sem um centavo ter entrado. A janela é maior que a validade do
   * Pix de propósito — quando ela vence, o QR já morreu e não há risco de o
   * pagamento chegar para uma vaga que já foi de outra pessoa.
   *
   * Roda junto das consultas de disponibilidade em vez de num agendador:
   * a limpeza só importa na hora de decidir se um dia está livre, e um
   * agendador seria mais uma peça para manter no ar.
   */
  private async releaseUnpaidHolds(): Promise<void> {
    const deadline = new Date(Date.now() - RESERVATION_HOLD_MINUTES * 60_000);

    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        requestedAt: { lt: deadline },
        order: { payments: { none: { status: "PAID" } } },
      },
      select: { id: true, orderId: true },
    });
    if (expired.length === 0) return;

    await prisma.$transaction([
      prisma.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "CANCELLED" },
      }),
      prisma.order.updateMany({
        where: { id: { in: expired.map((r) => r.orderId) } },
        data: { status: "CANCELLED" },
      }),
    ]);

    this.logger.log(
      `${expired.length} reserva(s) sem sinal pago passaram do prazo e a data foi liberada.`,
    );
  }

  /**
   * Disponibilidade do mês, opcionalmente para uma seleção específica.
   *
   * Sem seleção, responde só pela agenda (quantas festas cabem no dia). Com
   * kit e itens, um dia também fica indisponível quando o material daquela
   * escolha já está comprometido — que é a pergunta que a cliente realmente
   * faz ao olhar o calendário depois de escolher o kit.
   */
  async getMonth(month: string, selecao?: PedidoComprometido): Promise<DayAvailability[]> {
    await this.releaseUnpaidHolds();

    const capacity = getMaxReservationsPerDay();
    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));

    const temSelecao = Boolean(
      selecao && selecao.itensDoKit.length + selecao.itensAvulsos.length > 0,
    );

    // Uma consulta só para o mês inteiro. Perguntar dia a dia seriam trinta
    // idas ao banco para desenhar um calendário que a pessoa olha por segundos.
    const reservations = await prisma.reservation.findMany({
      where: {
        eventDate: { gte: start, lt: end },
        status: { in: [...COUNTED_STATUSES] },
      },
      select: {
        eventDate: true,
        order: {
          select: {
            kit: { select: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });

    const countByDay = new Map<string, number>();
    const pedidosPorDia = new Map<string, PedidoComprometido[]>();
    for (const reservation of reservations) {
      const key = reservation.eventDate.toISOString().slice(0, 10);
      countByDay.set(key, (countByDay.get(key) ?? 0) + 1);

      const doDia = pedidosPorDia.get(key) ?? [];
      doDia.push({
        itensDoKit: reservation.order.kit?.products ?? [],
        itensAvulsos: reservation.order.items,
      });
      pedidosPorDia.set(key, doDia);
    }

    const estoque = temSelecao
      ? await this.estoqueDe(
          [...selecao!.itensDoKit, ...selecao!.itensAvulsos].map((i) => i.productId),
        )
      : new Map();

    const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const days: DayAvailability[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, monthNumber - 1, day));
      const key = date.toISOString().slice(0, 10);
      const reserved = countByDay.get(key) ?? 0;
      const cabeNaAgenda = reserved < capacity;

      const conflitos =
        temSelecao && cabeNaAgenda
          ? conflitosDoPedido(
              selecao!,
              somarCompromisso(pedidosPorDia.get(key) ?? []),
              estoque,
            )
          : [];

      days.push({
        date: key,
        reserved,
        remaining: Math.max(0, capacity - reserved),
        available: cabeNaAgenda && conflitos.length === 0,
        // Nomes dos itens em falta: é o que permite a loja dizer "o painel
        // deste tema já está reservado neste dia" em vez de um vermelho mudo.
        ...(conflitos.length > 0
          ? {
              itensIndisponiveis: conflitos.map((c) => ({
                productId: c.productId,
                nome: c.nome,
                esgotado: c.estoque === 0,
              })),
            }
          : {}),
      });
    }
    return days;
  }

  /**
   * Ainda cabe uma festa nesta data?
   *
   * Consultado no momento de reservar, e não só ao desenhar o calendário:
   * entre abrir o app e confirmar, outra pessoa pode ter fechado a última
   * vaga do dia. Sem esta checagem, a Festaê receberia o sinal de uma data
   * que não tem como cumprir — e teria que devolver o dinheiro e o cliente.
   */
  async isDateAvailable(date: Date): Promise<boolean> {
    await this.releaseUnpaidHolds();

    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const reserved = await prisma.reservation.count({
      where: { eventDate: { gte: start, lt: end }, status: { in: [...COUNTED_STATUSES] } },
    });

    return reserved < getMaxReservationsPerDay();
  }

  /** Início e fim do dia da data, em UTC. */
  private limitesDoDia(date: Date): [Date, Date] {
    const inicio = new Date(date);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 1);
    return [inicio, fim];
  }

  /**
   * Tudo que os pedidos já reservados naquele dia comprometem de material.
   *
   * `ignorarOrderId` existe para a própria reserva não brigar consigo mesma
   * quando o pedido for reconferido depois de já existir.
   */
  private async compromissoDoDia(date: Date, ignorarOrderId?: string) {
    const [inicio, fim] = this.limitesDoDia(date);

    const reservas = await prisma.reservation.findMany({
      where: {
        eventDate: { gte: inicio, lt: fim },
        status: { in: [...COUNTED_STATUSES] },
        ...(ignorarOrderId ? { orderId: { not: ignorarOrderId } } : {}),
      },
      select: {
        order: {
          select: {
            kit: { select: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });

    const pedidos: PedidoComprometido[] = reservas.map((reserva) => ({
      itensDoKit: reserva.order.kit?.products ?? [],
      itensAvulsos: reserva.order.items,
    }));

    return somarCompromisso(pedidos);
  }

  /** Nome e estoque dos produtos citados, para conferir e para explicar. */
  private async estoqueDe(productIds: string[]) {
    const produtos = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, stockQuantity: true },
    });

    return new Map(produtos.map((p) => [p.id, { nome: p.name, estoque: p.stockQuantity }]));
  }

  /**
   * Os itens deste pedido cabem na data?
   *
   * Conferido no servidor mesmo quando a loja já mostrou o dia como livre:
   * entre escolher a data e confirmar, outra pessoa pode ter levado a última
   * mesa. É a mesma razão de `isDateAvailable` existir além do calendário.
   */
  async conflitosDeItens(
    date: Date,
    pedido: PedidoComprometido,
    ignorarOrderId?: string,
  ): Promise<Conflito[]> {
    const idsDoPedido = [...pedido.itensDoKit, ...pedido.itensAvulsos].map((i) => i.productId);
    if (idsDoPedido.length === 0) return [];

    const [comprometido, estoque] = await Promise.all([
      this.compromissoDoDia(date, ignorarOrderId),
      this.estoqueDe(idsDoPedido),
    ]);

    return conflitosDoPedido(pedido, comprometido, estoque);
  }
}
