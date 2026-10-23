import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  formatarReais,
  limiteDeAplicacao,
  motivoDeRecusaDaAplicacao,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { novaChave } from "@/lib/chave";

/**
 * Usar o crédito Festaê da cliente numa festa já registrada.
 *
 * Nunca automático e pode ser parcial: a tela propõe o máximo que cabe — o
 * menor entre o saldo da cliente e o que falta pagar — e a pessoa ajusta. O
 * servidor confere de novo sob trava, porque entre abrir o diálogo e
 * confirmar outra aba pode ter usado o mesmo crédito.
 */
export function AplicarCredito({
  reservaId,
  cliente,
  total,
  jaPago,
  creditoAplicado,
  saldoDaCliente,
  aberto,
  aoFechar,
  aoAplicar,
}: {
  reservaId: string;
  cliente: string;
  total: number;
  jaPago: number;
  creditoAplicado: number;
  saldoDaCliente: number;
  aberto: boolean;
  aoFechar: () => void;
  aoAplicar: () => void;
}) {
  const maximo = limiteDeAplicacao({ saldoDaCliente, total, recebido: jaPago, creditoJaAplicado: creditoAplicado });
  const faltaPagar = Math.max(0, total - jaPago - creditoAplicado);
  const [valor, setValor] = useState(maximo > 0 ? maximo.toFixed(2) : "");
  const [recusa, setRecusa] = useState<string | null>(null);
  // Uma chave por abertura do diálogo: o mesmo pedido enviado de novo (clique
  // duplo, rede que caiu) não gasta o crédito duas vezes.
  const [chaveDeIdempotencia] = useState(() => novaChave());
  const valorDigitado = Number(valor) || 0;
  const sobra = Math.max(0, Math.round((saldoDaCliente - valorDigitado) * 100) / 100);

  const problema = motivoDeRecusaDaAplicacao({ valor: Number(valor) || 0, saldoDaCliente, faltaPagar });

  const aplicar = useMutation({
    mutationFn: () =>
      api<{ saldoDaCliente: number; faltaPagar: number; reservaConfirmada: boolean; repetido?: boolean }>(
        `/reservations/${reservaId}/creditos`,
        { method: "POST", body: JSON.stringify({ valor: Number(valor), chaveDeIdempotencia }) },
      ),
    onSuccess: (r) => {
      // Envio repetido (a primeira resposta se perdeu): nada novo foi gravado.
      if (r.repetido) {
        toast.success("Este crédito já tinha sido aplicado. Nada novo foi gravado.");
        aoAplicar();
        aoFechar();
        return;
      }
      toast.success(
        `Crédito de ${formatarReais(Number(valor))} aplicado. ` +
          (r.faltaPagar > 0 ? `Falta pagar ${formatarReais(r.faltaPagar)}.` : "A festa está coberta.") +
          (r.reservaConfirmada ? " A reserva está confirmada." : ""),
      );
      aoAplicar();
      aoFechar();
    },
    onError: (e) => setRecusa(e instanceof Error ? e.message : "Não foi possível aplicar o crédito."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar crédito Festaê</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>
            <strong className="text-navy">{cliente}</strong> tem{" "}
            <strong className="text-navy">{formatarReais(saldoDaCliente)}</strong> de crédito Festaê disponível.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 tabular-nums">
            <dt className="text-muted-foreground">Valor da festa</dt>
            <dd className="text-right">{formatarReais(total)}</dd>
            <dt className="text-muted-foreground">Pagamentos</dt>
            <dd className="text-right">{formatarReais(jaPago)}</dd>
            {creditoAplicado > 0 && (
              <>
                <dt className="text-muted-foreground">Crédito já aplicado</dt>
                <dd className="text-right">{formatarReais(creditoAplicado)}</dd>
              </>
            )}
            <dt className="font-medium text-navy">Falta pagar</dt>
            <dd className="text-right font-medium text-navy">{formatarReais(faltaPagar)}</dd>
            <dt className="text-muted-foreground">Crédito disponível</dt>
            <dd className="text-right">{formatarReais(saldoDaCliente)}</dd>
            <dt className="text-muted-foreground">Limite nesta festa</dt>
            <dd className="text-right">{formatarReais(maximo)}</dd>
          </dl>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="valor-do-credito">Quanto usar nesta festa</Label>
            <Input
              id="valor-do-credito"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              max={maximo}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setRecusa(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Até {formatarReais(maximo)}. O crédito abate o que falta pagar; o valor da festa não muda.
            </p>
            {!problema && (
              <p className="text-xs text-navy" data-credito-que-sobra>
                Depois de aplicar: falta pagar {formatarReais(Math.max(0, faltaPagar - valorDigitado))} · crédito que sobra{" "}
                {formatarReais(sobra)}.
              </p>
            )}
          </div>
          {(recusa || (valor !== "" && problema)) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {recusa ?? problema}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={aoFechar}>
            Voltar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={Boolean(problema) || aplicar.isPending}
            onClick={() => aplicar.mutate()}
          >
            {aplicar.isPending ? "Aplicando..." : "Aplicar crédito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
