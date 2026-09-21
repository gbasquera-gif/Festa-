/**
 * O endereço público da proposta.
 *
 * O painel e a proposta são a mesma aplicação, então o endereço que a cliente
 * abre nasce da origem do navegador — e é aí que mora a armadilha: se a Maria
 * Luiza entrar pelo endereço interno da hospedagem, ou pelo localhost de um
 * teste, o link copiado leva a cliente para um lugar que ela não alcança.
 *
 * Por isso o domínio oficial é configuração de ambiente (VITE_PUBLIC_URL,
 * embutida no build como toda VITE_*, igual à URL da API). A origem do
 * navegador continua valendo como último recurso — em desenvolvimento, onde é
 * exatamente o que se quer.
 */
const CONFIGURADA = (import.meta.env.VITE_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");

export function origemPublica(): string {
  return CONFIGURADA || window.location.origin;
}

export function urlDaProposta(token: string): string {
  return `${origemPublica()}/proposta/${token}`;
}
