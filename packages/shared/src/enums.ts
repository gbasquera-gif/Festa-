export const ROLES = ["CLIENT", "ADMIN", "OPS"] as const;
export type Role = (typeof ROLES)[number];

export const EVENT_TYPES = ["FESTA_INFANTIL", "CHA_DE_BEBE", "CHA_REVELACAO", "OUTRO"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const PRODUCT_CATEGORIES = [
  "DECORACAO",
  "MOBILIARIO",
  "LOUCA",
  "ILUMINACAO",
  "BRINQUEDO",
  "OUTRO",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const ORDER_STATUSES = ["CART", "REQUESTED", "CONFIRMED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Etapas operacionais, na ordem em que a Maria Luiza as percorre. */
export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const PARTNER_TYPES = [
  "DECORADOR",
  "DOCERIA",
  "FOTOGRAFO",
  "DJ",
  "BARTENDER",
  "ESCOLA",
  "EMPRESA",
  "OUTRO",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PAYMENT_METHODS = ["PIX", "CARTAO", "BOLETO", "OUTRO"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_TYPES = ["DEPOSIT", "BALANCE"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

// Ordem representa o funil de conversão, do topo ao fundo — usado para
// calcular abandono/drop-off entre etapas no resumo de analytics.
export const ANALYTICS_EVENT_TYPES = [
  "CADASTRO",
  "LOGIN",
  "INICIO_CRIACAO_FESTA",
  "ESCOLHA_TEMA",
  "ESCOLHA_KIT",
  "EXTRA_ADICIONADO",
  "CLIQUE_WHATSAPP",
  "RESERVA_CRIADA",
  "PAGAMENTO_INICIADO",
  "PAGAMENTO_REALIZADO",
  "ABANDONO",
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export const ANALYTICS_FUNNEL_ORDER: AnalyticsEventType[] = [
  "CADASTRO",
  "LOGIN",
  "INICIO_CRIACAO_FESTA",
  "ESCOLHA_TEMA",
  "ESCOLHA_KIT",
  "RESERVA_CRIADA",
  "PAGAMENTO_REALIZADO",
];

export const FULFILLMENTS = ["PICKUP", "DELIVERY"] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];
