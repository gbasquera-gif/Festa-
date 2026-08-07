import type { EventType, Fulfillment, OrderStatus, ProductCategory, ReservationStatus } from "@festae/shared";

export interface Theme {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  colorPalette: string[];
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: ProductCategory;
  unitPrice: string;
  imageUrl: string | null;
  active: boolean;
}

export interface KitProductLink {
  productId: string;
  quantity: number;
  product: Product;
}

export interface Kit {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: string;
  coverImageUrl: string | null;
  images: string[];
  minGuests: number;
  maxGuests: number;
  theme: Theme | null;
  products: KitProductLink[];
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPriceSnapshot: string;
  product: Product;
}

export interface Reservation {
  id: string;
  eventDate: string;
  status: ReservationStatus;
  notes: string | null;
}

export interface Order {
  id: string;
  status: OrderStatus;
  kitId: string | null;
  kit: Kit | null;
  items: OrderItem[];
  subtotalKit: string;
  subtotalExtras: string;
  fulfillment: Fulfillment;
  assembly: boolean;
  deliveryFee: string;
  assemblyFee: string;
  total: string;
  reservation: Reservation | null;
}

export interface PaymentRecord {
  id: string;
  type: "DEPOSIT" | "BALANCE";
  amount: string;
  method: "PIX" | "CARTAO" | "BOLETO" | "OUTRO";
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface EventRecord {
  id: string;
  type: EventType;
  date: string;
  guestCount: number;
  budgetGoal: string | null;
  themeId: string | null;
  theme: Theme | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  order: Order;
}

export interface Payment {
  id: string;
  type: "DEPOSIT" | "BALANCE";
  amount: string;
  method: "PIX" | "CARTAO" | "BOLETO" | "OUTRO";
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  checkoutUrl: string | null;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  FESTA_INFANTIL: "Festa Infantil",
  CHA_DE_BEBE: "Chá de Bebê",
  CHA_REVELACAO: "Chá de Revelação",
  OUTRO: "Outro",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CART: "Montando festa",
  REQUESTED: "Reserva solicitada",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
};
