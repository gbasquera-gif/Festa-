import { z } from "zod";
import { EVENT_TYPES } from "../enums";

export const availabilityQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato AAAA-MM."),

  /**
   * O que a pessoa está montando, para o calendário responder à pergunta
   * certa. "Este dia está livre?" depende do que ela quer: a agenda pode ter
   * vaga e o painel daquele tema já estar reservado. Sem isso, o dia aparece
   * verde e a recusa só chega no fim, depois de ela ter criado conta.
   *
   * Opcional porque o mesmo calendário é usado antes de haver kit escolhido.
   */
  kitId: z.string().cuid().optional(),

  /**
   * Itens avulsos no formato `id:quantidade,id:quantidade` — cabe na URL e
   * mantém a consulta em GET, que o navegador e o React Query já sabem
   * cachear.
   */
  items: z
    .string()
    .regex(/^[a-z0-9]+:\d+(,[a-z0-9]+:\d+)*$/i, "Use o formato id:quantidade,id:quantidade.")
    .optional(),
});
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const createEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  date: z.coerce.date(),
  /**
   * Quantos convidados. Opcional de propósito: muita gente reserva a data
   * antes de fechar a lista, e exigir o número no primeiro passo parava
   * quem ainda não sabia. Vazio vira "a combinar".
   */
  guestCount: z.coerce.number().int().min(1).max(2000).optional(),
  budgetGoal: z.coerce.number().min(0).optional(),
  themeId: z.string().cuid().optional(),
  address: z.string().max(255).optional(),
  neighborhood: z.string().max(120).optional(),
  /**
   * Cidade da festa. Define se a entrega pode ser oferecida — por isso é
   * perguntada logo no início, e não junto do endereço.
   */
  city: z.string().min(2).max(120).optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
