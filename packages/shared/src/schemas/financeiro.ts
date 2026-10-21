import { z } from "zod";
import { NATUREZAS_DO_GASTO } from "../financeiro";
import { CATEGORIAS_DA_RETIRADA, FORMAS_DA_RETIRADA } from "../retiradas";

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

/* ------------------------------------------------------------------ *
 * Retiradas dos sócios
 * ------------------------------------------------------------------ */

const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

/** Cadastro de sócio: só o nome. */
export const socioSchema = z.object({
  nome: z.string().trim().min(2, "Diga o nome do sócio.").max(120),
});
export const editarSocioSchema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  ativo: z.boolean().optional(),
});

const camposDaRetirada = z.object({
  socioId: z.string().min(1, "Escolha o sócio."),
  categoria: z.enum(CATEGORIAS_DA_RETIRADA, { message: "Escolha a categoria da retirada." }),
  valor: z.coerce.number().positive("O valor precisa ser maior que zero.").max(10_000_000),
  /** O dia em que o dinheiro saiu. */
  retiradaEm: diaSchema,
  forma: z.enum(FORMAS_DA_RETIRADA, { message: "Escolha a forma da transferência." }),
  descricao: z.string().trim().max(500).optional().nullable(),
});

/** `chave` vem da tela: o mesmo envio, repetido, não lança duas vezes. */
export const registrarRetiradaSchema = camposDaRetirada.extend({
  chave: z.string().uuid("Chave de envio inválida. Feche e abra o formulário de novo."),
});

/** Editar exige dizer por quê: o antes e o depois ficam no histórico. */
export const editarRetiradaSchema = camposDaRetirada.partial().extend({
  justificativa: z.string().trim().min(10, "Explique a alteração em ao menos 10 caracteres.").max(500),
});

export const estornarRetiradaSchema = z.object({
  motivo: z.string().trim().min(10, "Explique o estorno em ao menos 10 caracteres.").max(500),
});

/**
 * O recorte da lista de retiradas. `de`/`ate` valem sobre `ano`/`mes`; sem
 * nada, é o histórico inteiro.
 */
export const filtroDeRetiradasSchema = z.object({
  ano: z.string().regex(/^\d{4}$/).optional(),
  mes: z.string().regex(/^\d{2}$|^todos$/).optional(),
  de: diaSchema.optional(),
  ate: diaSchema.optional(),
  socioId: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIAS_DA_RETIRADA).optional(),
  incluirEstornadas: z.enum(["sim", "nao"]).optional(),
});

export type SocioInput = z.infer<typeof socioSchema>;
export type EditarSocioInput = z.infer<typeof editarSocioSchema>;
export type RegistrarRetiradaInput = z.infer<typeof registrarRetiradaSchema>;
export type EditarRetiradaInput = z.infer<typeof editarRetiradaSchema>;
export type EstornarRetiradaInput = z.infer<typeof estornarRetiradaSchema>;
export type FiltroDeRetiradas = z.infer<typeof filtroDeRetiradasSchema>;
