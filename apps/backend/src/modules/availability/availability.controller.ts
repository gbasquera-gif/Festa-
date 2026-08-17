import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { prisma } from "@festae/database";
import { availabilityQuerySchema } from "@festae/shared";
import type { AvailabilityQuery } from "@festae/shared";
import { AvailabilityService } from "./availability.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { PedidoComprometido } from "./item-commitment";

/**
 * Calendário da loja — público, como o resto do catálogo.
 *
 * Exigia login, e isso quebrava a loja Web desde que o cadastro passou para
 * o fim da jornada: a consulta voltava 401, o calendário ficava sem dados e
 * pintava **todos** os dias de verde. A cliente escolhia um sábado lotado,
 * montava a festa inteira, criava conta — e só então era recusada, no passo
 * mais caro de todos.
 *
 * A resposta não expõe ninguém: são contagens por dia e, quando ela já
 * escolheu um kit, o nome dos itens que faltam. Nada de cliente, valor ou
 * pedido.
 */
@ApiTags("availability")
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  async getMonth(@Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery) {
    const selecao = await this.montarSelecao(query);
    return this.availabilityService.getMonth(query.month, selecao);
  }

  /**
   * Traduz o que veio na URL no que a pessoa está montando.
   *
   * O kit é lido do banco em vez de aceito por parâmetro: a lista de itens de
   * um kit é decisão da Festaê, e deixar o cliente informá-la abriria espaço
   * para consultar a disponibilidade de uma combinação que não existe.
   */
  private async montarSelecao(query: AvailabilityQuery): Promise<PedidoComprometido | undefined> {
    if (!query.kitId && !query.items) return undefined;

    const kit = query.kitId
      ? await prisma.kit.findUnique({
          where: { id: query.kitId },
          select: { products: { select: { productId: true, quantity: true } } },
        })
      : null;

    const itensAvulsos = (query.items ?? "")
      .split(",")
      .filter(Boolean)
      .map((par) => {
        const [productId, quantidade] = par.split(":");
        return { productId, quantity: Number(quantidade) };
      })
      .filter((item) => item.quantity > 0);

    return { itensDoKit: kit?.products ?? [], itensAvulsos };
  }
}
