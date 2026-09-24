import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import { diaDaFesta } from "@festae/shared";
import {
  detalharProduto,
  montarPerformance,
  type ConflitoRegistrado,
  type ProdutoDoAcervo,
  type ReservaDoAcervo,
} from "./performance";

/**
 * A Performance do Acervo, lida ao vivo.
 *
 * Três consultas, sempre as mesmas: reservas (com o pedido inteiro:
 * congelado, kit atual, avulsos), produtos e conflitos registrados. Todo o
 * resto é conta em memória em `performance.ts`. Sem cache: no volume atual,
 * ler tudo custa menos do que o risco de um número velho.
 */
@Injectable()
export class AcervoService {
  async performance(dias: number) {
    const [reservas, produtos, conflitos] = await Promise.all([
      this.reservas(),
      this.produtos(),
      this.conflitos(),
    ]);
    return montarPerformance(reservas, produtos, conflitos, dias, new Date());
  }

  async detalheDoProduto(productId: string, dias: number) {
    const [reservas, produtos, conflitos] = await Promise.all([
      this.reservas(),
      this.produtos(),
      this.conflitos(),
    ]);
    const detalhe = detalharProduto(reservas, produtos, conflitos, productId, dias, new Date());
    if (!detalhe) throw new NotFoundException("Produto não encontrado.");
    return detalhe;
  }

  private async reservas(): Promise<ReservaDoAcervo[]> {
    const linhas = await prisma.reservation.findMany({
      select: {
        id: true,
        contractSeq: true,
        status: true,
        cancelledAt: true,
        eventDate: true,
        order: {
          select: {
            total: true,
            kitId: true,
            kitCongeladoEm: true,
            kitItems: { select: { productId: true, quantity: true } },
            items: { select: { productId: true, quantity: true } },
            kit: { select: { name: true, products: { select: { productId: true, quantity: true } } } },
            event: {
              select: {
                themeId: true,
                theme: { select: { name: true } },
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return linhas.map((r) => ({
      id: r.id,
      numero: r.contractSeq,
      status: r.status,
      cancelada: r.cancelledAt !== null,
      // O mesmo dia que a disponibilidade usa: a data da festa é gravada
      // ancorada ao meio-dia, e o dia dela já é o de Chapecó.
      festaEm: diaDaFesta(r.eventDate),
      cliente: r.order.event.user.name,
      total: Number(r.order.total),
      kitId: r.order.kitId,
      kitNome: r.order.kit?.name ?? null,
      kitCongeladoEm: r.order.kitCongeladoEm,
      itensDoKitCongelado: r.order.kitItems,
      itensDoKitAtual: r.order.kit?.products ?? [],
      extras: r.order.items,
      temaId: r.order.event.themeId,
      temaNome: r.order.event.theme?.name ?? null,
    }));
  }

  private async produtos(): Promise<ProdutoDoAcervo[]> {
    const linhas = await prisma.product.findMany({
      select: { id: true, name: true, stockQuantity: true, active: true },
    });
    return linhas.map((p) => ({ id: p.id, nome: p.name, estoque: p.stockQuantity, ativo: p.active }));
  }

  /**
   * Os conflitos registrados desde a Sprint 7B. Nada é reconstruído: antes
   * do registro existir, a recusa acontecia e não deixava rastro.
   */
  private async conflitos(): Promise<ConflitoRegistrado[]> {
    const eventos = await prisma.analyticsEvent.findMany({
      where: { type: "CONFLITO_DE_ACERVO" },
      select: { id: true, createdAt: true, metadata: true },
    });
    return eventos.map((e) => {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
      const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      return {
        id: e.id,
        registradoEm: e.createdAt,
        productId: texto(m.productId),
        dataDaFesta: texto(m.dataDaFesta),
        solicitado: numero(m.solicitado),
        disponivel: numero(m.disponivel),
        contexto: texto(m.contexto),
      };
    });
  }
}
