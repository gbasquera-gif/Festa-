import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";
import { somarCompromisso, type PedidoComprometido } from "./item-commitment";

/** Quantas unidades sobrando já contam como aperto e merecem aviso. */
const MARGEM_DE_RISCO = 1;

/** Estados que seguram material. Recusada e cancelada devolvem o item. */
const RESERVAS_ATIVAS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

export interface ItemDaData {
  productId: string;
  produto: string;
  estoque: number;
  comprometido: number;
  disponivel: number;
  /** `conflito` = já passou do estoque; `risco` = está na última unidade. */
  situacao: "conflito" | "risco";
}

export interface DataComProblema {
  data: string;
  reservas: {
    id: string;
    cliente: string;
    telefone: string | null;
    status: string;
  }[];
  itens: ItemDaData[];
}

/**
 * Onde o material vai faltar, para a operação enxergar antes do dia chegar.
 *
 * A loja já barra a reserva que não cabe, mas a Maria Luiza não via nada
 * disso: a venda simplesmente não acontecia e ninguém sabia por quê. Esta
 * consulta é o outro lado da mesma regra — mostra o que a trava está
 * segurando e por quê.
 *
 * Inclui "risco" além de "conflito" de propósito. Saber que sobrou uma
 * unidade de painel para o sábado é acionável (dá para comprar, alugar de
 * parceiro ou avisar); saber depois que já estourou, não.
 */
@Injectable()
export class ConflitosService {
  async listar(): Promise<DataComProblema[]> {
    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);

    const reservas = await prisma.reservation.findMany({
      where: { eventDate: { gte: hoje }, status: { in: [...RESERVAS_ATIVAS] } },
      select: {
        id: true,
        eventDate: true,
        status: true,
        order: {
          select: {
            kit: { select: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
            event: { select: { user: { select: { name: true, phone: true } } } },
          },
        },
      },
      orderBy: { eventDate: "asc" },
    });

    if (reservas.length === 0) return [];

    const porData = new Map<string, typeof reservas>();
    for (const reserva of reservas) {
      const chave = reserva.eventDate.toISOString().slice(0, 10);
      porData.set(chave, [...(porData.get(chave) ?? []), reserva]);
    }

    const idsUsados = new Set<string>();
    for (const reserva of reservas) {
      for (const item of [...(reserva.order.kit?.products ?? []), ...reserva.order.items]) {
        idsUsados.add(item.productId);
      }
    }

    const produtos = await prisma.product.findMany({
      where: { id: { in: [...idsUsados] } },
      select: { id: true, name: true, stockQuantity: true },
    });
    const catalogo = new Map(produtos.map((p) => [p.id, p]));

    const resultado: DataComProblema[] = [];

    for (const [data, doDia] of porData) {
      const pedidos: PedidoComprometido[] = doDia.map((r) => ({
        itensDoKit: r.order.kit?.products ?? [],
        itensAvulsos: r.order.items,
      }));

      const comprometido = somarCompromisso(pedidos);
      const itens: ItemDaData[] = [];

      for (const [productId, quantidade] of comprometido) {
        const produto = catalogo.get(productId);
        // Sem estoque cadastrado não há o que comparar — o mesmo critério
        // que a loja usa para não barrar venda por campo em branco.
        if (!produto) continue;

        const disponivel = produto.stockQuantity - quantidade;
        if (disponivel > MARGEM_DE_RISCO) continue;

        itens.push({
          productId,
          produto: produto.name,
          estoque: produto.stockQuantity,
          comprometido: quantidade,
          disponivel,
          situacao: disponivel < 0 ? "conflito" : "risco",
        });
      }

      if (itens.length === 0) continue;

      resultado.push({
        data,
        reservas: doDia.map((r) => ({
          id: r.id,
          cliente: r.order.event.user.name,
          telefone: r.order.event.user.phone,
          status: r.status,
        })),
        // Conflito antes de risco, e o pior primeiro dentro de cada grupo.
        itens: itens.sort((a, b) => a.disponivel - b.disponivel),
      });
    }

    return resultado;
  }
}
