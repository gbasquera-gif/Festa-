/**
 * Formação de preço de um pedido da Festaê.
 *
 * Tudo que envolve dinheiro passa por aqui — app, API e painel calculam o
 * mesmo valor porque calculam com a mesma função. Se cada camada fizesse a
 * própria conta, bastaria um arredondamento diferente para o cliente ver um
 * valor no resumo e outro no Pix, que é o pior erro possível num produto de
 * locação.
 *
 * Regras oficiais do negócio (17/08/2026):
 *   retirada          grátis, na sede
 *   entrega           R$ 20,00, exclusivamente em Chapecó
 *   entrega+montagem  R$ 70,00 (a montagem custa R$ 50,00 e só existe junto
 *                     da entrega — se a equipe vai montar, ela já leva)
 *   pagamento         50% de sinal na reserva, 50% na retirada/entrega
 *
 * Estes valores são constantes porque hoje existe uma empresa só. Se um dia a
 * plataforma atender outras (ver docs/VISAO-SAAS.md), viram configuração de
 * cada empresa — e a migração só continua barata enquanto ninguém ler estas
 * constantes fora daqui. Precisou do valor em outro arquivo? Passe por
 * `calculateOrderPricing`, não importe a constante.
 */

/** Taxa fixa de entrega. Vale só para Chapecó. */
export const DELIVERY_FEE = 20;

/**
 * Taxa fixa de montagem no local.
 *
 * Independente da logística: a equipe vai montar no local da festa tanto
 * faz quem levou os itens até lá. As quatro combinações são vendáveis —
 * retirada com e sem montagem, entrega com e sem montagem.
 *
 * Houve uma versão em que montagem exigia entrega. A regra foi revista pela
 * operação: quem retira o material ainda pode contratar a equipe para montar.
 */
export const ASSEMBLY_FEE = 50;

/** O que a cliente paga escolhendo entrega e montagem juntas. */
export const DELIVERY_WITH_ASSEMBLY_FEE = DELIVERY_FEE + ASSEMBLY_FEE;

/** Única cidade atendida com entrega no lançamento. */
export const DELIVERY_CITY = "Chapecó";

/** Fração paga na reserva. O restante é pago na retirada/entrega. */
export const DEPOSIT_RATE = 0.5;

export const DELIVERY_UNAVAILABLE_MESSAGE =
  "No momento, realizamos entregas somente em Chapecó. Para outras cidades, a retirada deverá ser realizada na Festaê.";

export type Fulfillment = "PICKUP" | "DELIVERY";

/**
 * Compara nomes de cidade ignorando acento, caixa e espaço sobrando.
 * "chapeco", "CHAPECÓ" e " Chapecó " são a mesma cidade — errar isso
 * cobraria entrega de quem não pode receber, ou negaria a quem pode.
 */
export function isDeliveryCity(city: string | null | undefined): boolean {
  return normalizeCity(city) === normalizeCity(DELIVERY_CITY);
}

