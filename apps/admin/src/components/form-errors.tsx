import type { FieldErrors } from "react-hook-form";

/**
 * Resumo dos erros de validação do formulário.
 *
 * O react-hook-form simplesmente não chama o `onSubmit` quando a validação
 * falha. Sem nada renderizado, o clique em "Salvar" não produz reação
 * nenhuma e parece que o botão está quebrado — foi exatamente o que
 * aconteceu ao editar produtos com campos nulos vindos da API.
 */
export function FormErrors({ errors }: { errors: FieldErrors }) {
  const messages = Object.entries(errors)
    .map(([field, error]) => {
      const message = (error as { message?: string } | undefined)?.message;
      return message ? { field, message } : null;
    })
    .filter((entry): entry is { field: string; message: string } => entry !== null);

  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p className="font-medium">Não foi possível salvar:</p>
      <ul className="mt-1 list-inside list-disc">
        {messages.map(({ field, message }) => (
          <li key={field}>
            <span className="font-medium">{field}</span>: {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
