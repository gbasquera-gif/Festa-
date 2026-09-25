import { z } from "zod";
import { EVENT_TYPES, PRODUCT_CATEGORIES } from "../enums";

// Colunas que aceitam nulo no banco chegam como `null` na resposta da API, e
// o formulário do painel devolve string vazia quando o usuário limpa o campo.
// `.optional()` sozinho recusa os dois — o que fazia a edição de qualquer
// registro existente falhar em silêncio. Estes ajudantes normalizam ambos
// para `null`, que é o que o banco espera para "sem valor".
// A união (em vez de z.preprocess) preserva o tipo de entrada como
// `string | null | undefined`, que é o que os formulários do painel usam.
const emptyToNull = (value: string | null | undefined) => value || null;

const optionalText = (max: number) =>
  z.string().max(max).or(z.literal("")).nullish().transform(emptyToNull);
const optionalUrl = () => z.string().url().or(z.literal("")).nullish().transform(emptyToNull);
const optionalId = () => z.string().cuid().or(z.literal("")).nullish().transform(emptyToNull);

// O slug é derivado do nome pela API, que também garante que não se repita.
// Ele continua opcional aqui porque o painel não pede mais esse campo: era
// um dado técnico que ninguém lê e que, digitado à mão, travava o cadastro
// de dois kits com o mesmo nome — coisa que acontece o tempo todo, já que o
// mesmo pacote é vendido em vários temas.
const slugOpcional = () => z.string().min(2).max(180).optional();

/** Os campos de um tema, sem valor padrão nenhum. */
const camposDoTema = {
  name: z.string().min(2).max(120),
  slug: slugOpcional(),
  description: optionalText(1000),
  coverImageUrl: optionalUrl(),
  colorPalette: z.array(z.string()),
  suggestedEventTypes: z.array(z.enum(EVENT_TYPES)),
  active: z.boolean(),
};

/** Criação: o que não vier recebe o padrão de um tema novo. */
export const createThemeSchema = z.object({
  ...camposDoTema,
  colorPalette: camposDoTema.colorPalette.default([]),
  suggestedEventTypes: camposDoTema.suggestedEventTypes.default([]),
  active: camposDoTema.active.default(true),
});
export type CreateThemeInput = z.infer<typeof createThemeSchema>;

/**
 * Atualização: campo ausente fica como está (mesma regra do produto). Com
 * `.partial()` da criação, renomear um tema zerava a paleta e as ocasiões.
 * Lista vazia enviada de propósito continua limpando.
 */
export const updateThemeSchema = z.object(camposDoTema).partial();
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

/** Os campos de um produto, sem valor padrão nenhum. */
const camposDoProduto = {
  name: z.string().min(2).max(160),
  slug: slugOpcional(),
  description: optionalText(1000),
  category: z.enum(PRODUCT_CATEGORIES),
  unitPrice: z.coerce.number().min(0),
  stockQuantity: z.coerce.number().int().min(0),
  imageUrl: optionalUrl(),
  partnerId: optionalId(),
  active: z.boolean(),
};

/** Criação: o que não vier recebe o padrão de um produto novo. */
export const createProductSchema = z.object({
  ...camposDoProduto,
  category: camposDoProduto.category.default("OUTRO"),
  stockQuantity: camposDoProduto.stockQuantity.default(0),
  active: camposDoProduto.active.default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Atualização: campo ausente fica como está no banco.
 *
 * Não pode derivar da criação com `.partial()`: os `.default()` continuam
 * valendo dentro dele, e desativar um produto mandando só `active` zerava o
 * estoque e voltava a categoria para "OUTRO". Aqui os campos são os mesmos,
 * sem padrão — só muda o que foi enviado, e `0` e `false` enviados valem.
 */
export const updateProductSchema = z.object(camposDoProduto).partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const kitProductInputSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).default(1),
});

/** Os campos de um kit, sem valor padrão nenhum. */
const camposDoKit = {
  name: z.string().min(2).max(160),
  slug: slugOpcional(),
  description: optionalText(1000),
  themeId: optionalId(),
  basePrice: z.coerce.number().min(0),
  coverImageUrl: optionalUrl(),
  images: z.array(z.string().url()),
  minGuests: z.coerce.number().int().min(0),
  maxGuests: z.coerce.number().int().min(1),
  active: z.boolean(),
  products: z.array(kitProductInputSchema),
};

/** Criação: o que não vier recebe o padrão de um kit novo. */
export const createKitSchema = z.object({
  ...camposDoKit,
  images: camposDoKit.images.default([]),
  minGuests: camposDoKit.minGuests.default(0),
  maxGuests: camposDoKit.maxGuests.default(9999),
  active: camposDoKit.active.default(true),
  products: camposDoKit.products.default([]),
});
export type CreateKitInput = z.infer<typeof createKitSchema>;

/**
 * Atualização: campo ausente fica como está (mesma regra do produto).
 *
 * Com `.partial()` da criação, `products` ausente virava `[]`, e o serviço
 * — que troca a composição sempre que recebe a lista — apagava todas as
 * peças do kit numa simples troca de nome. Agora a composição só muda
 * quando `products` é enviado; `[]` enviado de propósito continua limpando.
 */
export const updateKitSchema = z.object(camposDoKit).partial();
export type UpdateKitInput = z.infer<typeof updateKitSchema>;
