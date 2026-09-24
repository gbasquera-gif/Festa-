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
  PAYMENT_METHOD_LABEL,
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
  PERCENTUAL_DO_SINAL,
  PERCENTUAL_DO_SALDO,
  saldoAPagar,
  DELIVERY_UNAVAILABLE_MESSAGE,
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
  PIX_EXPIRATION_MINUTES,
  RESERVATION_HOLD_MINUTES,
  RESERVATION_EXPIRED_MESSAGE,
} from "./operations";

export {
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
  MANUAL_SALE_CHANNELS,
  saleChannelLabel,
} from "./sale-channels";
export type { SaleChannel } from "./sale-channels";

export {
  RESERVATION_TASKS,
  RESERVATION_TASK_LABELS,
  PREPARATION_STAGES,
  REGUA,
  SITUACOES,
  SITUACAO_LABELS,
  diasAteAFesta,
  etapaDaRegua,
  etapaQueCobra,
  situacaoDaReserva,
} from "./operacao";
export type {
  ReservationTaskKey,
  PreparationStage,
  EtapaDaRegua,
  Situacao,
  EntradaDoSemaforo,
} from "./operacao";

export {
  FESTAE_CONTATO,
  montarComprovante,
  numeroDoContrato,
} from "./comprovante";
export type {
  DadosDoComprovante,
  EntradaDoComprovante,
  ItemDoComprovante,
  PagamentoDoComprovante,
} from "./comprovante";

export {
  criarGastoSchema,
  editarGastoSchema,
  definirMetaSchema,
  mesQuerySchema,
} from "./schemas/financeiro";
export type {
  CriarGastoInput,
  EditarGastoInput,
  DefinirMetaInput,
  MesQuery,
} from "./schemas/financeiro";

export {
  REGIMES,
  REGIME_LABEL,
  NATUREZAS_DO_GASTO,
  NATUREZA_LABEL,
  NATUREZAS_DE_DESPESA,
  mesEmChapeco,
  recebidoDoContrato,
  saldoDoContrato,
  receitaPorCompetencia,
  receitaPorCaixa,
  recebidoSemData,
  despesaDoMes,
  acervoDoMes,
  acervoAcumulado,
  gastoAcumulado,
  totalAReceber,
  totalRecebido,
  linhaDeRitmo,
  indicadoresDoMes,
  SITUACOES_DE_PAGAMENTO,
  SITUACAO_DE_PAGAMENTO_LABEL,
  SITUACAO_DE_PAGAMENTO_NOTA,
  SITUACOES_EM_ABERTO,
  situacaoDePagamento,
  vencimentoDoSaldo,
  resumoDaCarteira,
  resultadoOperacionalDoMes,
  mesAnterior,
  mesesDoAno,
  serieDoAno,
  acumuladoNoAno,
  variacao,
} from "./financeiro";
export type {
  Regime,
  NaturezaDoGasto,
  RecebimentoApurado,
  ContratoApurado,
  GastoApurado,
  ResultadoDoMes,
  LinhaDeRitmo,
  IndicadoresDoMes,
  SituacaoDePagamento,
  ResumoDaCarteira,
  MesDaSerie,
  AcumuladoDoAno,
  Variacao,
} from "./financeiro";

export {
  SITUACOES_DO_RECEBIMENTO,
  SITUACAO_DO_RECEBIMENTO_LABEL,
  situacaoDoRecebimento,
  estaQuitado,
} from "./recebimento";
export type { SituacaoDoRecebimento } from "./recebimento";

export {
  FUSO_DE_CHAPECO_EM_MINUTOS,
  dataDaFestaSchema,
  diaDaFesta,
  diaEmChapeco,
  formatarDataDaFesta,
  normalizarDataDaFesta,
} from "./data-da-festa";

export {
  manualReservationSchema,
  marcarTarefaSchema,
  corrigirDadosSchema,
  alterarDataSchema,
  editarReservaSchema,
  registrarPagamentoSchema,
  descontoEmbutido,
  totalDaVendaManual,
} from "./schemas/manual-reservation";
export type {
  ManualReservationInput,
  MarcarTarefaInput,
  CorrigirDadosInput,
  AlterarDataInput,
  EditarReservaInput,
  RegistrarPagamentoInput,
} from "./schemas/manual-reservation";

export {
  ABAS_DE_RESERVA,
  ABA_DE_RESERVA_LABEL,
  ABA_DE_RESERVA_NOTA,
  GRUPOS_DE_PROXIMIDADE,
  GRUPO_DE_PROXIMIDADE_LABEL,
  diasEntre,
  ehDaAba,
  grupoDeProximidade,
  ordenarParaOperacao,
  situacaoOperacional,
} from "./reservas";
export type {
  AbaDeReserva,
  GrupoDeProximidade,
  ReservaClassificavel,
  SituacaoOperacional,
} from "./reservas";

export {
  CATEGORIAS_DA_PERDA,
  CATEGORIA_DA_PERDA_LABEL,
  converterOrcamentoSchema,
  STATUS_DO_ORCAMENTO,
  STATUS_DO_ORCAMENTO_LABEL,
  STATUS_DO_ORCAMENTO_NOTA,
  TIPOS_DA_LINHA,
  TIPO_DA_LINHA_LABEL,
  aprovarPropostaSchema,
  calcularOrcamento,
  calcularSinal,
  exigeNovaVersao,
  linhaDoOrcamentoSchema,
  mensagemDaProposta,
  orcamentoSchema,
  podeSerAprovada,
  primeiroNome,
  recusarOrcamentoSchema,
  situacaoDoOrcamento,
  totalDaLinha,
  valorOficialDoOrcamento,
} from "./orcamento";
export type {
  AprovarPropostaInput,
  CategoriaDaPerda,
  ConverterOrcamentoInput,
  LinhaDoOrcamento,
  OrcamentoInput,
  StatusDoOrcamento,
  TipoDaLinha,
  TotaisDoOrcamento,
} from "./orcamento";

export { formasDoTelefone, normalizarTelefone } from "./telefone";

export {
  BASE_MINIMA_PARA_TAXA,
  CANAL_HISTORICO,
  CANAL_NAO_INFORMADO,
  DIAS_DA_SEMANA,
  DIA_DA_SEMANA_LABEL,
  MODELOS_DE_ATENDIMENTO,
  MODELO_DE_ATENDIMENTO_LABEL,
  ajustesComerciais,
  canalDaVenda,
  diaDaSemanaDaFesta,
  distribuir,
  funilDePropostas,
  janelaFutura,
  mesDaFesta,
  modeloDeAtendimento,
  periodoComercial,
  rotuloDoCanal,
  taxa,
  ultimosDozeMeses,
} from "./comercial";
export type {
  AjustesComerciais,
  DiaDaSemana,
  FatiaDaDistribuicao,
  FunilDePropostas,
  ModeloDeAtendimento,
  PeriodoComercial,
  PropostaDoFunil,
  Taxa,
} from "./comercial";
export {
  LIMITE_DO_REGISTRO,
  caminhoDe,
  destinoDoVoltar,
  registrarVisita,
  rotaDeRetorno,
} from "./navegacao";
