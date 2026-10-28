import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { diaEmChapeco } from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useFormato } from "@/lib/privacidade";
import { dia, nomeDoMes } from "@/components/financeiro/formato";
import type { Conta } from "./tipos";

const FORMAS = ["Pix", "Boleto", "Débito automático", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro"];

/**
 * Registrar o pagamento de uma conta: o dia em que o dinheiro saiu, o valor
 * que saiu de fato e a forma.
 *
 * É o único caminho para a conta sair de "a pagar". Nada é quitado sozinho:
 * a recorrência gera a obrigação, quem paga informa o pagamento.
 */
export function RegistrarPagamento({ conta, aoFechar }: { conta: Conta | null; aoFechar: () => void }) {
  const { brl } = useFormato();
  const queryClient = useQueryClient();
  const hoje = diaEmChapeco(new Date());
  const [pagoEm, setPagoEm] = useState(hoje);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!conta) return;
    setPagoEm(hoje);
    setValor(String(conta.valor));
    setForma("");
    setObservacao("");
    // Reabre limpo a cada conta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta?.id]);

  const registrar = useMutation({
    mutationFn: () =>
      api(`/financeiro/contas-a-pagar/${conta!.id}/pagamento`, {
        method: "POST",
        body: JSON.stringify({
          pagoEm,
          valor: Number(valor),
          formaDePagamento: forma.trim() || null,
          observacao: observacao.trim() || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
      toast.success("Pagamento registrado.");
      aoFechar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const variavel = conta?.recorrencia?.tipoDeValor === "VARIAVEL";
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(pagoEm) && pagoEm <= hoje && Number(valor) > 0;

  return (
    <Dialog open={conta !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[480px]" data-registrar-pagamento>
        <DialogHeader>
          <DialogTitle>Registrar pagamento</DialogTitle>
          <DialogDescription>
            {conta?.descricao}
            {conta?.venceEm ? ` · vence ${dia(conta.venceEm)}` : ""}
            {conta ? ` · ${variavel ? "estimado" : "previsto"} ${brl(conta.valor)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="pagamento-dia">Pago em</Label>
              <Input
                id="pagamento-dia"
                type="date"
                max={hoje}
                value={pagoEm}
                onChange={(e) => setPagoEm(e.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pagamento-valor">Valor pago</Label>
              <Input
                id="pagamento-valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="min-h-11"
              />
            </div>
          </div>
          {variavel && (
            <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
              Valor variável: informe o que saiu de fato. A estimativa da recorrência não muda.
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="pagamento-forma">Forma de pagamento (opcional)</Label>
            <Input
              id="pagamento-forma"
              list="formas-de-pagamento"
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              className="min-h-11"
            />
            <datalist id="formas-de-pagamento">
              {FORMAS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pagamento-obs">Observação (opcional)</Label>
            <Input id="pagamento-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} className="min-h-11" />
          </div>
          <p className="rounded-md border px-3 py-2 text-xs" style={{ color: "var(--fin-navy-ink)" }}>
            {pagoEm && pagoEm <= hoje
              ? `A saída entra no caixa, no saldo e na DRE de ${nomeDoMes(pagoEm.slice(0, 7))}, mês do pagamento.`
              : "A data do pagamento não pode ser futura."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => registrar.mutate()} disabled={!valido || registrar.isPending} className="min-h-11">
            {registrar.isPending ? "Registrando…" : "Registrar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
