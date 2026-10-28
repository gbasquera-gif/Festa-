import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pause, Pencil, Play, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import {
  AJUSTE_DE_DIA_NAO_UTIL_LABEL,
  INTERVALO_DA_RECORRENCIA_LABEL,
  SITUACAO_DA_RECORRENCIA_LABEL,
  type IntervaloDaRecorrencia,
  type Ocorrencia,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useFormato } from "@/lib/privacidade";
import { Natureza } from "@/components/financeiro/pecas";
import { dia, nomeDoMes } from "@/components/financeiro/formato";
import { FormularioDeRecorrencia } from "./FormularioDeRecorrencia";
import type { EventoDaRecorrencia, Recorrencia } from "./tipos";

type Acao = { tipo: "pausar" | "retomar" | "encerrar"; recorrencia: Recorrencia };

const TEXTO_DA_ACAO = {
  pausar: {
    titulo: "Pausar esta despesa?",
    corpo: "As contas futuras em aberto saem da lista. Contas pagas e vencidas ficam. Enquanto pausada, nada é gerado.",
    botao: "Pausar",
  },
  retomar: {
    titulo: "Retomar esta despesa?",
    corpo:
      "Volta a gerar a partir de hoje. Os meses do período pausado não voltam sozinhos: aparecem como meses anteriores, para gerar só se você marcar.",
    botao: "Retomar",
  },
  encerrar: {
    titulo: "Encerrar esta despesa?",
    corpo:
      "Encerra hoje. As contas futuras em aberto saem da lista; pagas e vencidas ficam, com o histórico. Para voltar, cadastre uma nova.",
    botao: "Encerrar",
  },
} as const;

const NOME_DO_EVENTO: Record<EventoDaRecorrencia["tipo"], string> = {
  CRIADA: "Cadastrada",
  EDITADA: "Editada",
  PAUSADA: "Pausada",
  RETOMADA: "Retomada",
  ENCERRADA: "Encerrada",
  RETROATIVAS_GERADAS: "Meses anteriores gerados",
};

