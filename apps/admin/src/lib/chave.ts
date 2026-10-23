/**
 * Chave de idempotência de um envio (UUID v4).
 *
 * `crypto.randomUUID` só existe em contexto seguro (HTTPS ou localhost). O
 * painel aberto pelo IP da rede local, sem TLS — homologação em Docker, por
 * exemplo —, não tem: a tela quebraria ao abrir. `getRandomValues` existe em
 * qualquer contexto e dá a mesma aleatoriedade criptográfica.
 */
export function novaChave(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
