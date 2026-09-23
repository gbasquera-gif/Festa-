/**
 * Formatação de dinheiro e datas da área financeira.
 *
 * Fica num arquivo só porque um valor formatado de dois jeitos diferentes em
 * duas telas é a maneira mais barata de fazer o usuário desconfiar do
 * sistema inteiro.
 */

export const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Sem o "R$", para tabelas onde a coluna inteira já é dinheiro. */
export const numero = (valor: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Percentual em pt-BR.
 *
 * `toFixed` devolve ponto decimal, e "82.7%" no meio de uma tela onde todo
 * dinheiro usa vírgula faz o número parecer de outro sistema.
 */
export const pct = (valor: number | null, casas = 1) =>
  valor === null
    ? "—"
    : `${(valor * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      })}%`;

/**
 * Data vinda do backend como ISO, exibida como dia/mês/ano.
 *
 * Lê em UTC de propósito: o backend grava o dia ancorado ao meio-dia UTC, e
 * converter para o fuso do navegador traria de volta o erro do dia a menos
 * que a operação relatou no app.
 */
export const dia = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";

/** "2026-09" -> "setembro de 2026" */
export function nomeDoMes(mes: string): string {
  const [ano, numeroDoMes] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, numeroDoMes - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Os últimos N meses, do mais recente para trás, como "AAAA-MM". */
export function mesesRecentes(quantidade = 18): string[] {
  const hoje = new Date();
  return Array.from({ length: quantidade }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** O mês corrente, como "AAAA-MM". */
export const mesCorrente = () => mesesRecentes(1)[0];

/** Os doze meses, "01" a "12", para os filtros de período. */
export const MESES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

/**
 * Os anos que os filtros oferecem.
 *
 * Derivados do relógio, nunca digitados: uma lista fixa de anos passa a
 * mentir sozinha na virada do ano, e alguém só descobre em janeiro. Começa em
 * 2026, quando o financeiro passou a existir, e vai até o ano seguinte ao
 * corrente — porque festa é contratada com meses de antecedência.
 */
export function anosDisponiveis(): number[] {
  const atual = new Date().getUTCFullYear();
  const anos: number[] = [];
  for (let a = atual + 1; a >= Math.min(2026, atual); a--) anos.push(a);
  return anos;
}
