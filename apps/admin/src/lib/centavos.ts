/**
 * Centavos (inteiros) para reais, só para exibir.
 *
 * Um total vazio pode sair do cálculo como zero negativo (-0), e a formatação
 * em pt-BR mostra "-R$ 0,00". Aqui o zero é sempre zero; qualquer outro valor
 * passa igual. Não muda cálculo nenhum.
 */
export function centavosEmReais(centavos: number): number {
  return centavos === 0 ? 0 : centavos / 100;
}
