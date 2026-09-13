import { z } from "zod";
import { NATUREZAS_DO_GASTO } from "../financeiro";

/**
 * Um lançamento de saída, digitado no painel.
 *
 * `natureza` é obrigatória e não tem padrão de propósito. No painel antigo a
 * escolha era implícita — dependia da aba em que a pessoa estava — e era
 * exatamente isso que fazia balão virar patrimônio. Aqui a pergunta é feita.
 */
export const criarGastoSchema = z.object({
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
  observacao: z.string().max(500).optional().nullable(),
});

export const editarGastoSchema = criarGastoSchema.partial();

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
