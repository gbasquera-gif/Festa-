import { z } from "zod";
import { NATUREZAS_DO_GASTO } from "../financeiro";
import {
  AJUSTES_DE_DIA_INEXISTENTE,
  AJUSTES_DE_DIA_NAO_UTIL,
  INTERVALOS_DA_RECORRENCIA,
  LIMITE_DE_MESES_RETROATIVOS,
  MARCOS_DE_AVISO,
  SITUACOES_DA_CONTA,
  TIPOS_DE_VALOR,
} from "../contas-a-pagar";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");
const mes = z.string().regex(/^\d{4}-\d{2}$/, "Use o formato AAAA-MM.");
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((t) => (t ? t : null));

const camposDaRecorrencia = z.object({
  descricao: z.string().trim().min(2, "Diga que conta é esta.").max(200),
  natureza: z.enum(NATUREZAS_DO_GASTO, { message: "Escolha a natureza da despesa." }),
  categoria: textoOpcional(80),
  fornecedor: textoOpcional(120),
  tipoDeValor: z.enum(TIPOS_DE_VALOR, { message: "Diga se o valor é fixo ou variável." }),
  valorPrevisto: z.coerce.number().positive("O valor precisa ser maior que zero.").max(1_000_000),
  diaDoVencimento: z.coerce.number().int().min(1, "Dia de 1 a 31.").max(31, "Dia de 1 a 31."),
  dataFinal: dia.optional().nullable().transform((d) => d ?? null),
  ajusteDiaInexistente: z.enum(AJUSTES_DE_DIA_INEXISTENTE),
  ajusteDiaNaoUtil: z.enum(AJUSTES_DE_DIA_NAO_UTIL),
});

/**
 * Cadastro de despesa recorrente. Intervalo e data inicial só no cadastro:
 * mudar a cadência de uma conta que já gerou meses reescreveria quais meses
 * existem. Para isso, encerra-se esta e cadastra-se outra.
 */
export const criarRecorrenciaSchema = camposDaRecorrencia
  .extend({
    intervaloMeses: z.coerce
      .number()
      .int()
      .refine((n) => (INTERVALOS_DA_RECORRENCIA as readonly number[]).includes(n), "Escolha a frequência."),
    dataInicial: dia,
    /** Da tela: o mesmo envio, repetido, não cadastra duas vezes. */
    chave: z.string().uuid("Chave de envio inválida. Feche e abra o formulário de novo."),
  })
  .refine((r) => r.dataFinal === null || r.dataFinal >= r.dataInicial, {
    message: "A data final não pode ser antes da inicial.",
    path: ["dataFinal"],
  });

/**
 * Edição. Vale para as contas em aberto que vencem de hoje em diante e que
 * ainda estão como a recorrência gerou; pagas e passadas não mudam.
 */
export const editarRecorrenciaSchema = camposDaRecorrencia.partial();

/** Meses anteriores ao cadastro, gerados só porque alguém marcou. */
export const gerarRetroativasSchema = z.object({
  competencias: z.array(mes).min(1, "Marque ao menos um mês.").max(LIMITE_DE_MESES_RETROATIVOS),
});

/**
 * Registrar o pagamento de uma conta: o dia em que o dinheiro saiu (hoje ou
 * antes — nunca depois), o valor que saiu de fato e a forma.
 */
export const registrarPagamentoDeContaSchema = z.object({
  pagoEm: dia,
  valor: z.coerce.number().positive("O valor precisa ser maior que zero.").max(1_000_000),
  formaDePagamento: textoOpcional(80),
  observacao: textoOpcional(500),
});

export const resolverConferenciaSchema = z.discriminatedUnion("acao", [
  /** É a mesma conta: o lançamento manual passa a ser o mês da recorrência. */
  z.object({ acao: z.literal("VINCULAR"), gastoId: z.string().min(1) }),
  /** São contas diferentes: gera a do mês normalmente. */
  z.object({ acao: z.literal("GERAR") }),
  /** Este mês não terá conta (foi dispensado ou já resolvido por fora). */
  z.object({ acao: z.literal("DISPENSAR") }),
]);

export const filtroDeContasSchema = z.object({
  mes: mes.optional(),
  natureza: z.enum(NATUREZAS_DO_GASTO).optional(),
  fornecedor: z.string().trim().max(120).optional(),
  situacao: z.enum(SITUACOES_DA_CONTA).optional(),
});

export const configuracaoDeAvisosSchema = z.object({
  marcos: z
    .array(z.coerce.number().int())
    .max(MARCOS_DE_AVISO.length)
    .refine((ms) => ms.every((m) => (MARCOS_DE_AVISO as readonly number[]).includes(m)), "Marco de aviso inválido.")
    .transform((ms) => Array.from(new Set(ms)).sort((a, b) => b - a)),
  horaDoAviso: z.coerce.number().int().min(0).max(23),
  emailAtivo: z.boolean(),
  mostrarValorNoEmail: z.boolean(),
});

export const destinatarioDeAvisoSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200),
  nome: textoOpcional(120),
});

export const confirmarDestinatarioSchema = z.object({
  codigo: z.string().trim().regex(/^\d{6}$/, "O código tem 6 dígitos."),
});

export const ativarDestinatarioSchema = z.object({ ativo: z.boolean() });

export type CriarRecorrenciaInput = z.infer<typeof criarRecorrenciaSchema>;
export type EditarRecorrenciaInput = z.infer<typeof editarRecorrenciaSchema>;
export type GerarRetroativasInput = z.infer<typeof gerarRetroativasSchema>;
export type RegistrarPagamentoDeContaInput = z.infer<typeof registrarPagamentoDeContaSchema>;
export type ResolverConferenciaInput = z.infer<typeof resolverConferenciaSchema>;
export type FiltroDeContas = z.infer<typeof filtroDeContasSchema>;
export type ConfiguracaoDeAvisosInput = z.infer<typeof configuracaoDeAvisosSchema>;
export type DestinatarioDeAvisoInput = z.infer<typeof destinatarioDeAvisoSchema>;
export type ConfirmarDestinatarioInput = z.infer<typeof confirmarDestinatarioSchema>;
