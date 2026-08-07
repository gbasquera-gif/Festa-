import { z } from "zod";
import { ROLES } from "../enums";

export const signupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  phone: z.string().min(8).max(20).optional(),
  // Aceite obrigatório e explícito. Validar no schema garante que nenhuma
  // conta nasça sem consentimento registrado, mesmo que alguém chame a API
  // fora do aplicativo.
  acceptedTerms: z.literal(true, {
    message: "É preciso aceitar os Termos de Uso e a Política de Privacidade.",
  }),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// A senha é pedida de novo para que um aparelho desbloqueado por outra
// pessoa não consiga apagar a conta com um toque.
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

// Reset feito por um admin pelo painel, para quem perdeu a senha e pediu
// ajuda pelo WhatsApp. Mesmo mínimo do cadastro, para não abrir uma porta
// de senha fraca por trás.
export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Edição de conta pelo painel: corrigir e-mail digitado errado, atualizar
// nome, promover alguém da equipe. Todos os campos são opcionais para que o
// painel possa enviar só o que mudou.
export const updateUserSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    email: z.string().email().optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Envie ao menos um campo para atualizar.",
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
