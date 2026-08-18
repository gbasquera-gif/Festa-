import { STOREFRONT_EVENT_TYPES, type EventType, type EventTypeMeta } from "@festae/shared";

/**
 * A vitrine da Festaê é organizada por ocasião, não por categoria de produto.
 *
 * O cliente chega pensando "vou fazer um chá de bebê" — nunca "preciso de
 * mobiliário". Enquanto a home abria por Decoração / Mesas e Cadeiras /
 * Louças, ele tinha que traduzir sozinho a festa que imaginou numa lista de
 * peças, e essa tradução é justamente o trabalho que ele está contratando.
 *
 * O ícone mora aqui, e não no pacote compartilhado, porque depende das
 * fontes de ícone que só o aplicativo carrega.
 */
export interface FestaMeta extends EventTypeMeta {
  icon: string;
  /** "ion" = Ionicons, "mci" = MaterialCommunityIcons. */
  iconSet: "ion" | "mci";
}

const ICONS: Record<EventType, { icon: string; iconSet: "ion" | "mci" }> = {
  ANIVERSARIO: { icon: "cake-variant", iconSet: "mci" },
  CHA_DE_BEBE: { icon: "teddy-bear", iconSet: "mci" },
  CHA_REVELACAO: { icon: "gender-male-female", iconSet: "mci" },
  BATIZADO: { icon: "bird", iconSet: "mci" },
  OUTRO: { icon: "sparkles-outline", iconSet: "ion" },
};

/** Ocasiões oferecidas na vitrine, prontas para renderizar. */
export const FESTAS: FestaMeta[] = STOREFRONT_EVENT_TYPES.map((meta) => ({
  ...meta,
  ...ICONS[meta.key],
}));

export const FESTA_BY_SLUG: Record<string, FestaMeta> = Object.fromEntries(
  FESTAS.map((festa) => [festa.slug, festa]),
);

/**
 * Mensagem que abre no WhatsApp quando a pessoa escolhe "Festa
 * personalizada".
 *
 * Não vira pedido no aplicativo de propósito: festa fora das quatro ocasiões
 * precisa de conversa antes de virar preço, e um orçamento automático para
 * algo que a operação ainda não sabe cumprir é promessa que quebra depois.
 */
export const MENSAGEM_FESTA_PERSONALIZADA =
  "Oi! Quero uma festa personalizada, fora dos kits prontos. Pode me ajudar a montar?";
