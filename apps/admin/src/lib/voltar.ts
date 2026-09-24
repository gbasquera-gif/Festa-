import { useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { destinoDoVoltar, registrarVisita, rotaDeRetorno } from "@festae/shared";

/**
 * A ligação da regra do Voltar (`@festae/shared/navegacao`) com o navegador.
 *
 * O registro das telas visitadas vive no `sessionStorage`: sobrevive a
 * recarregar a página e fica preso à aba. Aba nova começa vazia e cai no pai
 * lógico, que é o comportamento certo para quem chegou por link. Com o
 * armazenamento bloqueado o registro fica só na memória — Voltar continua
 * funcionando, só esquece o contexto ao recarregar.
 */

const CHAVE = "festae:navegacao";
let naMemoria: string[] = [];

function lerRegistro(): string[] {
  try {
    const cru = sessionStorage.getItem(CHAVE);
    const lido = cru ? JSON.parse(cru) : [];
    return Array.isArray(lido) ? lido.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return naMemoria;
  }
}

function gravarRegistro(registro: string[]) {
  naMemoria = registro;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(registro));
  } catch {
    /* conveniência: sem armazenamento, fica o registro em memória */
  }
}

/** A URL atual do painel, com a busca: é ela que guarda filtro, aba e período. */
function useUrlAtual(): string {
  const [caminho] = useLocation();
  const busca = useSearch();
  return busca ? `${caminho}?${busca}` : caminho;
}

/** Anota cada tela visitada. Montado uma vez, na casca do painel. */
export function useRegistroDeNavegacao() {
  const url = useUrlAtual();
  useEffect(() => {
    gravarRegistro(registrarVisita(lerRegistro(), url));
  }, [url]);
}

/**
 * O Voltar da tela atual: `null` em tela raiz. Formulários usam o mesmo
 * `voltar` no "Cancelar", para cancelar levar ao mesmo lugar que o Voltar.
 */
export function useVoltar(): { temVoltar: boolean; voltar: () => void } {
  const url = useUrlAtual();
  const [, navegar] = useLocation();
  const voltar = useCallback(() => {
    const destino = destinoDoVoltar(lerRegistro(), url) ?? rotaDeRetorno(url) ?? "/";
    navegar(destino);
  }, [url, navegar]);
  return { temVoltar: rotaDeRetorno(url) !== null, voltar };
}
