/** Texto livre virando identificador: "Kit Chá de Bebê" → "kit-cha-de-bebe". */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Quantos sufixos numéricos tentar antes de apelar para um sufixo aleatório. */
const TENTATIVAS = 50;

/**
 * Slug que não colide com nenhum outro.
 *
 * Existe porque nomes repetidos são o caso normal aqui, não o erro: "Kit
 * Festaê Essencial" é o mesmo pacote vendido em vários temas, e o painel
 * lista mais de um. O slug era digitado no formulário e o banco exigia
 * unicidade, então o segundo kit com o mesmo nome quebrava o cadastro.
 *
 * Também cobre um caso invisível: kit removido continua no banco com
 * `active = false`, guardando o slug. Sem o desempate, recadastrar um kit
 * apagado falhava por causa de uma linha que ninguém enxerga no painel.
 */
export async function slugUnico(
  jaExiste: (slug: string) => Promise<{ id: string } | null>,
  base: string,
  idAtual?: string,
): Promise<string> {
  // "item" cobre o nome que só tem símbolo e some inteiro na normalização.
  const raiz = slugify(base) || "item";

  for (let n = 1; n <= TENTATIVAS; n++) {
    const candidato = n === 1 ? raiz : `${raiz}-${n}`;
    const existente = await jaExiste(candidato);
    if (!existente || existente.id === idAtual) return candidato;
  }

  // Cinquenta kits com o mesmo nome não deve acontecer, mas um laço sem fim
  // seguraria a requisição para sempre. O sufixo aleatório encerra a busca.
  return `${raiz}-${Date.now().toString(36)}`;
}
