import { z } from "zod";
import { EVENT_TYPES, PRODUCT_CATEGORIES } from "../enums";

export const createThemeSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140),
  description: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().optional(),
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
  description: z.string().max(1000).optional(),
  category: z.enum(PRODUCT_CATEGORIES).default("OUTRO"),
  unitPrice: z.coerce.number().min(0),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  imageUrl: z.string().url().optional(),
  partnerId: z.string().cuid().optional(),
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
  description: z.string().max(1000).optional(),
  themeId: z.string().cuid().optional(),
  basePrice: z.coerce.number().min(0),
  coverImageUrl: z.string().url().optional(),
  minGuests: z.coerce.number().int().min(0).default(0),
  maxGuests: z.coerce.number().int().min(1).default(9999),
  active: z.boolean().default(true),
  products: z.array(kitProductInputSchema).default([]),
});
export type CreateKitInput = z.infer<typeof createKitSchema>;
export const updateKitSchema = createKitSchema.partial();
export type UpdateKitInput = z.infer<typeof updateKitSchema>;
