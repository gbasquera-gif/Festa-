import { useMemo, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatarReais as reaisDeVerdade } from "@festae/shared";
import { brl as brlDeVerdade, numero as numeroDeVerdade, pct as pctDeVerdade } from "@/components/financeiro/formato";

/**
 * Privacidade visual dos valores: o olho do painel.
 *
 * Esconde os números da tela — para mostrar o painel numa reunião, numa
 * chamada com a tela compartilhada, num balcão com gente olhando. Não é
 * controle de acesso: os dados continuam chegando ao navegador de quem pode
 * vê-los, e quem tem permissão revela com um clique. Por isso documentos
 * oficiais (comprovante, voucher, proposta, relatório em PDF) mostram sempre
 * os valores de verdade, e campos sendo digitados continuam visíveis.
 *
 * O estado é um só para o painel inteiro, e fica no navegador de quem usa:
 * escondeu numa tela, continua escondido nas outras, ao recarregar e nas
 * outras abas abertas.
 */

const CHAVE = "festae:valores-ocultos";

/** O que aparece no lugar de um valor em reais. Nunca zero: zero é um valor. */
export const VALOR_OCULTO = "R$ •••••";
/** No lugar de um número em coluna que já é toda em reais. */
export const NUMERO_OCULTO = "•••••";
/** No lugar de um percentual financeiro. */
export const PERCENTUAL_OCULTO = "••%";

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "1";
  } catch {
    // Armazenamento bloqueado: começa mostrando, como sempre foi.
    return false;
  }
}

let ocultos = lerPreferencia();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvinte) => ouvinte());

/** Mostra ou esconde os valores do painel inteiro. */
export function definirValoresOcultos(valor: boolean) {
  ocultos = valor;
  try {
    localStorage.setItem(CHAVE, valor ? "1" : "0");
  } catch {
    /* a preferência é conveniência: sem armazenamento, vale até recarregar */
  }
  avisar();
}

// Outra aba do painel mudou a preferência: esta acompanha.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CHAVE) return;
    ocultos = e.newValue === "1";
    avisar();
  });
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Se os valores estão escondidos agora (fora de componente). */
export function valoresOcultos(): boolean {
  return ocultos;
}

/** Se os valores estão escondidos agora. Quem chama redesenha ao mudar. */
export function useValoresOcultos(): boolean {
  return useSyncExternalStore(assinar, () => ocultos, () => false);
}

export type Formato = {
  ocultos: boolean;
  /** "R$ 1.234,56" — ou "R$ •••••". Aceita o decimal que a API manda como texto. */
  brl: (valor: number | string) => string;
  /** O mesmo, pela função do pacote compartilhado (as telas que já a usavam). */
  formatarReais: (valor: number) => string;
  /** "1.234,56", para colunas que já são todas em reais. */
  numero: (valor: number) => string;
  /** "12,5%" de um indicador financeiro. "—" (sem dado) continua "—". */
  pct: (valor: number | null, casas?: number) => string;
};

const VISIVEL: Formato = {
  ocultos: false,
  brl: (valor) => brlDeVerdade(Number(valor)),
  formatarReais: reaisDeVerdade,
  numero: numeroDeVerdade,
  pct: pctDeVerdade,
};

const OCULTO: Formato = {
  ocultos: true,
  brl: () => VALOR_OCULTO,
  formatarReais: () => VALOR_OCULTO,
  numero: () => NUMERO_OCULTO,
  pct: (valor) => (valor === null ? "—" : PERCENTUAL_OCULTO),
};

/**
 * Os formatadores de valor que respeitam o olho.
 *
 * Toda tela de consulta formata dinheiro por aqui — inclusive o texto de
 * tooltips (`title`) e rótulos de acessibilidade, para o valor escondido não
 * reaparecer ao passar o mouse nem no leitor de tela. O formato real fica só
 * nos documentos oficiais e nos campos de edição.
 */
export function useFormato(): Formato {
  const ocultosAgora = useValoresOcultos();
  return useMemo(() => formatoPara(ocultosAgora), [ocultosAgora]);
}

/** Os formatadores para um estado do olho. */
export function formatoPara(ocultosAgora: boolean): Formato {
  return ocultosAgora ? OCULTO : VISIVEL;
}

/**
 * O botão do olho.
 *
 * O rótulo diz o que o clique faz ("Ocultar valores" / "Mostrar valores") e o
 * ícone mostra o estado: olho aberto, valores à vista; olho riscado, valores
 * escondidos. A mudança é anunciada para o leitor de tela.
 */
export function BotaoDeValores({ compacto = false, className = "" }: { compacto?: boolean; className?: string }) {
  const ocultosAgora = useValoresOcultos();
  const rotulo = ocultosAgora ? "Mostrar valores" : "Ocultar valores";
  const Icone = ocultosAgora ? EyeOff : Eye;
  return (
    <>
      <button
        type="button"
        onClick={() => definirValoresOcultos(!ocultosAgora)}
        aria-label={rotulo}
        title={rotulo}
        data-botao-valores={ocultosAgora ? "ocultos" : "visiveis"}
        className={`flex items-center gap-2 rounded-md text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy ${className}`}
        style={{ color: "var(--color-navy)" }}
      >
        <Icone className="size-5 shrink-0" aria-hidden />
        {!compacto && <span>{rotulo}</span>}
      </button>
      <span className="sr-only" aria-live="polite">
        {ocultosAgora ? "Valores ocultos" : "Valores visíveis"}
      </span>
    </>
  );
}
