import { createHash } from "node:crypto";
import type { ManualReservationInput } from "@festae/shared";

/**
 * A impressão de uma venda manual: um hash de tudo o que foi pedido.
 *
 * Gravada na reserva junto com a chave do envio. Um envio repetido com a
 * mesma chave só devolve a reserva já criada se a impressão for igual — o
 * mesmo cliente, a mesma festa, os mesmos itens, a mesma entrega, o mesmo
 * dinheiro e o mesmo crédito. Qualquer campo diferente (um sinal marcado como
 * recebido, um item trocado, o endereço corrigido) é outra venda, e a
 * correção não pode sumir em silêncio.
 *
 * A ordem das chaves e dos itens não importa; a própria chave do envio fica
 * de fora.
 */
export function impressaoDaVenda(input: ManualReservationInput): string {
  const pedido = { ...input, chaveDeIdempotencia: undefined };
  const itens = [...pedido.produtos.itens].sort((a, b) => a.productId.localeCompare(b.productId) || a.quantity - b.quantity);
  return createHash("sha256")
    .update(canonico({ ...pedido, produtos: { ...pedido.produtos, itens } }))
    .digest("hex");
}

/** JSON com as chaves em ordem e sem os campos vazios (undefined). */
function canonico(valor: unknown): string {
  if (valor instanceof Date) return JSON.stringify(valor.toISOString());
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor && typeof valor === "object") {
    const pares = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${pares.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(",")}}`;
  }
  return JSON.stringify(valor ?? null);
}
