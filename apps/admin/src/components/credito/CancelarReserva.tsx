import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Copy, FileDown } from "lucide-react";
import {
  diaEmChapeco,
  formatarReais,
  fromCentsInt,
  mensagemDoVoucher,
  motivoDeRecusaDaDistribuicao,
  toCentsInt,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";

type Resultado = {
  cancelada: true;
  clienteId: string;
  recebido: number;
  creditoDevolvido: number;
  voucher: { id: string; numero: number; valor: number } | null;
};

/** O valor de um campo numérico (o navegador entrega com ponto). Vazio é zero. */
function lerValor(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Copiar sem depender de o navegador cooperar: quando a área de
 * transferência recusa, o aviso diz isso em vez de fingir que copiou.
 */
async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Mensagem copiada. É só colar no WhatsApp da cliente.");
  } catch {
    toast.error("Não foi possível copiar por aqui. Selecione o texto e copie à mão.");
  }
}

/**
 * Cancelar a reserva dizendo o que fazer com o dinheiro.
 *
 * O valor pago (só pagamento confirmado) é distribuído inteiro entre crédito
 * Festaê, reembolso e retenção — a tela mostra a soma enquanto a pessoa
 * digita e só libera o botão quando ela fecha. Crédito Festaê que estava
 * aplicado na festa não entra na conta: ele volta sozinho ao saldo da
 * cliente, e a tela diz isso.
 *
 * Depois de cancelar com crédito, o diálogo vira a tela do voucher: é a hora
 * em que a cliente está esperando a confirmação do outro lado.
 */
