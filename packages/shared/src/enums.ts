export const ROLES = ["CLIENT", "ADMIN", "OPS"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Ocasiões que a Festaê atende. É por aqui que o cliente começa a jornada:
 * ele pensa "vou fazer um chá de bebê", não "quero decoração".
 *
 * OUTRO fica fora da vitrine — festa fora dessas quatro é atendimento
 * consultivo pelo WhatsApp, e o tipo só é usado quando a operação cria o
 * pedido manualmente.
 */
export const EVENT_TYPES = [
  "ANIVERSARIO",
  "CHA_DE_BEBE",
  "CHA_REVELACAO",
  "BATIZADO",
  "OUTRO",
] as const;
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
  "VISITA_LOJA",
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

/**
 * O funil na ordem em que a loja Web realmente acontece.
 *
 * A ordem anterior começava em CADASTRO e LOGIN, de quando era preciso ter
 * conta para ver qualquer coisa. Hoje o catálogo é aberto e a conta só é
 * pedida no fim, então aqueles dois passos ficavam no topo com número baixo
 * e faziam o relatório mostrar uma queda gigante que nunca existiu.
 *
 * VISITA_LOJA é o denominador: sem saber quantas pessoas chegaram, nenhuma
 * taxa de conversão pode ser calculada — e "mandar gente do Instagram e ver
 * quantas reservam" é exatamente o que se quer medir nesta fase.
 */
export const ANALYTICS_FUNNEL_ORDER: AnalyticsEventType[] = [
  "VISITA_LOJA",
  "ESCOLHA_TEMA",
  "ESCOLHA_KIT",
  "CADASTRO",
  "RESERVA_CRIADA",
  "PAGAMENTO_INICIADO",
  "PAGAMENTO_REALIZADO",
];

export const FULFILLMENTS = ["PICKUP", "DELIVERY"] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];
