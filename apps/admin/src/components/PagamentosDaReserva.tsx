import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ORIGEM_DO_PAGAMENTO_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  type OrigemDoPagamento,
  type PaymentMethod,
  type PaymentStatus,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export type PagamentoDaReserva = {
  id: string;
  amount: string | number;
  status: string;
  method: string;
  type?: string;
  paidAt?: string | null;
  origem?: string | null;
  observacao?: string | null;
  externalReference?: string | null;
  registradoPor?: { name: string } | null;
};

export type AlteracaoDePagamento = {
  id: string;
  entidadeId: string;
  acao: "CORRECAO" | "ANULACAO";
  antes: { valor?: number; recebidoEm?: string | null };
  depois: { valor?: number; recebidoEm?: string; status?: string };
  justificativa: string;
  criadoEm: string;
  usuario: { name: string } | null;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "sem data");

/**
 * Os pagamentos da reserva: de onde veio cada um, quem lançou e, para o
 * ADMIN, a correção de um lançamento manual — com o histórico do que mudou.
 *
 * Corrigir não apaga nem reescreve em silêncio: o servidor guarda o antes, o
 * depois, quem e por quê. Pagamento do Mercado Pago não se corrige aqui.
 */
export function PagamentosDaReserva({
  reservaId,
  pagamentos,
  alteracoes,
  cancelada,
}: {
  reservaId: string;
  pagamentos: PagamentoDaReserva[];
  alteracoes: AlteracaoDePagamento[];
  cancelada: boolean;
}) {
  const { user } = useAuth();
  const ehAdmin = user?.role === "ADMIN";
  const [corrigindo, setCorrigindo] = useState<PagamentoDaReserva | null>(null);

  if (pagamentos.length === 0) return <p className="text-muted-foreground">Nenhum pagamento registrado.</p>;

  return (
    <>
      <ul className="space-y-2" data-pagamentos>
        {pagamentos.map((p) => {
          const anulado = p.status === "ANULADO";
          const corrigivel = ehAdmin && !cancelada && p.status === "PAID" && !p.externalReference;
          const historico = alteracoes.filter((a) => a.entidadeId === p.id);
          return (
            <li key={p.id} className="rounded-md border px-3 py-2" data-pagamento={p.status}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={anulado ? "text-muted-foreground line-through" : ""}>
                  <strong className="tabular-nums">{brl(Number(p.amount))}</strong> ·{" "}
                  {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method} · {dia(p.paidAt)} ·{" "}
                  {PAYMENT_STATUS_LABEL[p.status as PaymentStatus] ?? p.status}
                </span>
                {corrigivel && (
                  <Button type="button" variant="ghost" size="sm" className="min-h-9" onClick={() => setCorrigindo(p)} data-corrigir-pagamento>
                    Corrigir
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {p.origem
                  ? ORIGEM_DO_PAGAMENTO_LABEL[p.origem as OrigemDoPagamento]
                  : p.externalReference
                    ? "Mercado Pago"
                    : "lançamento anterior ao registro de origem"}
                {p.registradoPor ? ` · por ${p.registradoPor.name}` : ""}
                {p.observacao ? ` · “${p.observacao}”` : ""}
              </p>
              {historico.length > 0 && (
                <ul className="mt-1 space-y-0.5 border-t pt-1 text-xs text-muted-foreground" data-historico-pagamento>
                  {historico.map((a) => (
                    <li key={a.id}>
                      {new Date(a.criadoEm).toLocaleString("pt-BR")} · {a.usuario?.name ?? "—"} ·{" "}
                      {a.acao === "ANULACAO"
                        ? "anulou o lançamento"
                        : [
                            a.depois.valor !== undefined ? `valor ${brl(a.antes.valor ?? 0)} → ${brl(a.depois.valor)}` : null,
                            a.depois.recebidoEm ? `data ${dia(a.antes.recebidoEm)} → ${dia(a.depois.recebidoEm)}` : null,
                          ]
                            .filter(Boolean)
                            .join("; ")}{" "}
                      · “{a.justificativa}”
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <CorrecaoDePagamento reservaId={reservaId} pagamento={corrigindo} aoFechar={() => setCorrigindo(null)} />
    </>
  );
}

function CorrecaoDePagamento({
  reservaId,
  pagamento,
  aoFechar,
}: {
  reservaId: string;
  pagamento: PagamentoDaReserva | null;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [acao, setAcao] = useState<"CORRIGIR" | "ANULAR">("CORRIGIR");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!pagamento) return;
    setAcao("CORRIGIR");
    setValor(String(Number(pagamento.amount)));
    setData(pagamento.paidAt ? pagamento.paidAt.slice(0, 10) : "");
    setJustificativa("");
    setErro(null);
  }, [pagamento]);

  const valorOriginal = pagamento ? Number(pagamento.amount) : 0;
  const dataOriginal = pagamento?.paidAt?.slice(0, 10) ?? "";
  const mudouValor = Math.round(Number(valor) * 100) !== Math.round(valorOriginal * 100);
  const mudouData = data !== "" && data !== dataOriginal;
  const pode =
    justificativa.trim().length >= 10 && (acao === "ANULAR" || ((mudouValor || mudouData) && Number(valor) > 0));

  const enviar = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservaId}/pagamentos/${pagamento?.id}/correcao`, {
        method: "POST",
        body: JSON.stringify(
          acao === "ANULAR"
            ? { acao, justificativa: justificativa.trim() }
            : {
                acao,
                ...(mudouValor ? { novoValor: Number(valor) } : {}),
                ...(mudouData ? { novaData: data } : {}),
                justificativa: justificativa.trim(),
              },
        ),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(acao === "ANULAR" ? "Lançamento anulado. O histórico ficou registrado." : "Pagamento corrigido. O histórico ficou registrado.");
      aoFechar();
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <Dialog open={pagamento !== null} onOpenChange={(v) => !v && !enviar.isPending && aoFechar()}>
      <DialogContent className="sm:max-w-[480px]" data-correcao-pagamento>
        <DialogHeader>
          <DialogTitle>Corrigir pagamento</DialogTitle>
          <DialogDescription>
            Para lançamento manual com valor ou data errados, ou registrado por engano. O valor anterior, o novo, quem
            corrigiu e a justificativa ficam no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="O que fazer">
            {(["CORRIGIR", "ANULAR"] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={acao === a}
                onClick={() => setAcao(a)}
                className="min-h-11 rounded-md border px-3 text-sm"
                style={acao === a ? { borderColor: "var(--color-navy)", boxShadow: "0 0 0 1px var(--color-navy)" } : undefined}
              >
                {a === "CORRIGIR" ? "Corrigir valor ou data" : "Anular lançamento"}
              </button>
            ))}
          </div>
          {acao === "CORRIGIR" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="correcao-valor">Valor correto</Label>
                <Input id="correcao-valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} className="min-h-11" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correcao-data">Data em que o dinheiro entrou</Label>
                <Input id="correcao-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="min-h-11" />
              </div>
            </div>
          ) : (
            <p className="rounded-md px-3 py-2 text-sm" style={{ background: "rgba(224,90,58,0.08)" }}>
              O lançamento de {brl(valorOriginal)} sai do recebido e do caixa, e o saldo da reserva volta a subir. Ele
              continua visível, riscado, com a justificativa.
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="correcao-justificativa">Justificativa (obrigatória)</Label>
            <Textarea
              id="correcao-justificativa"
              rows={2}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Ex.: Pix lançado em duplicidade, conferido no extrato do dia 12."
            />
          </div>
          {erro && <p className="text-sm" style={{ color: "#c4472a" }}>{erro}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => enviar.mutate()} disabled={!pode || enviar.isPending} className="min-h-11" variant={acao === "ANULAR" ? "destructive" : "default"}>
            {enviar.isPending ? "Salvando…" : acao === "ANULAR" ? "Anular lançamento" : "Salvar correção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
