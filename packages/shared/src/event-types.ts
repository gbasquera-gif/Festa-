import { EVENT_TYPES, type EventType } from "./enums";

/**
 * Como cada ocasião se apresenta ao cliente.
 *
 * Rótulo, texto de apoio e slug vivem aqui, e não em cada app, porque o
 * cliente escolhe "Chá de bebê" no aplicativo e a Maria Luiza precisa ver
 * exatamente "Chá de bebê" no painel. Quando essa tradução mora em dois
 * lugares, ela se desencontra na primeira mudança de nome.
 */
export interface EventTypeMeta {
  key: EventType;
  /** Nome completo, usado em títulos e no painel. */
  label: string;
  /** Versão curta para os cartões da home, onde a linha é estreita. */
  shortLabel: string;
  /** Uma frase que ajuda a pessoa a se reconhecer na ocasião. */
  description: string;
  /** Usado na URL da vitrine: /festas/cha-de-bebe. */
  slug: string;
  /**
   * Se aparece na vitrine do aplicativo. OUTRO fica de fora: festa que não
   * é uma dessas quatro é orçamento consultivo pelo WhatsApp, e oferecer
   * "Outro" como cartão levaria o cliente a um caminho automatizado que a
   * operação não consegue cumprir sem conversar antes.
   */
  storefront: boolean;
}

export const EVENT_TYPE_META: Record<EventType, EventTypeMeta> = {
  ANIVERSARIO: {
    key: "ANIVERSARIO",
    label: "Aniversário",
    shortLabel: "Aniversário",
    description: "Do primeiro aninho aos 100 anos, com tema ou sem tema.",
    slug: "aniversario",
    storefront: true,
  },
  CHA_DE_BEBE: {
    key: "CHA_DE_BEBE",
    label: "Chá de bebê",
    shortLabel: "Chá de bebê",
    description: "Para receber quem vem chegando com todo o carinho.",
    slug: "cha-de-bebe",
    storefront: true,
  },
  CHA_REVELACAO: {
    key: "CHA_REVELACAO",
    label: "Chá revelação",
    shortLabel: "Chá revelação",
    description: "O momento de contar se é menino ou menina.",
    slug: "cha-revelacao",
    storefront: true,
  },
  BATIZADO: {
    key: "BATIZADO",
    label: "Batizado",
    shortLabel: "Batizado",
    description: "Celebração em família, com decoração delicada.",
    slug: "batizado",
    storefront: true,
  },
  OUTRO: {
    key: "OUTRO",
    label: "Outro",
    shortLabel: "Outro",
    description: "Uma festa fora do comum — a gente monta junto com você.",
    slug: "outro",
    storefront: false,
  },
};

/** As ocasiões que a vitrine oferece, na ordem em que aparecem. */
export const STOREFRONT_EVENT_TYPES: EventTypeMeta[] = EVENT_TYPES.map(
  (key) => EVENT_TYPE_META[key],
).filter((meta) => meta.storefront);

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPE_META[type]?.label ?? "Festa";
}

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

export function eventTypeFromSlug(slug: string): EventType | null {
  const meta = Object.values(EVENT_TYPE_META).find((item) => item.slug === slug);
  return meta ? meta.key : null;
}
