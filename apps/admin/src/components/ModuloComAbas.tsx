import { useMemo, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

/**
 * Um módulo com abas internas.
 *
 * Acervo e Comercial passaram a agrupar telas que antes ocupavam uma linha
 * cada na barra lateral. As telas não foram reescritas: elas continuam sendo
 * os mesmos componentes, montados dentro de uma aba.
 *
 * A aba vive na URL, e não em estado local, por dois motivos práticos: o
 * botão voltar do navegador funciona, e um link para "/acervo/kits" abre
 * onde deveria em vez de cair sempre na primeira aba.
 */
export type Aba = {
  chave: string;
  rotulo: string;
  conteudo: ReactNode;
};

export function ModuloComAbas({
  base,
  titulo,
  descricao,
  abas,
  acao,
}: {
  base: string;
  titulo: string;
  descricao: string;
  abas: Aba[];
  acao?: ReactNode;
}) {
  const [location] = useLocation();

  const atual = useMemo(() => {
    const resto = location.startsWith(`${base}/`) ? location.slice(base.length + 1) : "";
    return abas.find((a) => a.chave === resto) ?? abas[0];
  }, [location, base, abas]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.65rem] font-semibold" style={{ color: "var(--color-navy)" }}>
            {titulo}
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{descricao}</p>
        </div>
        {acao}
      </div>

      <nav className="painel-abas" aria-label={`Seções de ${titulo}`}>
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={a.chave === abas[0].chave ? base : `${base}/${a.chave}`}
            aria-current={a.chave === atual.chave ? "page" : undefined}
            className="painel-aba flex items-center"
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      <div>{atual.conteudo}</div>
    </div>
  );
}

/**
 * Um resumo de módulo: contagens do que já existe, sem análise nova.
 *
 * A aba "Visão Geral" de Acervo e Comercial existe para a arquitetura
 * comportar os gráficos que virão. Enchê-la agora de análise seria implementar
 * a Sprint 5 por antecipação, então ela mostra o que o módulo tem e diz, sem
 * rodeio, o que ainda não mostra.
 */
export function ResumoDoModulo({
  cartoes,
  aviso,
}: {
  cartoes: { rotulo: string; valor: string | number; nota?: string; href?: string }[];
  aviso: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cartoes.map((c) => {
          const corpo = (
            <>
              <p className="painel-periodo">{c.rotulo}</p>
              <p
                className="mt-1 text-2xl font-medium"
                style={{ color: "var(--color-navy)", fontVariantNumeric: "tabular-nums" }}
              >
                {c.valor}
              </p>
              {c.nota && <p className="mt-0.5 text-xs text-muted-foreground">{c.nota}</p>}
            </>
          );
          return c.href ? (
            <Link key={c.rotulo} href={c.href} className="painel-cartao block p-4 transition-colors hover:bg-muted/30">
              {corpo}
            </Link>
          ) : (
            <div key={c.rotulo} className="painel-cartao p-4">{corpo}</div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{aviso}</p>
    </div>
  );
}
