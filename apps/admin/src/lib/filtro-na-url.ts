import { useCallback } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Um filtro de lista guardado na URL, e não só na memória da tela.
 *
 * É o que permite o "← Voltar" devolver a lista como ela estava: a URL da
 * lista, com `?busca=...&situacao=...`, é o que o registro de navegação
 * guarda. Estado em `useState` morreria ao abrir o detalhe.
 *
 * Troca a URL com `replace`: filtrar não é navegar, e o botão voltar do
 * navegador não deve desfazer letra por letra. O valor padrão não aparece
 * na URL, para a lista sem filtro continuar sendo só "/reservas".
 */
export function useFiltroNaUrl<T extends string>(
  chave: string,
  padrao: T,
  validos?: readonly T[],
): [T, (valor: T) => void] {
  const [caminho, navegar] = useLocation();
  const busca = useSearch();
  const cru = new URLSearchParams(busca).get(chave);
  const valor = cru !== null && (!validos || validos.includes(cru as T)) ? (cru as T) : padrao;

  const definir = useCallback(
    (novo: T) => {
      // Lê a URL do momento, e não a do render: dois filtros trocados no
      // mesmo clique (aba e mês, por exemplo) não podem apagar um ao outro.
      const parametros = new URLSearchParams(window.location.search);
      if (novo === padrao || novo === "") parametros.delete(chave);
      else parametros.set(chave, novo);
      const texto = parametros.toString();
      navegar(texto ? `${caminho}?${texto}` : caminho, { replace: true });
    },
    [caminho, navegar, chave, padrao],
  );

  return [valor, definir];
}
