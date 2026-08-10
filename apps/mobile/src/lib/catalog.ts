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
 * Diferenciais exibidos na tela de detalhe.
 *
 * São promessas de serviço, então precisam ser verdade. Já foram por água
 * abaixo "Montagem inclusa" e "Entrega rápida": desde que entrega e montagem
 * viraram opcionais e pagas, esses selos contradiziam o resumo do pedido e
 * os Termos de Uso — o cliente lia "inclusa" na vitrine e via "+ R$ 50" no
 * checkout. Antes de acrescentar um selo aqui, confira se a operação cumpre.
 */
export interface Highlight {
  icon: string;
  iconSet: "ion" | "mci";
  label: string;
}

const DEFAULT_HIGHLIGHTS: Highlight[] = [
  { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  { icon: "truck-outline", iconSet: "mci", label: "Entrega\nopcional" },
  { icon: "tools", iconSet: "mci", label: "Montagem\nopcional" },
  { icon: "spray-bottle", iconSet: "mci", label: "Higienizado\na cada uso" },
];

const HIGHLIGHTS_BY_CATEGORY: Partial<Record<ProductCategory, Highlight[]>> = {
  MOBILIARIO: [
    { icon: "table-furniture", iconSet: "mci", label: "Estrutura\nreforçada" },
    { icon: "party-popper", iconSet: "mci", label: "Ideal para\neventos" },
    { icon: "spray-bottle", iconSet: "mci", label: "Higienizadas\ne cuidadas" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
  LOUCA: [
    { icon: "dishwasher", iconSet: "mci", label: "Higienizadas\ne cuidadas" },
    { icon: "package-variant-closed", iconSet: "mci", label: "Embalagem\nsegura" },
    { icon: "counter", iconSet: "mci", label: "Quantidade\nconferida" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
  ILUMINACAO: [
    { icon: "shield-check-outline", iconSet: "mci", label: "Cabos\ntestados" },
    { icon: "lightbulb-on-outline", iconSet: "mci", label: "Lâmpadas\nconferidas" },
    { icon: "tools", iconSet: "mci", label: "Montagem\nopcional" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
  BRINQUEDO: [
    { icon: "shield-check-outline", iconSet: "mci", label: "Seguro para\ncrianças" },
    { icon: "spray-bottle", iconSet: "mci", label: "Higienizado\na cada uso" },
    { icon: "tools", iconSet: "mci", label: "Montagem\nopcional" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
};

export function highlightsFor(category: ProductCategory): Highlight[] {
  return HIGHLIGHTS_BY_CATEGORY[category] ?? DEFAULT_HIGHLIGHTS;
}

export function formatBRL(value: string | number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}
