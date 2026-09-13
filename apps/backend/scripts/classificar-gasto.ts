import type { NaturezaDoGasto } from "@festae/shared";

/**
 * Em que natureza cai um lançamento do painel antigo.
 *
 * O painel antigo não tinha essa informação: ele separava "Contas" de
 * "Aportes" por aba, e tudo que estava na aba Aportes virava capital — balão,
 * fita de cetim e anúncio no Meta inclusive. A carga precisa reclassificar,
 * e reclassificar por texto é imperfeito por natureza.
 *
 * Por isso a carga imprime a classificação inteira antes de gravar qualquer
 * coisa: o julgamento final é de quem conhece as compras, não do script. Os
 * termos abaixo cobrem o histórico conhecido; o que não casar vira ACERVO,
 * que é o padrão certo para um negócio de locação — a maior parte do que a
 * Festaê compra realmente vira patrimônio alugável.
 */

/** Mantém a empresa de pé sem virar coisa nem festa. */
const CUSTEIO = ["meta ads", "zoho", "dominio", "curso", "avental", "das", "imposto", "anuncio"];

/** Some na festa. */
const CONSUMO = [
  "balao",
  "baloes",
  "fita",
  "cola e spray",
  "linha",
  "tinta",
  "bomba",
  "capas e sacolas",
];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Casa o termo como palavra inteira, não como pedaço de outra.
 *
 * Precisa existir porque `includes` classificou "Display Margaridas" como
 * custeio: "margaridas" contém "das", que é a sigla do imposto do MEI. Duas
 * compras de acervo viraram despesa por causa disso, e o erro só apareceu
 * porque a carga imprime a classificação inteira antes de gravar.
 */
function contemPalavra(texto: string, termo: string): boolean {
  // O `s?` no fim aceita o plural — a operação escreve "Linhas para Tapete"
  // e "Balões" tanto quanto "linha" e "balão". Ele não reabre o buraco do
  // "das": a exigência de fronteira antes do termo continua valendo, então
  // "margaridas" segue fora.
  return new RegExp(`(^|[^a-z0-9])${termo}s?([^a-z0-9]|$)`).test(texto);
}

export function classificarGasto(descricao: string, categoria?: string | null): NaturezaDoGasto {
  const texto = semAcento(`${descricao} ${categoria ?? ""}`);
  if (CUSTEIO.some((termo) => contemPalavra(texto, termo))) return "CUSTEIO";
  if (CONSUMO.some((termo) => contemPalavra(texto, termo))) return "CONSUMO";
  return "ACERVO";
}
