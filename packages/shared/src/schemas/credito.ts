import { z } from "zod";
import { PAYMENT_METHODS } from "../enums";

const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.");

/**
 * O cancelamento de uma reserva, com o que fazer do dinheiro.
 *
 * Só o que foi pago (PAID) é distribuído, e por inteiro: crédito, reembolso e
 * retenção somam exatamente o pago — o servidor confere em centavos, sob
 * trava, contra o pago lido na hora. Crédito Festaê que estava aplicado na
 * reserva não entra na conta: ele volta ao saldo da cliente sozinho.
 */
export const cancelarReservaSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, "Diga o motivo do cancelamento.")
    .max(500, "O motivo pode ter até 500 caracteres."),
  credito: z.coerce.number().min(0).default(0),
  /** Quanto volta para a cliente. Sem `reembolsadoEm`, é reembolso a realizar. */
  reembolso: z.coerce.number().min(0).default(0),
  /**
   * Só quando a devolução JÁ foi feita: o dia em que o dinheiro saiu.
   * Ausente, o reembolso fica pendente e não mexe no caixa.
   */
  reembolsadoEm: diaSchema.optional(),
  /** Por onde a devolução já feita saiu. */
  formaDoReembolso: z.enum(PAYMENT_METHODS).optional(),
  retencao: z.coerce.number().min(0).default(0),
});
export type CancelarReservaInput = z.infer<typeof cancelarReservaSchema>;

/** Usar parte do crédito Festaê da cliente numa reserva. */
export const aplicarCreditoSchema = z.object({
  valor: z.coerce.number().positive("Informe o valor do crédito."),
  observacao: z.string().trim().max(500).optional(),
});
export type AplicarCreditoInput = z.infer<typeof aplicarCreditoSchema>;

/**
 * Desfazer uma utilização de crédito lançada por engano.
 *
 * Não apaga a utilização: grava o movimento contrário, apontando para ela, e
 * o extrato mostra as duas linhas. O motivo é obrigatório porque é o que
 * explica, daqui a um ano, por que duas linhas se anulam.
 */
export const estornarCreditoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(3, "Diga por que a utilização está sendo estornada.")
    .max(500),
});
export type EstornarCreditoInput = z.infer<typeof estornarCreditoSchema>;

/**
 * O destino de pagamentos recebidos depois do cancelamento.
 *
 * Mesma distribuição do cancelamento — crédito, reembolso, retenção —, sobre
 * o valor que chegou depois. A soma tem de ser exatamente esse valor; o
 * servidor confere contra o que está pendente na hora, sob trava.
 */
export const tratarPagamentoTardioSchema = z.object({
  credito: z.coerce.number().min(0).default(0),
  reembolso: z.coerce.number().min(0).default(0),
  /** Só quando a devolução já foi feita; ausente, fica reembolso a realizar. */
  reembolsadoEm: diaSchema.optional(),
  formaDoReembolso: z.enum(PAYMENT_METHODS).optional(),
  retencao: z.coerce.number().min(0).default(0),
  observacao: z.string().trim().max(500).optional(),
});
export type TratarPagamentoTardioInput = z.infer<typeof tratarPagamentoTardioSchema>;

/**
 * O registro de uma devolução que a Festaê já fez.
 *
 * Não transfere nada: a Festaê devolve por Pix ou outro meio, fora do
 * sistema, e registra aqui o dia em que o dinheiro saiu. `tratamentoComplementarId`
 * ausente quer dizer o reembolso do tratamento do cancelamento.
 */
export const registrarReembolsoSchema = z.object({
  tratamentoComplementarId: z.string().min(1).optional(),
  realizadoEm: diaSchema,
  forma: z.enum(PAYMENT_METHODS),
  observacao: z.string().trim().max(500).optional(),
});
export type RegistrarReembolsoInput = z.infer<typeof registrarReembolsoSchema>;
