import type { ProductCategory } from "@festae/shared";

/**
 * Metadados de apresentação das categorias do catálogo. O backend só guarda o
 * enum — rótulo, ícone e ordem de exibição são decisão de produto e vivem aqui.
 */
export interface CategoryMeta {
  key: ProductCategory;
  label: string;
  /** Nome curto usado nos círculos da home, onde não cabe o rótulo inteiro. */
  shortLabel: string;
  icon: string;
  /** "ion" = Ionicons, "mci" = MaterialCommunityIcons. */
  iconSet: "ion" | "mci";
  description: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: "DECORACAO",
    label: "Decoração",
    shortLabel: "Decoração",
    icon: "balloon",
    iconSet: "mci",
    description: "Painéis, arcos, balões e tudo que dá cara de festa ao ambiente.",
  },
  {
    key: "MOBILIARIO",
    label: "Mesas e Cadeiras",
    shortLabel: "Mesas e\nCadeiras",
    icon: "table-chair",
    iconSet: "mci",
    description: "Mesas, cadeiras, aparadores e mobiliário para acomodar os convidados.",
  },
  {
    key: "LOUCA",
    label: "Louças",
    shortLabel: "Louças",
    icon: "silverware-fork-knife",
    iconSet: "mci",
    description: "Pratos, taças, talheres e travessas para servir com capricho.",
  },
  {
    key: "ILUMINACAO",
    label: "Iluminação",
    shortLabel: "Iluminação",
    icon: "bulb-outline",
    iconSet: "ion",
    description: "Cordões de luz, spots e luminárias para dar clima à celebração.",
  },
  {
    key: "BRINQUEDO",
    label: "Brinquedos",
    shortLabel: "Brinquedos",
    icon: "teddy-bear",
    iconSet: "mci",
    description: "Pula-pula, piscina de bolinhas e diversão garantida para a criançada.",
  },
  {
    key: "OUTRO",
    label: "Outros",
    shortLabel: "Outros",
    icon: "sparkles-outline",
    iconSet: "ion",
    description: "Itens complementares que fazem a diferença no dia da festa.",
  },
];

export const CATEGORY_BY_KEY = Object.fromEntries(
  CATEGORIES.map((category) => [category.key, category]),
) as Record<ProductCategory, CategoryMeta>;

export function isProductCategory(value: string): value is ProductCategory {
  return value in CATEGORY_BY_KEY;
}

/**
 * Diferenciais exibidos na tela de detalhe. São promessas de serviço da Festaê
 * (valem para todo o catálogo), variando só pela categoria do item.
 */
export interface Highlight {
  icon: string;
  iconSet: "ion" | "mci";
  label: string;
}

const DEFAULT_HIGHLIGHTS: Highlight[] = [
  { icon: "tools", iconSet: "mci", label: "Montagem\ninclusa" },
  { icon: "truck-fast-outline", iconSet: "mci", label: "Entrega\nrápida" },
  { icon: "calendar-clock", iconSet: "mci", label: "Retirada\nflexível" },
  { icon: "spray-bottle", iconSet: "mci", label: "Limpeza\ninclusa" },
];

const HIGHLIGHTS_BY_CATEGORY: Partial<Record<ProductCategory, Highlight[]>> = {
  MOBILIARIO: [
    { icon: "table-furniture", iconSet: "mci", label: "Estrutura\nreforçada" },
    { icon: "seat-outline", iconSet: "mci", label: "Conforto\ngarantido" },
    { icon: "party-popper", iconSet: "mci", label: "Ideal para\neventos" },
    { icon: "spray-bottle", iconSet: "mci", label: "Higienizadas\ne cuidadas" },
  ],
  LOUCA: [
    { icon: "dishwasher", iconSet: "mci", label: "Higienizadas\ne cuidadas" },
    { icon: "truck-fast-outline", iconSet: "mci", label: "Entrega\nrápida" },
    { icon: "package-variant-closed", iconSet: "mci", label: "Embalagem\nsegura" },
    { icon: "calendar-clock", iconSet: "mci", label: "Retirada\nflexível" },
  ],
  ILUMINACAO: [
    { icon: "tools", iconSet: "mci", label: "Instalação\ninclusa" },
    { icon: "shield-check-outline", iconSet: "mci", label: "Cabos\ntestados" },
    { icon: "truck-fast-outline", iconSet: "mci", label: "Entrega\nrápida" },
    { icon: "calendar-clock", iconSet: "mci", label: "Retirada\nflexível" },
  ],
  BRINQUEDO: [
    { icon: "shield-check-outline", iconSet: "mci", label: "Seguro para\ncrianças" },
    { icon: "tools", iconSet: "mci", label: "Montagem\ninclusa" },
    { icon: "spray-bottle", iconSet: "mci", label: "Higienizado\na cada uso" },
    { icon: "calendar-clock", iconSet: "mci", label: "Retirada\nflexível" },
  ],
};

export function highlightsFor(category: ProductCategory): Highlight[] {
  return HIGHLIGHTS_BY_CATEGORY[category] ?? DEFAULT_HIGHLIGHTS;
}

/**
 * Cores em que o item aparece no catálogo. O produto não guarda cor própria —
 * a informação real vem da paleta dos temas dos kits que o incluem.
 */
export function paletteForProduct(
  productId: string,
  kits: { theme: { colorPalette: string[] } | null; products: { productId: string }[] }[],
) {
  const palette = kits
    .filter((kit) => kit.products.some((link) => link.productId === productId))
    .flatMap((kit) => kit.theme?.colorPalette ?? []);

  return [...new Set(palette)];
}

export function formatBRL(value: string | number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}
