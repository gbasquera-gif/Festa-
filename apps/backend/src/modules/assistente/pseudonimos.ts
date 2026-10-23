import { normalizarParaBusca } from "@festae/shared";

/**
 * Nomes trocados por códigos antes de ir para a IA externa.
 *
 * Fornecedores ([F1]), categorias de despesa ([K1]), clientes ([C1]) e sócios ([S1]).
 * A categoria é texto livre do ERP e pode ter nome de pessoa ("Freelancer Joana"). O fornecedor pode ser
 * uma pessoa (um freelancer, uma cliente reembolsada); a cliente e o sócio
 * são pessoas; e, mesmo quando é empresa, a lista de com quem a Festaê gasta é
 * dado comercial. A IA não precisa do nome para responder: ela recebe "[C1]",
 * escreve "[C1]" na resposta, e o servidor devolve o nome antes de mostrar.
 *
 * - A mesma pessoa (ou o mesmo nome de fornecedor, sem diferença de
 *   maiúsculas, acentos e espaços) tem sempre o mesmo código na conversa, para
 *   "e do segundo?" continuar funcionando. Pessoas diferentes com o mesmo
 *   primeiro nome têm códigos diferentes.
 * - A tabela vive com a conversa, só na memória do servidor, e some com ela.
 * - O que a IA manda de volta nos parâmetros ("[F2]") é traduzido antes de a
 *   ferramenta procurar o nome no cadastro.
 */

/** F: fornecedor; K: categoria de despesa; C: cliente; S: sócio. */
export type TipoDoCodigo = "F" | "K" | "C" | "S";

export class Pseudonimos {
  private readonly porChave = new Map<string, string>();
  private readonly porCodigo = new Map<string, { nome: string; doCadastro: boolean }>();
  private readonly contagem: Record<TipoDoCodigo, number> = { F: 0, K: 0, C: 0, S: 0 };

  /**
   * O código do nome: "[F1]". Nome vazio não ganha código.
   * - `tipo`: fornecedor (padrão), cliente ou sócio.
   * - `chave`: o que identifica a pessoa, quando o nome mostrado não basta
   *   (duas clientes "Ana"). Fica só aqui; nunca sai.
   * - `doCadastro`: o nome como está gravado no ERP. O que a pessoa digitou
   *   ("meta ads") ganha o mesmo código, mas é a grafia do cadastro que aparece.
   */
  codigo(nome: string, opcoes: { tipo?: TipoDoCodigo; chave?: string; doCadastro?: boolean } = {}): string {
    const tipo = opcoes.tipo ?? "F";
    const doCadastro = opcoes.doCadastro ?? true;
    const limpo = nome.trim();
    if (!limpo) return limpo;
    // Nome sem letra latina nem número ("Иван", "日本商店") normaliza para vazio:
    // a identidade vira o próprio texto, e o nome ganha código do mesmo jeito.
    // A chave explícita (cliente: nome|contato; sócio: id) é usada como está:
    // normalizar apagaria "@", "." e "-" e juntaria contatos diferentes.
    const base = (opcoes.chave ?? limpo).trim();
    const identidade = opcoes.chave !== undefined ? base.toLowerCase() : normalizarParaBusca(base) || base.toLowerCase();
    const chave = `${tipo}:${identidade}`;
    const existente = this.porChave.get(chave);
    if (existente) {
      if (doCadastro && !this.porCodigo.get(existente)!.doCadastro) this.porCodigo.set(existente, { nome: limpo, doCadastro });
      return `[${existente}]`;
    }
    this.contagem[tipo] += 1;
    const codigo = `${tipo}${this.contagem[tipo]}`;
    this.porChave.set(chave, codigo);
    this.porCodigo.set(codigo, { nome: limpo, doCadastro });
    return `[${codigo}]`;
  }

  /**
   * Troca os códigos conhecidos pelos nomes. Só o código entre colchetes
   * ("[F1]", ou "«F1»"): "F1" solto pode ser outra coisa ("Kit F1") e fica como está.
   * `tipos`: só esses tipos são trocados (nos parâmetros de uma ferramenta, o
   * campo de fornecedor aceita só código de fornecedor); os outros ficam como código.
   */
  revelar(texto: string, tipos: readonly TipoDoCodigo[] = ["F", "K", "C", "S"]): string {
    if (!this.porCodigo.size) return texto;
    return texto.replace(/\[([FKCS]\d{1,4})\]|«([FKCS]\d{1,4})»/g, (todo, entre: string | undefined, aspas: string | undefined) => {
      const codigo = (entre ?? aspas)!;
      return tipos.includes(codigo[0] as TipoDoCodigo) ? (this.porCodigo.get(codigo)?.nome ?? todo) : todo;
    });
  }

  /** O mesmo, em todos os textos de um valor vindo da IA (os parâmetros de uma ferramenta). */
  revelarEmValores<T>(valor: T, tipos?: readonly TipoDoCodigo[]): T {
    if (typeof valor === "string") return this.revelar(valor, tipos) as T;
    if (Array.isArray(valor)) return valor.map((v) => this.revelarEmValores(v, tipos)) as T;
    if (valor && typeof valor === "object") {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, this.revelarEmValores(v, tipos)])) as T;
    }
    return valor;
  }
}

/** A tabela de códigos da conversa, ou uma só desta chamada: nome nunca sai em claro. */
export function tabelaDeCodigos(ctx: { pseudonimos?: Pseudonimos }): Pseudonimos {
  return ctx.pseudonimos ?? new Pseudonimos();
}
