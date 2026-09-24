import { useMemo } from "react";
import { useFiltroNaUrl } from "@/lib/filtro-na-url";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import {
  STATUS_DO_ORCAMENTO_LABEL,
  formatarDataDaFesta,
  type StatusDoOrcamento,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { brl } from "@/components/financeiro/formato";

/**
 * A carteira de propostas.
 *
 * Mesma leitura da tela de Reservas: o que ainda pede acompanhamento vem
 * primeiro, o histórico fica discreto. A diferença é o que conta como
 * acompanhamento — aqui é a proposta que saiu e ainda não teve resposta.
 */

export type OrcamentoResumo = {
  id: string;
  numero: number;
  versao: number;
  situacao: StatusDoOrcamento;
  status: StatusDoOrcamento;
  cliente: string;
  telefone: string;
  festaEm: string;
  cidade: string;
  tema: string | null;
  itens: number;
  total: number;
  validoAte: string;
  criadoEm: string;
  enviadoEm: string | null;
  aprovadoEm: string | null;
  motivoDaPerda: string | null;
  token: string;
  reservaId: string | null;
};

const ABAS = ["TODOS", "RASCUNHO", "ENVIADO", "APROVADO", "RECUSADO", "EXPIRADO"] as const;
type Aba = (typeof ABAS)[number];

const ABA_LABEL: Record<Aba, string> = {
  TODOS: "Todos",
  RASCUNHO: "Rascunhos",
  ENVIADO: "Enviados",
  APROVADO: "Aprovados",
  RECUSADO: "Perdidos",
  EXPIRADO: "Expirados",
};

const ABA_NOTA: Record<Aba, string> = {
  TODOS: "todas as propostas, da mais recente para trás",
  RASCUNHO: "ainda sendo montadas — a cliente não viu",
  ENVIADO: "link na mão da cliente, aguardando resposta",
  APROVADO: "aceitas — falta virar reserva",
  RECUSADO: "não seguiram",
  EXPIRADO: "passaram da validade sem resposta",
};

const COR: Record<StatusDoOrcamento, string> = {
  RASCUNHO: "#7a7266",
  ENVIADO: "#1b2e4b",
  APROVADO: "#2e9b6b",
  RECUSADO: "#c0614a",
  EXPIRADO: "#b08968",
};

export default function Orcamentos() {
  const [aba, setAba] = useFiltroNaUrl<Aba>("situacao", "TODOS", ABAS);
  const [busca, setBusca] = useFiltroNaUrl<string>("busca", "");

  const { data, isLoading } = useQuery<{ orcamentos: OrcamentoResumo[] }>({
    queryKey: ["orcamentos"],
    queryFn: () => api("/orcamentos"),
  });

  const linhas = data?.orcamentos ?? [];

  const contadores = useMemo(() => {
    const mapa = { TODOS: linhas.length } as Record<Aba, number>;
    for (const a of ABAS.filter((x) => x !== "TODOS")) {
      mapa[a] = linhas.filter((o) => o.situacao === a).length;
    }
    return mapa;
  }, [linhas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const daAba = aba === "TODOS" ? linhas : linhas.filter((o) => o.situacao === aba);
    const filtradas = termo
      ? daAba.filter((o) =>
          [o.cliente, o.telefone, String(o.numero), o.cidade].join(" ").toLowerCase().includes(termo),
        )
      : daAba;

    // Enviada primeiro: é a única que depende de alguém cobrar resposta.
    // Aprovada sem reserva vem logo atrás, porque tem venda esperando para
    // ser criada. O resto é histórico.
    const peso = (o: OrcamentoResumo) =>
      o.situacao === "ENVIADO" ? 0 : o.situacao === "APROVADO" && !o.reservaId ? 1 : o.situacao === "RASCUNHO" ? 2 : 3;

    return [...filtradas].sort((a, b) => {
      const d = peso(a) - peso(b);
      return d !== 0 ? d : b.criadoEm.localeCompare(a.criadoEm);
    });
  }, [linhas, aba, busca]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Cada proposta vira um link para a cliente abrir no celular. Aprovada, ela não cria reserva
          sozinha: a conversão passa pela conferência de disponibilidade, como toda venda.
        </p>
        <Button asChild className="h-11 w-full sm:h-9 sm:w-auto">
          <Link href="/comercial/orcamentos/novo">
            <Plus className="mr-1 size-4" />
            Novo orçamento
          </Link>
        </Button>
      </div>

      <div>
        <nav className="painel-abas flex flex-wrap gap-1 border-b" aria-label="Situação das propostas">
          {ABAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              aria-current={aba === a ? "page" : undefined}
              className="painel-aba min-h-11 px-3 text-sm"
              style={{
                color: aba === a ? "var(--color-navy)" : "#7a7266",
                borderBottom: `2px solid ${aba === a ? "var(--color-coral)" : "transparent"}`,
                marginBottom: "-1px",
              }}
            >
              {ABA_LABEL[a]}
              {!isLoading && (
                <span className="ml-1.5 text-xs tabular-nums" style={{ opacity: aba === a ? 0.8 : 0.55 }}>
                  {contadores[a]}
                </span>
              )}
            </button>
          ))}
        </nav>
        <p className="painel-periodo mt-1">{ABA_NOTA[aba]}</p>
      </div>

      <label className="flex max-w-md items-center gap-2">
        <span className="sr-only">Buscar proposta</span>
        <span className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente, telefone, cidade ou nº"
            className="painel-cartao h-11 w-full pl-9 pr-3 text-sm"
          />
        </span>
      </label>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && visiveis.length === 0 && (
        <div className="painel-cartao p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {busca.trim()
              ? `Nenhuma proposta para “${busca.trim()}”.`
              : aba === "TODOS"
                ? "Nenhuma proposta ainda. O primeiro orçamento começa no botão acima."
                : "Nenhuma proposta nesta aba."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {visiveis.map((o) => {
          const historico = o.situacao === "RECUSADO" || o.situacao === "EXPIRADO";
          return (
            <Link
              key={o.id}
              href={`/comercial/orcamentos/${o.id}`}
              className="painel-cartao flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:bg-muted/30"
              style={historico ? { opacity: 0.72 } : undefined}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" style={{ color: "var(--color-navy)" }}>
                  {o.cliente}
                  <span
                    className="ml-2 rounded px-1.5 py-0.5 align-middle text-[0.6rem] font-medium uppercase tracking-wider"
                    style={{ background: `${COR[o.situacao]}1a`, color: COR[o.situacao] }}
                  >
                    {STATUS_DO_ORCAMENTO_LABEL[o.situacao]}
                  </span>
                  {o.situacao === "APROVADO" && !o.reservaId && (
                    <span className="ml-2 text-[0.6rem] font-medium uppercase tracking-wider" style={{ color: "#c4472a" }}>
                      falta virar reserva
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  nº {o.numero}
                  {o.versao > 1 ? ` · versão ${o.versao}` : ""} · festa em {formatarDataDaFesta(o.festaEm)} ·{" "}
                  {o.itens} {o.itens === 1 ? "item" : "itens"}
                </span>
              </span>
              <span className="fin-numero shrink-0 text-base">{brl(o.total)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
