import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  phone: z.string().min(8).max(20).optional(),
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