function normalizeCity(city: string | null | undefined): string {
  return (city ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Converte reais em centavos inteiros.
 *
 * Toda a conta acontece em centavos, não em reais. Em ponto flutuante,
 * 0.1 + 0.2 dá 0.30000000000000004 e metade de 570,01 dá 285,00499999…,
 * que arredondaria para R$ 285,00 e faria o sinal perder um centavo do
 * cliente. Em inteiro isso não acontece: 57001 / 2 arredonda para 28501.
 */
export function toCentsInt(value: number): number {
  return Math.round(value * 100);
}

/** Volta de centavos inteiros para reais, já arredondado. */
export function fromCentsInt(cents: number): number {
  return cents / 100;
}

/** Arredonda um valor em reais para centavos. */
export function toCents(value: number): number {
  return fromCentsInt(toCentsInt(value));
}

/**
 * Divide um total no sinal da reserva e no saldo da retirada/entrega.
 *
 * Existe separada porque o pagamento precisa dividir um total que já está
 * gravado no pedido, sem refazer a conta dos produtos. O saldo é sempre a
 * diferença, para que sinal + saldo feche o total ao centavo.
 */
export function splitPayment(total: number): { deposit: number; balance: number } {
  const totalCents = toCentsInt(total);
  const depositCents = Math.round(totalCents * DEPOSIT_RATE);
  return {
    deposit: fromCentsInt(depositCents),
    balance: fromCentsInt(totalCents - depositCents),
  };
}

export interface PricingInput {
  /** Preço do kit escolhido, ou 0 quando não há kit. */
  subtotalKit: number;
  /** Soma dos produtos avulsos (preço unitário × quantidade). */
  subtotalExtras: number;
  fulfillment: Fulfillment;
  assembly: boolean;
  /** Cidade da festa. Define se a entrega é possível. */
  city: string | null | undefined;
}

export interface PricingResult {
  subtotalKit: number;
  subtotalExtras: number;
  /** Kit + extras, antes dos serviços. */
  subtotalProducts: number;
  deliveryFee: number;
  assemblyFee: number;
  total: number;
  /** 50% pagos na reserva. */
  deposit: number;
  /** 50% pagos na retirada/entrega. Sempre total − deposit. */
  balance: number;
}

/**
 * Calcula a formação completa do valor de um pedido.
 *
 * Entrega fora de Chapecó não é cobrada nem barrada aqui: esta função só
 * calcula. Quem escolhe uma cidade sem entrega simplesmente não paga a
 * taxa — impedir a escolha é papel de quem valida a entrada
 * (`checkFulfillment`), para que a regra de negócio apareça como
 * erro claro para o usuário e não como um total silenciosamente errado.
 */
export function calculateOrderPricing(input: PricingInput): PricingResult {
  const kitCents = toCentsInt(input.subtotalKit);
  const extrasCents = toCentsInt(input.subtotalExtras);
  const productsCents = kitCents + extrasCents;

  const entregando = input.fulfillment === "DELIVERY" && isDeliveryCity(input.city);
  const deliveryCents = entregando ? toCentsInt(DELIVERY_FEE) : 0;
  // Montagem não depende de retirada ou entrega: a equipe monta no local da
  // festa mesmo quando foi a cliente quem buscou os itens.
  //
  // Depende, sim, da cidade. Quem não recebe entrega também não recebe
  // montagem — a equipe teria que viajar até lá do mesmo jeito. Cobrar a
  // montagem fora da área atendida venderia um serviço que ninguém presta.
  const noAtendimento = isDeliveryCity(input.city);
  const assemblyCents = input.assembly && noAtendimento ? toCentsInt(ASSEMBLY_FEE) : 0;

  const totalCents = productsCents + deliveryCents + assemblyCents;

  // O saldo é sempre a diferença, nunca um segundo cálculo de 50%: assim
  // sinal + saldo fecha exatamente o total mesmo em valor ímpar
  // (R$ 570,01 → 285,01 de sinal e 285,00 de saldo, nunca 285,01 + 285,01).
  const { deposit, balance } = splitPayment(fromCentsInt(totalCents));

  return {
    subtotalKit: fromCentsInt(kitCents),
    subtotalExtras: fromCentsInt(extrasCents),
    subtotalProducts: fromCentsInt(productsCents),
    deliveryFee: fromCentsInt(deliveryCents),
    assemblyFee: fromCentsInt(assemblyCents),
    total: fromCentsInt(totalCents),
    deposit,
    balance,
  };
}

/**
 * Diz se a combinação escolhida é permitida, e por quê não quando não é.
 * Usada pela API antes de gravar e pelo app antes de deixar escolher.
 */
export function checkFulfillment(
  fulfillment: Fulfillment,
  city: string | null | undefined,
  // Continua no parâmetro por compatibilidade com quem chama, mas não
  // restringe nada: montagem é vendável com retirada e com entrega.
  _assembly = false,
): { allowed: true } | { allowed: false; reason: string } {
  if (fulfillment === "DELIVERY" && !isDeliveryCity(city)) {
    return { allowed: false, reason: DELIVERY_UNAVAILABLE_MESSAGE };
  }
  return { allowed: true };
}
