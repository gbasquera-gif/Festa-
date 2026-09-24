/**
 * A regra do "← Voltar" do painel.
 *
 * Toda tela interna (detalhe, criação, edição, comprovante) tem Voltar;
 * telas raiz de módulo não têm, porque não há nível anterior. Quem decide
 * qual é qual é a tabela abaixo, num lugar só — nenhuma página escolhe o
 * próprio destino.
 *
 * Voltar prefere o contexto real de onde a pessoa veio, COM a busca e os
 * filtros que estavam na URL. Só quando não há de onde voltar (link direto,
 * aba nova, armazenamento bloqueado) usa a rota pai lógica. Nunca é um
 * `history.back()` cego: num PWA aberto direto na tela interna, ou vindo do
 * login, ele levaria para fora do painel ou para lugar nenhum.
 *
 * Funções puras aqui, para terem teste; a ligação com o navegador fica no
 * painel (`apps/admin/src/lib/voltar.ts`).
 */

/** Quantas telas o registro guarda. Mais que isso não é "de onde eu vim". */
export const LIMITE_DO_REGISTRO = 50;

/** O caminho sem a busca: "/reservas?busca=ana" -> "/reservas". */
export function caminhoDe(url: string): string {
  const i = url.indexOf("?");
  return i === -1 ? url : url.slice(0, i);
}

/**
 * As telas internas e o pai lógico de cada uma.
 *
 * A ordem importa: "/novo" precisa casar antes de ":id". Tudo o que não
 * está aqui é tela raiz e não tem Voltar.
 */
const TELAS_INTERNAS: { padrao: RegExp; pai: (m: RegExpMatchArray) => string }[] = [
  { padrao: /^\/comercial\/orcamentos\/novo$/, pai: () => "/comercial/orcamentos" },
  { padrao: /^\/comercial\/orcamentos\/([^/]+)\/editar$/, pai: (m) => `/comercial/orcamentos/${m[1]}` },
  { padrao: /^\/comercial\/orcamentos\/([^/]+)$/, pai: () => "/comercial/orcamentos" },
  { padrao: /^\/reservas\/nova$/, pai: () => "/reservas" },
  { padrao: /^\/reservas\/([^/]+)\/editar$/, pai: () => "/reservas" },
  { padrao: /^\/reservas\/([^/]+)\/comprovante$/, pai: () => "/reservas" },
];

/** O pai lógico de uma tela interna, ou `null` para tela raiz (sem Voltar). */
export function rotaDeRetorno(url: string): string | null {
  const caminho = caminhoDe(url).replace(/\/+$/, "") || "/";
  for (const { padrao, pai } of TELAS_INTERNAS) {
    const m = caminho.match(padrao);
    if (m) return pai(m);
  }
  return null;
}

/**
 * Formulário é passagem, não destino: depois de salvar uma edição, Voltar
 * no detalhe não pode reabrir o formulário que acabou de ser fechado.
 */
function ehFormulario(caminho: string): boolean {
  return /\/(novo|nova|editar)$/.test(caminho);
}

/** Só o que é tela do painel pode ser destino: nada de login nem da página pública. */
function ehDoPainel(caminho: string): boolean {
  return caminho.startsWith("/") && !caminho.startsWith("//") && caminho !== "/login" && !caminho.startsWith("/proposta/");
}

/**
 * Anota uma tela visitada.
 *
 * A mesma tela com outra busca substitui a anterior em vez de empilhar: a
 * lista que filtrou letra a letra é UMA visita, e o que vale é o último
 * filtro que ela tinha quando a pessoa saiu dela.
 */
export function registrarVisita(registro: readonly string[], url: string): string[] {
  const ultimo = registro[registro.length - 1];
  if (ultimo === url) return [...registro];
  if (ultimo !== undefined && caminhoDe(ultimo) === caminhoDe(url)) {
    return [...registro.slice(0, -1), url];
  }
  return [...registro, url].slice(-LIMITE_DO_REGISTRO);
}

/**
 * Para onde o Voltar leva, a partir da tela atual.
 *
 * A tela visitada mais recente que não seja a própria tela atual nem um
 * formulário, com a URL inteira (busca e filtros incluídos). Sem nenhuma,
 * o pai lógico. Tela raiz não tem Voltar: devolve `null`.
 */
export function destinoDoVoltar(registro: readonly string[], atual: string): string | null {
  const pai = rotaDeRetorno(atual);
  if (pai === null) return null;
  const aqui = caminhoDe(atual);
  for (let i = registro.length - 1; i >= 0; i--) {
    const url = registro[i];
    const caminho = caminhoDe(url);
    if (caminho === aqui || ehFormulario(caminho) || !ehDoPainel(caminho)) continue;
    return url;
  }
  return pai;
}
