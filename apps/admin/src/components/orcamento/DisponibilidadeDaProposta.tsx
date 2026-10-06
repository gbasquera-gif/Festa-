import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { formatarDataDaFesta } from "@festae/shared";
import { api } from "@/lib/api";

/**
 * Cada opção cabe na data da festa?
 *
 * A mesma conta que a aprovação da cliente faz: reservas do dia mais o que
 * outras propostas aprovadas, ainda sem reserva, seguram provisoriamente.
 * Mostrar aqui é o que permite corrigir a proposta antes de a cliente tentar
 * aprovar e ser barrada.
 */

type Falta = {
  productId: string;
  nome: string;
  estoque: number;
  pedido: number;
  comprometido: number;
  seguradoPorPropostas: number;
};

type Disponibilidade = {
  data: string | null;
  situacao: "SEM_DATA" | "RESERVADA" | "SEGURA_ITENS" | "A_CONFERIR";
  opcoes: { id: string; nome: string; aprovada: boolean; disponivel: boolean; faltas: Falta[] }[];
  seguradoPor: { id: string; numero: number; cliente: string; opcao: string }[];
};

function textoDaFalta(f: Falta): string {
  const livres = Math.max(0, f.estoque - f.comprometido);
  const deQuem =
    f.seguradoPorPropostas > 0
      ? f.seguradoPorPropostas === f.comprometido
        ? " — por proposta aprovada aguardando sinal"
        : ` — ${f.seguradoPorPropostas} por proposta aprovada aguardando sinal`
      : "";
  return `${f.nome}: precisa de ${f.pedido}, ${livres === 0 ? "nenhum livre" : `${livres} livre${livres === 1 ? "" : "s"}`} (${f.estoque} no acervo, ${f.comprometido} já comprometido${f.comprometido === 1 ? "" : "s"}${deQuem})`;
}

export function DisponibilidadeDaProposta({ id }: { id: string }) {
  const { data: d, isLoading, error } = useQuery<Disponibilidade>({
    queryKey: ["orcamento", id, "disponibilidade"],
    queryFn: () => api(`/orcamentos/${id}/disponibilidade`),
  });

  // Sem data, o aviso de data a definir já diz o que falta; convertida, a
  // reserva é que responde pelo material.
  if (isLoading || error || !d || d.situacao === "SEM_DATA" || d.situacao === "RESERVADA" || !d.data) return null;

  const unica = d.opcoes.length === 1;
  return (
    <section className="painel-cartao space-y-3 p-4" data-disponibilidade>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
          Disponibilidade em {formatarDataDaFesta(`${d.data}T12:00:00.000Z`)}
        </h2>
        <span className="painel-periodo">reservas + propostas aprovadas aguardando sinal</span>
      </div>

      {d.situacao === "SEGURA_ITENS" && (
        <p className="text-xs text-muted-foreground">
          Aprovada: esta proposta segura os itens da opção escolhida para a data até virar reserva ou ser
          marcada como perdida. Nenhuma outra cliente consegue aprovar as mesmas peças nesse meio-tempo.
        </p>
      )}

      <ul className="space-y-2">
        {d.opcoes.map((op) => (
          <li key={op.id} className="flex items-start gap-2 text-sm" data-opcao-disponivel={op.disponivel}>
            {op.disponivel ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#2e9b6b" }} aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "#c4472a" }} aria-hidden />
            )}
            <div className="min-w-0">
              <p style={{ color: "var(--color-navy)" }}>
                {unica ? "A proposta" : op.nome}
                {op.aprovada && !unica ? " (escolhida)" : ""}
                {" — "}
                {op.disponivel ? "tudo disponível" : "falta material"}
              </p>
              {op.faltas.map((f) => (
                <p key={f.productId} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {textoDaFalta(f)}
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {d.seguradoPor.length > 0 && (
        <div className="border-t pt-3">
          <p className="painel-periodo">Aprovadas na mesma data, aguardando sinal</p>
          <ul className="mt-1 space-y-1 text-sm">
            {d.seguradoPor.map((p) => (
              <li key={p.id}>
                <Link href={`/comercial/orcamentos/${p.id}`} className="underline" style={{ color: "var(--color-navy)" }}>
                  Proposta nº {p.numero}
                </Link>
                <span className="text-muted-foreground"> · {p.cliente} · {p.opcao}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Se uma delas não for seguir, marque-a como perdida: os itens que ela segura ficam livres.
          </p>
        </div>
      )}
    </section>
  );
}