export function CancelarReserva({
  reservaId,
  cliente,
  data,
  total,
  jaPago,
  creditoAplicado,
  aberto,
  aoFechar,
  aoCancelar,
}: {
  reservaId: string;
  cliente: string;
  data: string;
  total: number;
  /** Soma dos pagamentos confirmados (PAID). */
  jaPago: number;
  creditoAplicado: number;
  aberto: boolean;
  aoFechar: () => void;
  aoCancelar: () => void;
}) {
  const [, navegar] = useLocation();
  const [motivo, setMotivo] = useState("");
  const [credito, setCredito] = useState("");
  const [reembolso, setReembolso] = useState("");
  const [retencao, setRetencao] = useState("");
  const [reembolsadoEm, setReembolsadoEm] = useState(diaEmChapeco(new Date()));
  const [recusa, setRecusa] = useState<string | null>(null);
  const [feito, setFeito] = useState<Resultado | null>(null);

  const pago = fromCentsInt(toCentsInt(jaPago));
  const distribuicao = {
    credito: lerValor(credito),
    reembolso: lerValor(reembolso),
    retencao: lerValor(retencao),
  };
  const distribuido = fromCentsInt(
    toCentsInt(distribuicao.credito) + toCentsInt(distribuicao.reembolso) + toCentsInt(distribuicao.retencao),
  );
  const problema = useMemo(
    () => motivoDeRecusaDaDistribuicao(pago, distribuicao),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pago, credito, reembolso, retencao],
  );
  const faltaData = distribuicao.reembolso > 0 && !reembolsadoEm;
  const podeCancelar = motivo.trim().length >= 3 && !problema && !faltaData;

  function preencher(destino: "credito" | "reembolso" | "retencao") {
    const tudo = pago.toFixed(2);
    setCredito(destino === "credito" ? tudo : "");
    setReembolso(destino === "reembolso" ? tudo : "");
    setRetencao(destino === "retencao" ? tudo : "");
    setRecusa(null);
  }

  const cancelar = useMutation({
    mutationFn: () =>
      api<Resultado>(`/reservations/${reservaId}/cancelar`, {
        method: "PATCH",
        body: JSON.stringify({
          motivo: motivo.trim(),
          credito: distribuicao.credito,
          reembolso: distribuicao.reembolso,
          reembolsadoEm: distribuicao.reembolso > 0 ? reembolsadoEm : undefined,
          retencao: distribuicao.retencao,
        }),
      }),
    onSuccess: (r) => {
      aoCancelar();
      if (r.voucher) {
        setFeito(r);
        return;
      }
      toast.success(
        "Reserva cancelada. A data e o material voltaram a ficar livres." +
          (r.creditoDevolvido > 0
            ? ` ${formatarReais(r.creditoDevolvido)} de crédito usado voltaram ao saldo da cliente.`
            : ""),
      );
      fechar();
    },
    onError: (e) => {
      // O servidor confere contra o pago lido na hora: se um pagamento caiu
      // enquanto a tela estava aberta, a recusa traz o número novo.
      if (e instanceof ApiError && typeof e.detalhes?.recebido === "number") {
        setRecusa(`${e.message} (pago confirmado agora: ${formatarReais(e.detalhes.recebido as number)})`);
        return;
      }
      setRecusa(e instanceof Error ? e.message : "Não foi possível cancelar.");
    },
  });

  function fechar() {
    setMotivo("");
    setCredito("");
    setReembolso("");
    setRetencao("");
    setRecusa(null);
    setFeito(null);
    aoFechar();
  }

  const campo = (rotulo: string, nota: string, valor: string, mudar: (v: string) => void, id: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="0.01"
        min={0}
        value={valor}
        onChange={(e) => {
          mudar(e.target.value);
          setRecusa(null);
        }}
        placeholder="0,00"
      />
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        {feito?.voucher ? (
          <div className="min-w-0 space-y-4" data-voucher-gerado>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
                Reserva cancelada
              </DialogTitle>
            </DialogHeader>
            <p className="text-base font-medium text-navy">
              Crédito de {formatarReais(feito.voucher.valor)} gerado com sucesso.
            </p>
            {feito.creditoDevolvido > 0 && (
              <p className="text-sm text-muted-foreground">
                {formatarReais(feito.creditoDevolvido)} de crédito que estava sendo usado nesta festa
                também voltaram ao saldo da cliente.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                className="h-11 sm:h-9"
                onClick={() => navegar(`/clientes/${feito.clienteId}/creditos/${feito.voucher!.id}/voucher`)}
              >
                <FileDown className="mr-2 size-4" aria-hidden />
                Baixar Voucher de Crédito
              </Button>
              <Button
                variant="outline"
                className="h-11 sm:h-9"
                onClick={() => copiar(mensagemDoVoucher(cliente, feito.voucher!.valor))}
              >
                <Copy className="mr-2 size-4" aria-hidden />
                Copiar mensagem para cliente
              </Button>
            </div>
            <pre className="min-w-0 whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans text-sm text-navy">
              {mensagemDoVoucher(cliente, feito.voucher.valor)}
            </pre>
            <DialogFooter>
              <Button variant="ghost" className="w-full sm:w-auto" onClick={fechar}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cancelar a reserva de {cliente}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>
                A festa de <strong>{data}</strong> deixa de ocupar a agenda, e o material volta para o
                acervo. A reserva continua no sistema com o histórico; fica gravado quem cancelou, quando
                e por quê.
              </p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 tabular-nums">
                <dt className="text-muted-foreground">Valor contratado</dt>
                <dd className="text-right">{formatarReais(total)}</dd>
                <dt className="text-muted-foreground">Pago (confirmado)</dt>
                <dd className="text-right font-semibold text-navy">{formatarReais(pago)}</dd>
                {creditoAplicado > 0 && (
                  <>
                    <dt className="text-muted-foreground">Crédito Festaê usado</dt>
                    <dd className="text-right">{formatarReais(creditoAplicado)}</dd>
                  </>
                )}
              </dl>
              {creditoAplicado > 0 && (
                <p className="text-xs text-muted-foreground">
                  Os {formatarReais(creditoAplicado)} de crédito usados nesta festa voltam sozinhos ao
                  saldo da cliente. Distribua abaixo só o que foi pago.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="motivo-cancelamento">Motivo do cancelamento *</Label>
                <textarea
                  id="motivo-cancelamento"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                  placeholder="Ex.: a cliente mudou de cidade"
                />
                <p className="text-xs text-muted-foreground">
                  Aparece no detalhe da reserva e no Voucher de Crédito, se houver crédito.
                </p>
              </div>

              {pago > 0 ? (
                <fieldset className="space-y-3 rounded-md border p-3">
                  <legend className="px-1 text-sm font-medium text-navy">
                    O que fazer com os {formatarReais(pago)} pagos?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["credito", "Tudo em crédito"],
                        ["reembolso", "Reembolsar tudo"],
                        ["retencao", "Reter tudo"],
                      ] as const
                    ).map(([destino, rotulo]) => (
                      <button
                        key={destino}
                        type="button"
                        onClick={() => preencher(destino)}
                        className="min-h-11 rounded-full border border-input px-3 text-xs hover:bg-muted sm:min-h-9"
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {campo("Crédito Festaê", "fica no cadastro da cliente", credito, setCredito, "dist-credito")}
                    {campo("Reembolso", "volta para a cliente", reembolso, setReembolso, "dist-reembolso")}
                    {campo("Retenção", "fica com a Festaê", retencao, setRetencao, "dist-retencao")}
                  </div>
                  {distribuicao.reembolso > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="dia-reembolso">Dia em que o reembolso saiu</Label>
                      <Input
                        id="dia-reembolso"
                        type="date"
                        max={diaEmChapeco(new Date())}
                        value={reembolsadoEm}
                        onChange={(e) => setReembolsadoEm(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        É a data da saída no caixa. O pagamento original continua no caixa do dia em que entrou.
                      </p>
                    </div>
                  )}
                  <p
                    className={`text-sm tabular-nums ${problema ? "text-amber-800" : "text-emerald-700"}`}
                    data-distribuicao
                  >
                    Distribuído {formatarReais(distribuido)} de {formatarReais(pago)}
                    {problema ? "" : " — fecha certinho."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Retenção é receita de retenção por cancelamento, separada do faturamento das festas.
                  </p>
                </fieldset>
              ) : (
                <p className="rounded-md bg-muted/40 p-3 text-muted-foreground">
                  Nenhum pagamento confirmado nesta reserva: não há valor a distribuir.
                </p>
              )}

              {recusa && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{recusa}</div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" className="w-full sm:w-auto" onClick={fechar}>
                Voltar
              </Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!podeCancelar || cancelar.isPending}
                onClick={() => cancelar.mutate()}
              >
                {cancelar.isPending ? "Cancelando..." : "Cancelar reserva"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
