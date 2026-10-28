import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useFormato } from "@/lib/privacidade";
import { dia, nomeDoMes } from "@/components/financeiro/formato";
import type { Conferencia } from "./tipos";

/**
 * Meses de despesa recorrente que a geração não criou porque já havia um
 * lançamento manual parecido. A pessoa decide: é a mesma conta (vincular),
 * são contas diferentes (gerar) ou este mês não terá conta (dispensar).
 */
export function Conferencias({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<Conferencia[]>({
    queryKey: ["financeiro", "conferencias"],
    queryFn: () => api("/financeiro/conferencias"),
    enabled: aberto,
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[620px]" data-conferencias>
        <DialogHeader>
          <DialogTitle>Conferir lançamentos parecidos</DialogTitle>
          <DialogDescription>
            A despesa recorrente não gerou estes meses porque já existe um lançamento manual que parece ser a mesma conta.
          </DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm">Carregando…</p>}
        {data && data.length === 0 && <p className="text-sm">Nada para conferir.</p>}
        <div className="grid gap-4">
          {data?.map((c) => (
            <ItemDaConferencia
              key={c.id}
              conferencia={c}
              aoResolver={() => {
                queryClient.invalidateQueries({ queryKey: ["financeiro"] });
                if (data.length === 1) aoFechar();
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemDaConferencia({ conferencia: c, aoResolver }: { conferencia: Conferencia; aoResolver: () => void }) {
  const { brl } = useFormato();
  const [escolhido, setEscolhido] = useState(c.candidatos[0]?.id ?? "");
  const resolver = useMutation({
    mutationFn: (corpo: { acao: "VINCULAR"; gastoId: string } | { acao: "GERAR" } | { acao: "DISPENSAR" }) =>
      api(`/financeiro/conferencias/${c.id}`, { method: "POST", body: JSON.stringify(corpo) }),
    onSuccess: (_r, corpo) => {
      toast.success(
        corpo.acao === "VINCULAR"
          ? "Vinculado: o lançamento passa a ser este mês da recorrência."
          : corpo.acao === "GERAR"
            ? "Conta do mês gerada."
            : "Mês dispensado.",
      );
      aoResolver();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  return (
    <div className="fin-cartao grid gap-3" data-conferencia={c.id}>
      <div>
        <p className="font-medium" style={{ color: "var(--fin-navy-ink)" }}>
          {c.recorrencia.descricao} · {nomeDoMes(c.competencia)}
        </p>
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          Vence {dia(c.vencimento)} · {c.recorrencia.tipoDeValor === "VARIAVEL" ? "estimado" : "previsto"}{" "}
          {brl(c.recorrencia.valorPrevisto)}
          {c.recorrencia.fornecedor ? ` · ${c.recorrencia.fornecedor}` : ""}
        </p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs" style={{ color: "var(--fin-muted)" }}>
          Lançamentos parecidos
        </legend>
        {c.candidatos.length === 0 && (
          <p className="text-xs">O lançamento sugerido não existe mais ou já foi vinculado. Gere ou dispense o mês.</p>
        )}
        {c.candidatos.map((g) => (
          <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm">
            <input
              type="radio"
              name={`conferencia-${c.id}`}
              value={g.id}
              checked={escolhido === g.id}
              onChange={() => setEscolhido(g.id)}
              className="size-4"
            />
            <span className="min-w-0 flex-1">
              <span className="block" style={{ color: "var(--fin-navy-ink)" }}>
                {g.descricao}
              </span>
              <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                {brl(g.valor)} · {g.pagoEm ? `pago ${dia(g.pagoEm)}` : `vence ${dia(g.venceEm)}`}
                {g.fornecedor ? ` · ${g.fornecedor}` : ""}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={!escolhido || resolver.isPending}
          onClick={() => resolver.mutate({ acao: "VINCULAR", gastoId: escolhido })}
        >
          É a mesma conta — vincular
        </Button>
        <Button variant="outline" className="min-h-11" disabled={resolver.isPending} onClick={() => resolver.mutate({ acao: "GERAR" })}>
          São contas diferentes — gerar
        </Button>
        <Button variant="ghost" className="min-h-11" disabled={resolver.isPending} onClick={() => resolver.mutate({ acao: "DISPENSAR" })}>
          Não gerar este mês
        </Button>
      </div>
    </div>
  );
}
