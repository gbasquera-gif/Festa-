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

export const RESERVATION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
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
