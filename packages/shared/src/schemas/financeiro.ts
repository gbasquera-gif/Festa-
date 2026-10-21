import { z } from "zod";
import { NATUREZAS_DO_GASTO } from "../financeiro";

/**
 * Um lançamento de saída, digitado no painel.
 *
 * `natureza` é obrigatória e não tem padrão de propósito. No painel antigo a
 * escolha era implícita — dependia da aba em que a pessoa estava — e era
 * exatamente isso que fazia balão virar patrimônio. Aqui a pergunta é feita.
 */
const camposDoGasto = z.object({
  descricao: z.string().min(2, "Diga o que foi comprado.").max(200),
  natureza: z.enum(NATUREZAS_DO_GASTO, {
    message: "Escolha se isso vira acervo, some na festa ou é custeio.",
  }),
  valor: z.coerce.number().positive("O valor precisa ser maior que zero.").max(1_000_000),

  /**
   * Quando o dinheiro saiu. Em branco significa que ainda não saiu — é o que
   * separa uma conta a pagar de uma conta paga.
   */
  pagoEm: z.coerce.date().optional().nullable(),
  venceEm: z.coerce.date().optional().nullable(),

  categoria: z.string().max(80).optional().nullable(),
  formaDePagamento: z.string().max(80).optional().nullable(),
  fornecedor: z.string().max(120).optional().nullable(),
  observacao: z.string().max(500).optional().nullable(),

  /**
   * Preparação para depreciação futura.
   *
   * Nenhum cálculo os usa hoje, e a tela diz que o resultado não considera
   * depreciação. Existem para o dado começar a ser coletado: depreciação
   * sobre estimativa inventada seria pior que nenhuma, porque pareceria
   * precisa.
   */
  vidaUtilMeses: z.coerce.number().int().min(1).max(600).optional().nullable(),
  valorResidual: z.coerce.number().min(0).optional().nullable(),
});

export const criarGastoSchema = camposDoGasto
  .refine(
    (gasto) =>
      gasto.natureza === "ACERVO" ||
      (gasto.vidaUtilMeses == null && gasto.valorResidual == null),
    {
      message: "Vida útil e valor residual só valem para acervo — consumo e custeio não duram.",
      path: ["vidaUtilMeses"],
    },
  )
  .refine(
    (gasto) => gasto.valorResidual == null || gasto.valorResidual <= gasto.valor,
    {
      message: "O valor residual não pode ser maior que o valor de compra.",
      path: ["valorResidual"],
    },
  );

/**
 * Edição aceita campo a campo.
 *
 * Deriva do objeto base, e não do schema com as validações cruzadas: um
 * `.refine` transforma o schema em outra coisa, que não sabe fazer
 * `.partial()`. As duas regras cruzadas são reaplicadas aqui sobre o que
 * vier, ignorando o que não vier.
 */
export const editarGastoSchema = camposDoGasto.partial().refine(
  (gasto) =>
    gasto.natureza === undefined ||
    gasto.natureza === "ACERVO" ||
    (gasto.vidaUtilMeses == null && gasto.valorResidual == null),
  {
    message: "Vida útil e valor residual só valem para acervo.",
    path: ["vidaUtilMeses"],
  },
);

/** A meta de lucro de um mês. */
export const definirMetaSchema = z.object({
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM."),
  lucroAlvo: z.coerce.number().min(0).max(10_000_000),
});

/** O mês pedido pela tela, no formato AAAA-MM. */
export const mesQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM."),
});

export type CriarGastoInput = z.infer<typeof criarGastoSchema>;
export type EditarGastoInput = z.infer<typeof editarGastoSchema>;
export type DefinirMetaInput = z.infer<typeof definirMetaSchema>;
export type MesQuery = z.infer<typeof mesQuerySchema>;
