import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  diaEmChapeco,
  formatarDataDaFesta,
  formatarReais,
  type PaymentMethod,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

/**
 * Registrar que a Festaê já devolveu o dinheiro à cliente.
 *
 * Registrar não é executar: o sistema não faz Pix, não estorna no Mercado
 * Pago, não move dinheiro nenhum. A Festaê devolve por fora e diz aqui o dia
 * em que devolveu — é esse dia que tira o valor do caixa. Por isso o botão
 * nunca se chama "Reembolsar", e a confirmação diz com todas as letras que o
 * registro não faz a transferência.
 */
export function RegistrarReembolsoRealizado({
  reservaId,
  tratamentoComplementarId,
  cliente,
  valor,
  pendenteDesde,
  aberto,
  aoFechar,
  aoRegistrar,
}: {
  reservaId: string;
  /** Nulo para o reembolso do tratamento do cancelamento. */
  tratamentoComplementarId: string | null;
  cliente: string;
  valor: number;
  /** Quando o tratamento destinou o reembolso: a devolução não pode ser anterior. */
  pendenteDesde: string;
  aberto: boolean;
  aoFechar: () => void;
  aoRegistrar: () => void;
}) {
  const hoje = diaEmChapeco(new Date());
  const desde = diaEmChapeco(new Date(pendenteDesde));
  const [dia, setDia] = useState("");
  const [forma, setForma] = useState<PaymentMethod>("PIX");
  const [observacao, setObservacao] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  const foraDoIntervalo = dia !== "" && (dia > hoje || dia < desde);

  const registrar = useMutation({
    mutationFn: () =>
      api<{ registrado: true; valor: number; realizadoEm: string }>(
        `/reservations/${reservaId}/reembolso-realizado`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(tratamentoComplementarId ? { tratamentoComplementarId } : {}),
            realizadoEm: dia,
            forma,
            observacao: observacao.trim() || undefined,
          }),
        },
      ),
    onSuccess: (r) => {
      aoRegistrar();
      toast.success(`Reembolso de ${formatarReais(r.valor)} registrado como realizado em ${formatarDataDaFesta(dia)}.`);
      fechar();
    },
    onError: (e) => {
      // Outra pessoa (ou outro clique) registrou antes: a tela recarrega e
      // mostra o registro que valeu, sem tirar o dinheiro do caixa de novo.
      if (e instanceof ApiError && e.status === 409) aoRegistrar();
      setRecusa(e instanceof Error ? e.message : "Não foi possível registrar o reembolso.");
    },
  });

  function fechar() {
    setDia("");
    setForma("PIX");
    setObservacao("");
    setConfirmado(false);
    setRecusa(null);
    aoFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar reembolso realizado</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>
            Reembolso de <strong className="text-navy">{formatarReais(valor)}</strong> para{" "}
            <strong>{cliente}</strong>, pendente desde {formatarDataDaFesta(desde)}.
          </p>
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            O sistema não faz a devolução. Registre aqui a devolução que a Festaê já fez por Pix ou outro meio: o
            valor sai do caixa no dia informado.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="dia-reembolso-realizado">Dia em que a devolução foi feita *</Label>
              <Input
                id="dia-reembolso-realizado"
                type="date"
                min={desde}
                max={hoje}
                value={dia}
                onChange={(e) => {
                  setDia(e.target.value);
                  setRecusa(null);
                }}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="forma-reembolso-realizado">Meio</Label>
              <select
                id="forma-reembolso-realizado"
                className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:h-9"
                value={forma}
                onChange={(e) => setForma(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {foraDoIntervalo && (
            <p className="text-xs text-amber-800">
              {dia > hoje
                ? "Reembolso no futuro ainda não foi feito: registre quando a devolução acontecer."
                : `O reembolso ficou pendente em ${formatarDataDaFesta(desde)}: não pode ter sido feito antes.`}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="observacao-reembolso">Observação</Label>
            <textarea
              id="observacao-reembolso"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              placeholder="Ex.: Pix para a chave da cliente, comprovante no WhatsApp"
            />
          </div>
          <label className="flex items-start gap-2 rounded-md border border-input p-3">
            <input
              id="confirmo-reembolso"
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            <span>
              Confirmo que a Festaê já devolveu {formatarReais(valor)} à cliente. Este registro não faz a
              transferência.
            </span>
          </label>
          {recusa && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{recusa}</div>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={fechar}>
            Voltar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={!dia || foraDoIntervalo || !confirmado || registrar.isPending}
            onClick={() => registrar.mutate()}
          >
            {registrar.isPending ? "Registrando..." : "Registrar reembolso realizado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
