import { ConflictException } from "@nestjs/common";
import { lerComposicaoCongelada } from "@festae/shared";

/**
 * O kit que a conversão de uma proposta vai reservar.
 *
 * Com composição congelada, é ela — peça por peça, com o nome e a
 * quantidade que a cliente viu. Sem ela (proposta que saiu antes do
 * registro existir), `null`: a venda cai no cadastro atual do kit, como
 * sempre caiu. Nunca o contrário: proposta congelada não volta ao catálogo.
 */
export function kitDaConversao(proposta: {
  numero: number;
  kitId: string | null;
  composicaoDoKit: unknown;
}): { itens: { productId: string; nome: string; quantity: number }[] } | null {
  const congelada = lerComposicaoCongelada(proposta.composicaoDoKit);
  if (!congelada) return null;

  // A composição é gravada junto do kit da proposta e apagada quando a
  // proposta é editada. Divergir é dado inconsistente, e o seguro é parar.
  if (congelada.kitId !== proposta.kitId) {
    throw new ConflictException(
      `A composição registrada na proposta nº ${proposta.numero} não corresponde ao kit dela. ` +
        "A reserva não foi criada. Edite e reenvie a proposta antes de converter.",
    );
  }

  return {
    itens: congelada.itens.map((i) => ({ productId: i.productId, nome: i.nome, quantity: i.quantidade })),
  };
}
