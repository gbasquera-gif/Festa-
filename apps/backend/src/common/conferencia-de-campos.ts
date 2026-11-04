import { BadRequestException, ConflictException } from "@nestjs/common";
import { diaDaFesta, normalizarTelefone } from "@festae/shared";

/**
 * Conferência campo a campo das correções cadastrais.
 *
 * As telas de correção (Operação → "Corrigir dados", Eventos → "Editar
 * festa") gravam campos soltos: nome, telefone, endereço, cidade, convidados.
 * Sem conferência, quem abriu a tela antes grava por cima do que outra pessoa
 * acabou de corrigir — e o telefone certo volta a ser o errado, calado.
 *
 * Cada tela manda só o que mudou e, junto, como cada um desses campos estava
 * quando ela abriu (`antes`). Sob a trava do pedido, o servidor compara com o
 * que está gravado agora:
 *
 * - ninguém mexeu no campo: grava;
 * - outra pessoa mexeu, mas para o mesmo valor que esta tela quer: grava (não
 *   há o que perder);
 * - outra pessoa mexeu para outro valor: recusa (409 CADASTRO_ALTERADO) e nada
 *   é gravado — a pessoa confere o dado atual e decide.
 *
 * Campo que esta tela não mudou não é enviado, então não é conferido nem
 * gravado: correções em campos diferentes, feitas por pessoas diferentes,
 * passam todas. É isso que separa conflito de verdade de conflito falso.
 */

export type Normalizador = (valor: unknown) => unknown;

/** Texto: sem espaços nas pontas; vazio e nulo são a mesma coisa. */
export const texto: Normalizador = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Número, ou nulo ("a combinar"). */
export const numero: Normalizador = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Dia da festa (AAAA-MM-DD), pela mesma regra do resto do sistema. */
export const dia: Normalizador = (v) =>
  v === null || v === undefined || v === "" ? null : diaDaFesta(v instanceof Date ? v : String(v));

/** Telefone: comparado já normalizado, como é gravado. */
export const telefone: Normalizador = (v) => {
  const t = texto(v);
  return t === null ? null : normalizarTelefone(String(t));
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Os campos que esta tela quer gravar e que outra pessoa mudou para outro valor. */
export function camposAlteradosPorOutro(
  campos: readonly string[],
  antes: Record<string, unknown>,
  atual: Record<string, unknown>,
  novo: Record<string, unknown>,
  normalizar: Record<string, Normalizador>,
): string[] {
  return campos.filter((campo) => {
    const n = normalizar[campo] ?? texto;
    const naTela = n(antes[campo]);
    const gravado = n(atual[campo]);
    if (igual(naTela, gravado)) return false; // ninguém mexeu
    if (igual(n(novo[campo]), gravado)) return false; // mexeram para o mesmo valor
    return true;
  });
}

/**
 * Painel aberto antes desta atualização não manda os valores de quando a tela
 * abriu. Recusar é o seguro: aceitar seria voltar ao "a última vence".
 */
export function exigirAntes(campos: readonly string[], antes: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const faltando = campos.filter((c) => !antes || !Object.prototype.hasOwnProperty.call(antes, c));
  if (faltando.length > 0) {
    throw new BadRequestException({
      message: "O painel foi atualizado. Recarregue a página antes de salvar — nada foi alterado.",
      codigo: "PAINEL_DESATUALIZADO",
    });
  }
  return antes as Record<string, unknown>;
}

/** A recusa: quais campos mudaram enquanto a tela estava aberta. Sem os valores. */
export function cadastroAlterado(campos: string[], rotulos: Record<string, string>): ConflictException {
  const nomes = campos.map((c) => rotulos[c] ?? c);
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return new ConflictException({
    message:
      `Enquanto esta tela estava aberta, outra pessoa alterou ${lista}. ` +
      "Nada foi salvo. Confira os dados atuais e corrija de novo se ainda for preciso.",
    codigo: "CADASTRO_ALTERADO",
    campos,
  });
}
