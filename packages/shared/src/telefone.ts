/**
 * O telefone como ele é gravado: só dígitos, sem o código do país.
 *
 * O mesmo número chega de muitos jeitos — "(49) 99999-0000", "49 99999 0000",
 * "+55 49 99999-0000", "049 99999-0000". Comparado como texto, cada jeito
 * vira uma cliente nova, e a contagem de clientes (e de recorrência) conta
 * a mesma pessoa várias vezes.
 *
 * As duas remoções são por tamanho, e não por palpite: um número brasileiro
 * tem DDD mais 8 ou 9 dígitos (10 ou 11). Com o 55 do país na frente ele
 * passa a 12 ou 13; com o 0 de discagem, a 11 ou 12. Nenhum DDD começa com
 * 0, então o 0 inicial num número desse tamanho só pode ser o de discagem.
 * O DDD 55 existe (região de Santa Maria), e por isso o 55 só sai quando o
 * tamanho mostra que ele está sobrando.
 *
 * O que não se encaixa em nada disso volta só com os dígitos, sem mais
 * nenhuma interpretação.
 */
export function normalizarTelefone(telefone: string | null | undefined): string {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos.slice(2);
  }
  if (digitos.startsWith("0") && (digitos.length === 11 || digitos.length === 12)) {
    return digitos.slice(1);
  }
  return digitos;
}

/**
 * Os jeitos como este número pode estar gravado em cadastros antigos.
 *
 * Os telefones já gravados não são reescritos em massa — então, para achar a
 * cliente que já existe, a busca compara só os dígitos do que está no banco
 * com estas formas. Vazio quando o número é curto demais para ser um
 * telefone: buscar "123" encontraria qualquer um.
 */
export function formasDoTelefone(telefone: string | null | undefined): string[] {
  const numero = normalizarTelefone(telefone);
  if (numero.length < 10) return [];
  return [numero, `55${numero}`, `0${numero}`];
}
