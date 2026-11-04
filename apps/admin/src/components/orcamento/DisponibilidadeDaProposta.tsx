import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import type { OpcaoConferida } from "@festae/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { AvisoDeIndisponibilidade, dataNoAviso, horaDaConferencia } from "@/components/orcamento/AvisoDeIndisponibilidade";

/**
 * Cada opção cabe na data da festa?
 *
 * A mesma conta que o envio, o link da cliente e a aprovação fazem: reservas
 * do dia mais o que outras propostas aprovadas, ainda sem reserva, seguram.
 * Com falta, o aviso detalhado — item, quantidades, motivo e quem segura.
 * Sem falta, uma linha por opção. A conferência é de agora: abrir a tela, ou
 * "Verificar novamente", pergunta de novo ao servidor.
 */

export type Disponibilidade = {
  data: string | null;
  situacao: "SEM_DATA" | "RESERVADA" | "SEGURA_ITENS" | "A_CONFERIR";
  conferidoEm: string | null;
  opcoes: (OpcaoConferida & { aprovada: boolean })[];
  seguradoPor: { id: string; numero: number; cliente: string; opcao: string }[];
  reservasSemSinalVencidas: { id: string; numero: string }[];
};

export function useDisponibilidadeDaProposta(id: string, ativa: boolean) {
  return useQuery<Disponibilidade>({
    queryKey: ["orcamento", id, "disponibilidade"],
    queryFn: () => api(`/orcamentos/${id}/disponibilidade`),
    enabled: ativa,
  });
}

export function temItensIndisponiveis(d: Disponibilidade | undefined): boolean {
  return Boolean(d?.opcoes.some((o) => !o.disponivel));
}

export function DisponibilidadeDaProposta({
  id,
  consulta,
}: {
  id: string;
  consulta: ReturnType<typeof useDisponibilidadeDaProposta>;
}) {
  const { data: d, isLoading, isFetching, error, refetch } = consulta;

  if (isLoading) {
    return <p className="painel-cartao p-4 text-sm text-muted-foreground">Conferindo a disponibilidade das peças…</p>;
  }
  if (error || !d) {
    return (
      <div className="painel-cartao flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-sm text-muted-foreground">
          Não foi possível conferir a disponibilidade agora. O envio confere de novo no servidor antes de liberar o link.
        </p>
        <Button variant="outline" className="min-h-11" onClick={() => refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  // Sem data, o aviso de data já diz o que falta; convertida, a reserva é que
  // responde pelo material.
  if (d.situacao === "SEM_DATA" || d.situacao === "RESERVADA" || !d.data) return null;

  const unica = d.opcoes.length === 1;
  const comFalta = temItensIndisponiveis(d);
  const hora = horaDaConferencia(d.conferidoEm);
  const editar = (ordem: number) => `/comercial/orcamentos/${id}/editar?opcao=${ordem}`;

  return (
    <div className="space-y-3" data-disponibilidade>
      {comFalta ? (
        <AvisoDeIndisponibilidade
          contexto="detalhe"
          data={d.data}
          opcoes={d.opcoes}
          conferidoEm={d.conferidoEm}
          aoVerificar={() => refetch()}
          verificando={isFetching}
          acoesDaOpcao={
            d.situacao === "SEGURA_ITENS"
              ? undefined
              : (op) => (
                  <Button variant="outline" className="min-h-10" asChild>
                    <Link href={editar(op.ordem)}>Editar opção</Link>
                  </Button>
                )
          }
          acoesDoItem={
            d.situacao === "SEGURA_ITENS"
              ? undefined
              : (op, f) => (
                  <>
                    <Button variant="outline" size="sm" className="min-h-10" asChild>
                      <Link href={`${editar(op.ordem)}&item=${f.productId}&acao=substituir`}>
                        {f.noKit > 0 && f.avulso === 0 ? "Trocar o kit" : "Substituir item"}
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" className="min-h-10" asChild>
                      <Link href={`${editar(op.ordem)}&item=${f.productId}&acao=remover`}>
                        {f.noKit > 0 && f.avulso === 0 ? "Remover o kit" : "Remover item"}
                      </Link>
                    </Button>
                  </>
                )
          }
        />
      ) : (
        <section className="painel-cartao space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
              Disponibilidade em {dataNoAviso(d.data)}
            </h2>
            <span className="painel-periodo">reservas + propostas aprovadas aguardando sinal</span>
          </div>
          <ul className="space-y-1.5">
            {d.opcoes.map((op) => (
              <li key={op.id ?? op.ordem} className="flex items-start gap-2 text-sm" data-opcao-disponivel={op.disponivel}>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#2e9b6b" }} aria-hidden />
                <span style={{ color: "var(--color-navy)" }}>
                  {unica ? "A proposta" : `Opção ${op.ordem} — ${op.nome}`}
                  {op.aprovada && !unica ? " (escolhida)" : ""} — tudo disponível
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="min-h-10" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 size-4${isFetching ? " animate-spin" : ""}`} aria-hidden />
              {isFetching ? "Verificando…" : "Verificar novamente"}
            </Button>
            {hora && <span className="painel-periodo">Conferido às {hora}</span>}
          </div>
        </section>
      )}

      {d.situacao === "SEGURA_ITENS" && (
        <p className="px-1 text-xs text-muted-foreground">
          Aprovada: esta proposta segura os itens da opção escolhida para a data até virar reserva ou ser marcada
          como perdida. Nenhuma outra cliente consegue aprovar as mesmas peças nesse meio-tempo.
        </p>
      )}

      {d.reservasSemSinalVencidas.length > 0 && (
        <div className="painel-cartao flex items-start gap-2 p-3 text-xs" style={{ borderColor: "#c69654" }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "#9a6a1f" }} aria-hidden />
          <p className="text-muted-foreground">
            {d.reservasSemSinalVencidas.map((r) => r.numero).join(", ")}:{" "}
            {d.reservasSemSinalVencidas.length === 1 ? "reserva da loja" : "reservas da loja"} sem sinal, com o prazo de
            pagamento vencido, ainda contando na data. A liberação automática ainda não rodou; até lá, as peças
            continuam presas.
          </p>
        </div>
      )}

      {d.seguradoPor.length > 0 && (
        <div className="painel-cartao p-4">
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
    </div>
  );
}
