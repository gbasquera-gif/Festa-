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

export const createThemeSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140),
  description: optionalText(1000),
  coverImageUrl: optionalUrl(),
  colorPalette: z.array(z.string()).default([]),
  suggestedEventTypes: z.array(z.enum(EVENT_TYPES)).default([]),
  active: z.boolean().default(true),
});
export type CreateThemeInput = z.infer<typeof createThemeSchema>;
export const updateThemeSchema = createThemeSchema.partial();
export type UpdateThemeInput = z.infer<typeof updateThemeSchema>;

export const createProductSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180),
  description: optionalText(1000),
  category: z.enum(PRODUCT_CATEGORIES).default("OUTRO"),
  unitPrice: z.coerce.number().min(0),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  imageUrl: optionalUrl(),
  partnerId: optionalId(),
  active: z.boolean().default(true),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;
export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const kitProductInputSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.coerce.number().int().min(1).default(1),
});

export const createKitSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(180),
  description: optionalText(1000),
  themeId: optionalId(),
  basePrice: z.coerce.number().min(0),
  coverImageUrl: optionalUrl(),
  images: z.array(z.string().url()).default([]),
  minGuests: z.coerce.number().int().min(0).default(0),
  maxGuests: z.coerce.number().int().min(1).default(9999),
  active: z.boolean().default(true),
  products: z.array(kitProductInputSchema).default([]),
});
export type CreateKitInput = z.infer<typeof createKitSchema>;
export const updateKitSchema = createKitSchema.partial();
export type UpdateKitInput = z.infer<typeof updateKitSchema>;
