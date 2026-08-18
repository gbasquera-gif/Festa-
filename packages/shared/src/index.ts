// Explicit re-exports instead of `export *`: tsc compiles `export *` to a
// dynamic `__exportStar` call under CommonJS, which Rollup/Vite's cjs-interop
// (cjs-module-lexer) cannot statically analyze — it would silently fail to
// see any of these names when this package is bundled into apps/admin.
export {
  ROLES,
  EVENT_TYPES,
  PRODUCT_CATEGORIES,
  ORDER_STATUSES,
  RESERVATION_STATUSES,
  PARTNER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_FUNNEL_ORDER,
  FULFILLMENTS,
} from "./enums";
export type {
  Role,
  EventType,
  ProductCategory,
  OrderStatus,
  ReservationStatus,
  PartnerType,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  AnalyticsEventType,
  Fulfillment,
} from "./enums";

export {
  EVENT_TYPE_META,
  STOREFRONT_EVENT_TYPES,
  eventTypeLabel,
  eventTypeFromSlug,
  isEventType,
} from "./event-types";
export type { EventTypeMeta } from "./event-types";

export { PRODUCT_CATEGORY_OPTIONS, PRODUCT_CATEGORY_LABEL } from "./product-categories";

export { BRAND_COLORS, BRAND_NAME, DEFAULT_CITY, DEFAULT_STATE } from "./brand";

export {
  TERMS_VERSION,
  TERMS_UPDATED_AT,
  COMPANY,
  PRIVACY_POLICY,
  TERMS_OF_USE,
  LEGAL_DOCUMENTS,
  formatLegalDate,
} from "./legal";
export type { LegalDocument, LegalSection } from "./legal";

export {
  signupSchema,
  loginSchema,
  deleteAccountSchema,
  resetPasswordSchema,
  updateUserSchema,
} from "./schemas/auth";
export type {
  SignupInput,
  LoginInput,
  DeleteAccountInput,
  ResetPasswordInput,
  UpdateUserInput,
} from "./schemas/auth";

export { createEventSchema, updateEventSchema, availabilityQuerySchema } from "./schemas/events";
export type { CreateEventInput, UpdateEventInput, AvailabilityQuery } from "./schemas/events";

export { setLogisticsSchema, selectKitSchema, addOrderItemSchema, updateOrderItemSchema } from "./schemas/orders";
export type { SetLogisticsInput, SelectKitInput, AddOrderItemInput, UpdateOrderItemInput } from "./schemas/orders";

export { createReservationSchema, updateReservationStatusSchema } from "./schemas/reservations";
export type { CreateReservationInput, UpdateReservationStatusInput } from "./schemas/reservations";

export {
  createThemeSchema,
  updateThemeSchema,
  createProductSchema,
  updateProductSchema,
  kitProductInputSchema,
  createKitSchema,
  updateKitSchema,
} from "./schemas/catalog";
export type {
  CreateThemeInput,
  UpdateThemeInput,
  CreateProductInput,
  UpdateProductInput,
  CreateKitInput,
  UpdateKitInput,
} from "./schemas/catalog";

export { trackEventSchema } from "./schemas/analytics";
export type { TrackEventInput } from "./schemas/analytics";

export { createCheckoutSchema } from "./schemas/payments";
export type { CreateCheckoutInput } from "./schemas/payments";

export {
  DELIVERY_FEE,
  ASSEMBLY_FEE,
  DELIVERY_WITH_ASSEMBLY_FEE,
  DELIVERY_CITY,
  DEPOSIT_RATE,
  DELIVERY_UNAVAILABLE_MESSAGE,
  ASSEMBLY_REQUIRES_DELIVERY_MESSAGE,
  calculateOrderPricing,
  splitPayment,
  checkFulfillment,
  isDeliveryCity,
  toCents,
  toCentsInt,
  fromCentsInt,
} from "./pricing";
export type { PricingInput, PricingResult } from "./pricing";

export {
  DEFAULT_MAX_RESERVATIONS_PER_DAY,
  PIX_EXPIRATION_MINUTES,
  RESERVATION_HOLD_MINUTES,
  RESERVATION_EXPIRED_MESSAGE,
} from "./operations";
