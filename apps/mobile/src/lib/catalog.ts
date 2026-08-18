import type { ProductCategory } from "@festae/shared";

/** Remove acentos e caixa para "louça" casar com "louca". */
export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

// Só as categorias que o acervo tem. Louças e brinquedos tinham selos
// prontos aqui, prometendo "quantidade conferida" e "seguro para crianças"
// para itens que a Festaê não aluga.
const HIGHLIGHTS_BY_CATEGORY: Partial<Record<ProductCategory, Highlight[]>> = {
  MOBILIARIO: [
    { icon: "table-furniture", iconSet: "mci", label: "Estrutura\nreforçada" },
    { icon: "party-popper", iconSet: "mci", label: "Ideal para\neventos" },
    { icon: "spray-bottle", iconSet: "mci", label: "Higienizadas\ne cuidadas" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
  ILUMINACAO: [
    { icon: "shield-check-outline", iconSet: "mci", label: "Cabos\ntestados" },
    { icon: "lightbulb-on-outline", iconSet: "mci", label: "Lâmpadas\nconferidas" },
    { icon: "tools", iconSet: "mci", label: "Montagem\nopcional" },
    { icon: "store-outline", iconSet: "mci", label: "Retirada\ngrátis" },
  ],
};

export function highlightsFor(category: ProductCategory): Highlight[] {
  return HIGHLIGHTS_BY_CATEGORY[category] ?? DEFAULT_HIGHLIGHTS;
}

/**
 * " · 30 convidados", ou nada.
 *
 * O aplicativo não pergunta mais quantos convidados — a Festaê aluga
 * decoração, e painel ou arco não mudam porque a festa tem 20 ou 200
 * pessoas. Festas criadas antes disso guardam o número, e continuam
 * mostrando; as novas simplesmente não exibem a linha, em vez de anunciar
 * "a combinar" para algo que ninguém vai combinar.
 */
export function sufixoConvidados(guestCount: number | null | undefined) {
  return guestCount ? ` · ${guestCount} convidados` : "";
}

export function formatBRL(value: string | number) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}