/** As despesas recorrentes: cadastro, edição, pausa, retomada e encerramento. */
export function Recorrencias() {
  const { brl } = useFormato();
  const queryClient = useQueryClient();
  const [formAberto, setFormAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Recorrencia | null>(null);
  const [acao, setAcao] = useState<Acao | null>(null);
  const [retroativas, setRetroativas] = useState<Recorrencia | null>(null);
  const [historico, setHistorico] = useState<Recorrencia | null>(null);

  const { data, isLoading, error } = useQuery<Recorrencia[]>({
    queryKey: ["financeiro", "recorrencias"],
    queryFn: () => api("/financeiro/recorrencias"),
  });

  const executar = useMutation({
    mutationFn: (a: Acao) => api<{ contasRemovidas?: number }>(`/financeiro/recorrencias/${a.recorrencia.id}/${a.tipo}`, { method: "POST" }),
    onSuccess: (r, a) => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      const removidas = r?.contasRemovidas ? ` ${r.contasRemovidas} conta(s) futura(s) em aberto removida(s).` : "";
      toast.success(`${a.tipo === "pausar" ? "Pausada." : a.tipo === "retomar" ? "Retomada." : "Encerrada."}${removidas}`);
      setAcao(null);
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const lista = data ?? [];

  return (
    <div className="space-y-4" data-recorrencias>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
          Contas que se repetem. Cada mês vira um lançamento a pagar em Despesas — o mesmo registro, não uma lista à parte. A
          geração cria o mês corrente e o seguinte; meses anteriores ao cadastro só se você pedir.
        </p>
        <Button
          className="min-h-11"
          onClick={() => {
            setEmEdicao(null);
            setFormAberto(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Nova despesa recorrente
        </Button>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar as despesas recorrentes.</p>}
      {!isLoading && lista.length === 0 && (
        <div className="fin-cartao text-center">
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhuma despesa recorrente cadastrada.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {lista.map((r) => (
          <article
            key={r.id}
            className="fin-cartao grid gap-3"
            style={r.situacao === "ENCERRADA" ? { opacity: 0.65 } : undefined}
            data-recorrencia={r.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
                  {r.descricao}
                </h3>
                <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
                  {INTERVALO_DA_RECORRENCIA_LABEL[r.intervaloMeses as IntervaloDaRecorrencia]} · todo dia {r.diaDoVencimento}
                  {r.fornecedor ? ` · ${r.fornecedor}` : ""}
                </p>
              </div>
              <span
                className={`fin-situacao ${r.situacao === "ATIVA" ? "quitado" : r.situacao === "PAUSADA" ? "parcial" : "cancelado"}`}
              >
                {SITUACAO_DA_RECORRENCIA_LABEL[r.situacao]}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="fin-rotulo">{r.tipoDeValor === "FIXO" ? "Valor" : "Estimado"}</dt>
                <dd className="fin-numero">{brl(r.valorPrevisto)}</dd>
              </div>
              <div>
                <dt className="fin-rotulo">Próximo</dt>
                <dd>{r.proximoVencimento ? dia(`${r.proximoVencimento}T12:00:00Z`) : "—"}</dd>
              </div>
              <div>
                <dt className="fin-rotulo">Contas</dt>
                <dd>
                  {r.contasEmAberto} em aberto · {r.contasPagas} paga{r.contasPagas === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--fin-muted)" }}>
              <Natureza valor={r.natureza} />
              <span>desde {dia(`${r.dataInicial}T12:00:00Z`)}</span>
              {r.dataFinal && <span>até {dia(`${r.dataFinal}T12:00:00Z`)}</span>}
              {r.ajusteDiaNaoUtil !== "MANTER" && <span>· {AJUSTE_DE_DIA_NAO_UTIL_LABEL[r.ajusteDiaNaoUtil].toLowerCase()}</span>}
            </div>

            {r.conferenciasPendentes > 0 && (
              <p className="text-xs" style={{ color: "var(--fin-gold-dark)" }}>
                {r.conferenciasPendentes} mês(es) esperando conferência (aba Contas).
              </p>
            )}
            {r.retroativasDisponiveis.length > 0 && r.situacao !== "ENCERRADA" && (
              <button
                type="button"
                className="min-h-11 rounded-md border border-dashed px-3 text-left text-sm"
                style={{ color: "var(--fin-navy-ink)" }}
                onClick={() => setRetroativas(r)}
              >
                {r.retroativasDisponiveis.length} mês(es) anterior(es) não gerado(s) — escolher quais gerar
              </button>
            )}

            <div className="flex flex-wrap gap-1">
              {r.situacao !== "ENCERRADA" && (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setEmEdicao(r);
                    setFormAberto(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              )}
              {r.situacao === "ATIVA" && (
                <Button variant="ghost" className="min-h-11" onClick={() => setAcao({ tipo: "pausar", recorrencia: r })}>
                  <Pause className="mr-1 h-4 w-4" /> Pausar
                </Button>
              )}
              {r.situacao === "PAUSADA" && (
                <Button variant="ghost" className="min-h-11" onClick={() => setAcao({ tipo: "retomar", recorrencia: r })}>
                  <Play className="mr-1 h-4 w-4" /> Retomar
                </Button>
              )}
              {r.situacao !== "ENCERRADA" && (
                <Button variant="ghost" className="min-h-11" onClick={() => setAcao({ tipo: "encerrar", recorrencia: r })}>
                  <Square className="mr-1 h-4 w-4" /> Encerrar
                </Button>
              )}
              <Button variant="ghost" className="min-h-11" onClick={() => setHistorico(r)}>
                <History className="mr-1 h-4 w-4" /> Histórico
              </Button>
            </div>
          </article>
        ))}
      </div>

      <FormularioDeRecorrencia aberto={formAberto} recorrencia={emEdicao} aoFechar={() => setFormAberto(false)} />

      <AlertDialog open={acao !== null} onOpenChange={(v) => !v && setAcao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{acao ? TEXTO_DA_ACAO[acao.tipo].titulo : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {acao?.recorrencia.descricao}. {acao ? TEXTO_DA_ACAO[acao.tipo].corpo : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" disabled={executar.isPending} onClick={() => acao && executar.mutate(acao)}>
              {acao ? TEXTO_DA_ACAO[acao.tipo].botao : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GerarRetroativas recorrencia={retroativas} aoFechar={() => setRetroativas(null)} />
      <Historico recorrencia={historico} aoFechar={() => setHistorico(null)} />
    </div>
  );
}

/** Escolher, mês a mês, quais meses anteriores ao cadastro gerar. Nada vem marcado. */
function GerarRetroativas({ recorrencia, aoFechar }: { recorrencia: Recorrencia | null; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const gerar = useMutation({
    mutationFn: () =>
      api<{ resultados: { competencia: string; resultado: string }[] }>(`/financeiro/recorrencias/${recorrencia!.id}/retroativas`, {
        method: "POST",
        body: JSON.stringify({ competencias: Array.from(marcadas) }),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      const geradas = r.resultados.filter((x) => x.resultado === "GERADA").length;
      const conferir = r.resultados.filter((x) => x.resultado === "CONFERENCIA").length;
      toast.success(`${geradas} mês(es) gerado(s)${conferir ? `; ${conferir} parecido(s) com lançamento manual, para conferir` : ""}.`);
      setMarcadas(new Set());
      aoFechar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });
  const alternar = (o: Ocorrencia) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(o.competencia)) n.delete(o.competencia);
      else n.add(o.competencia);
      return n;
    });

  return (
    <Dialog
      open={recorrencia !== null}
      onOpenChange={(v) => {
        if (!v) {
          setMarcadas(new Set());
          aoFechar();
        }
      }}
    >
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[480px]" data-retroativas>
        <DialogHeader>
          <DialogTitle>Meses anteriores</DialogTitle>
          <DialogDescription>
            {recorrencia?.descricao}: meses que venceram antes do cadastro. Quase sempre já foram pagos e lançados à mão — por
            isso nenhum vem marcado. Os marcados nascem em aberto; lançamento manual parecido vai para conferência.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {recorrencia?.retroativasDisponiveis.map((o) => (
            <label key={o.competencia} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm">
              <input type="checkbox" checked={marcadas.has(o.competencia)} onChange={() => alternar(o)} className="size-4" />
              <span className="flex-1 capitalize">{nomeDoMes(o.competencia)}</span>
              <span style={{ color: "var(--fin-muted)" }}>vence {dia(`${o.vencimento}T12:00:00Z`)}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button className="min-h-11" disabled={marcadas.size === 0 || gerar.isPending} onClick={() => gerar.mutate()}>
            Gerar {marcadas.size || ""} mês(es)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Historico({ recorrencia, aoFechar }: { recorrencia: Recorrencia | null; aoFechar: () => void }) {
  const { brl } = useFormato();
  const { data } = useQuery<EventoDaRecorrencia[]>({
    queryKey: ["financeiro", "recorrencias", recorrencia?.id, "historico"],
    queryFn: () => api(`/financeiro/recorrencias/${recorrencia!.id}/historico`),
    enabled: recorrencia !== null,
  });
  const valor = (campo: string, v: unknown) =>
    campo === "valorPrevisto" && typeof v === "number" ? brl(v) : v === null || v === undefined || v === "" ? "—" : String(v);

  return (
    <Dialog open={recorrencia !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[520px]" data-historico-recorrencia>
        <DialogHeader>
          <DialogTitle>Histórico</DialogTitle>
          <DialogDescription>{recorrencia?.descricao}</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {data?.map((e) => (
            <li key={e.id} className="rounded-md border px-3 py-2 text-sm">
              <p className="font-medium" style={{ color: "var(--fin-navy-ink)" }}>
                {NOME_DO_EVENTO[e.tipo]}
                <span className="ml-2 font-normal" style={{ color: "var(--fin-muted)" }}>
                  {new Date(e.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </span>
              </p>
              {e.tipo === "EDITADA" && e.antes && !Array.isArray(e.depois) && (
                <ul className="mt-1 text-xs" style={{ color: "var(--fin-muted)" }}>
                  {Object.keys(e.antes).map((campo) => (
                    <li key={campo}>
                      {campo}: {valor(campo, e.antes![campo])} → {valor(campo, (e.depois as Record<string, unknown>)[campo])}
                    </li>
                  ))}
                </ul>
              )}
              {e.contasAfetadas > 0 && (
                <p className="mt-1 text-xs" style={{ color: "var(--fin-muted)" }}>
                  {e.contasAfetadas} conta(s) em aberto alcançada(s).
                </p>
              )}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
