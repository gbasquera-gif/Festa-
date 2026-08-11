import { type ProductCategory } from "./enums";

/**
 * Categorias que a Festaê realmente usa no cadastro.
 *
 * O acervo é de decoração: painel, arco de balões, mesa posta, iluminação.
 * Não há cadeira para convidado, louça nem brinquedo — oferecer essas opções
 * no painel só convida a classificar errado uma peça que existe.
 *
 * O enum do banco continua inteiro de propósito. Remover valor de enum no
 * Postgres exige recriar o tipo e reescrever a coluna, e qualquer produto já
 * cadastrado numa categoria removida quebraria a leitura. Curar a lista de
 * escolha resolve o problema real — o que aparece para quem cadastra — sem
 * arriscar dado que já existe. Quando entrar louça ou brinquedo, é só
 * devolver a linha aqui.
 */
export const PRODUCT_CATEGORY_OPTIONS: ProductCategory[] = [
  "DECORACAO",
  "MOBILIARIO",
  "ILUMINACAO",
  "OUTRO",
];

/** Nome de exibição da categoria, o mesmo no aplicativo e no painel. */
export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  DECORACAO: "Decoração",
  MOBILIARIO: "Mesas e apoios",
  LOUCA: "Louças",
  ILUMINACAO: "Iluminação",
  BRINQUEDO: "Brinquedos",
  OUTRO: "Outros",
};
