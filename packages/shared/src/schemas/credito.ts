import { z } from "zod";

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
  reembolso: z.coerce.number().min(0).default(0),
  /** O dia em que o reembolso saiu. Obrigatório quando há reembolso. */
  reembolsadoEm: diaSchema.optional(),
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
