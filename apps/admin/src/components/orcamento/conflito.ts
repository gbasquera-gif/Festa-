import { ApiError } from "@/lib/api";

/**
 * O 409 de disponibilidade traz os conflitos detalhados.
 *
 * Mostrar só "erro" esconderia exatamente a informação que permite decidir:
 * qual peça faltou, e para quando. Usado pela conversão, pela confirmação do
 * sinal e pela aprovação manual — a mesma frase nos três.
 */
export function mensagemDeConflito(e: unknown): string {
  if (e instanceof ApiError && e.detalhes?.conflitos) {
    const lista = (e.detalhes.conflitos as any[])
      .map((c) => {
        const falta =
          typeof c.necessario === "number" && typeof c.disponivel === "number"
            ? `precisa de ${c.necessario}, há ${c.disponivel} livre${c.disponivel === 1 ? "" : "s"}`
            : "sem quantidade suficiente";
        return `${c.produto ?? "item"} (${falta})`;
      })
      .join(" · ");
    return `${e.message} ${lista}`;
  }
  return e instanceof Error ? e.message : "Não foi possível concluir.";
}
