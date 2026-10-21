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
  "AGUARDANDO_DEVOLUCAO",
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

/**
 * A forma de pagamento como se escreve para gente ler.
 *
 * Um mapa só, porque o mesmo pagamento aparece no formulário de venda
 * manual, no diálogo de registrar recebimento e no comprovante que a cliente
 * guarda. Escrito à mão em cada tela, "CARTAO" acabava saindo cru num deles.
 */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  OUTRO: "Outro",
};

export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED", "ANULADO"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** O status de um pagamento como se lê na tela. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "a receber",
  PAID: "recebido",
  FAILED: "encerrado sem pagamento",
  REFUNDED: "estornado",
  ANULADO: "anulado por correção",
};

/**
 * Como o pagamento chegou ao sistema (`Payment.origem`). Nulo nos antigos e
 * nos do checkout do Mercado Pago.
 */
export const ORIGENS_DO_PAGAMENTO = ["REGISTRO_MANUAL", "APROVACAO_MANUAL_DA_PROPOSTA"] as const;
export type OrigemDoPagamento = (typeof ORIGENS_DO_PAGAMENTO)[number];

export const ORIGEM_DO_PAGAMENTO_LABEL: Record<OrigemDoPagamento, string> = {
  REGISTRO_MANUAL: "registrado pela equipe",
  APROVACAO_MANUAL_DA_PROPOSTA: "Pix externo · registrado na aprovação manual",
};

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
