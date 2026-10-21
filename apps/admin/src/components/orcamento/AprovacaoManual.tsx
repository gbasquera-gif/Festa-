import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FORMAS_DA_APROVACAO_MANUAL,
  FORMA_DA_APROVACAO_MANUAL_LABEL,
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
  conferirPixDaAprovacao,
  diaEmChapeco,
  formatarDataDaFesta,
  type FormaDaAprovacaoManual,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { brl } from "@/components/financeiro/formato";
import { mensagemDeConflito } from "./conflito";

type Opcao = { id: string; nome: string; valores: { total: number }; sinal: { valor: number; percentual: number } };

export type PropostaParaAprovar = {
  id: string;
  situacao: string;
  canal: string | null;
  validoAte: string;
  percentualDoSinal: number | null;
  opcaoAprovadaId: string | null;
  opcoes: Opcao[];
};

type Resultado = { reservaId: string; valor: number; total: number; saldo: number; abaixoDoSinalPadrao: boolean; repetida: boolean };

/**
 * Aprovar manualmente / Registrar Pix recebido.
 *
 * Para quando a cliente fechou pelo WhatsApp e o Pix caiu antes de ela abrir
 * o link. Um envio só faz as três coisas que a operação fazia em três telas:
 * aprova a proposta, cria a reserva (conferindo o estoque da data) e registra
 * o recebimento na data em que o dinheiro entrou.
 *
 * O valor é o que caiu na conta, qualquer um acima de zero até o total: o
 * sinal combinado pode ser menor que o padrão. O total não muda; o resto fica
 * como saldo. A chave gerada ao abrir faz o clique duplo e a rede instável
 * não lançarem duas vezes.
 */
export function AprovacaoManual({
  proposta,
  aberto,
  aoFechar,
}: {
  proposta: PropostaParaAprovar;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const aprovadaPeloLink = proposta.situacao === "APROVADO";
  const vencida = proposta.situacao === "EXPIRADO";
  const precisaDeCanal = !proposta.canal;

  const [chave, setChave] = useState("");
  const [opcaoId, setOpcaoId] = useState("");
  const [valor, setValor] = useState("");
  const [recebidoEm, setRecebidoEm] = useState("");
  const [forma, setForma] = useState<FormaDaAprovacaoManual>("PIX_EXTERNO");
  const [observacao, setObservacao] = useState("");
  const [canal, setCanal] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Cada abertura é um envio novo: chave nova, data de hoje, nada marcado.
  useEffect(() => {
    if (!aberto) return;
    setChave(crypto.randomUUID());
    setOpcaoId(
      aprovadaPeloLink
        ? (proposta.opcaoAprovadaId ?? proposta.opcoes[0]?.id ?? "")
        : proposta.opcoes.length === 1
          ? proposta.opcoes[0].id
          : "",
    );
    setValor("");
    setRecebidoEm(diaEmChapeco(new Date()));
    setForma("PIX_EXTERNO");
    setObservacao("");
    setCanal("");
    setConfirmado(false);
    setErro(null);
  }, [aberto, aprovadaPeloLink, proposta.opcaoAprovadaId, proposta.opcoes]);

  const opcao = proposta.opcoes.find((o) => o.id === opcaoId) ?? null;
  const valorNumerico = Number(valor.replace(",", "."));
  const conferido = useMemo(
    () => (opcao && valor !== "" ? conferirPixDaAprovacao(valorNumerico, opcao.valores.total, 0, proposta.percentualDoSinal) : null),
    [opcao, valor, valorNumerico, proposta.percentualDoSinal],
  );
  const hoje = diaEmChapeco(new Date());
  const dataNoFuturo = recebidoEm > hoje;

  const podeEnviar =
    opcao !== null &&
    conferido?.ok === true &&
    recebidoEm !== "" &&
    !dataNoFuturo &&
    confirmado &&
    (!precisaDeCanal || canal !== "");

  const aprovar = useMutation({
    mutationFn: () =>
      api<Resultado>(`/orcamentos/${proposta.id}/aprovar-manualmente`, {
        method: "POST",
        body: JSON.stringify({
          opcaoId: opcaoId || undefined,
          valor: valorNumerico,
          recebidoEm,
          forma,
          observacao: observacao.trim() || undefined,
          canal: precisaDeCanal ? canal : undefined,
          confirmacao: true,
          chave,
        }),
      }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["orcamento", proposta.id] });
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success(
        r.saldo > 0
          ? `Proposta aprovada e Pix de ${brl(r.valor)} registrado. Saldo a receber: ${brl(r.saldo)}.`
          : `Proposta aprovada e Pix de ${brl(r.valor)} registrado. Pedido quitado.`,
      );
      aoFechar();
    },
    onError: (e) => setErro(mensagemDeConflito(e)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !aprovar.isPending && aoFechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]" data-aprovacao-manual>
        <DialogHeader>
          <DialogTitle>{aprovadaPeloLink ? "Registrar Pix recebido" : "Aprovar manualmente com Pix recebido"}</DialogTitle>
          <DialogDescription>
            {aprovadaPeloLink
              ? "A cliente já aprovou pelo link. Registrar o Pix cria a reserva (conferindo o estoque da data) e lança o recebimento."
              : "Para quando a cliente fechou pelo WhatsApp e o Pix já caiu na conta. Aprova a proposta, cria a reserva (conferindo o estoque da data) e lança o recebimento — tudo de uma vez."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {vencida && (
            <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "#c69654", background: "rgba(198,150,84,0.08)" }}>
              A validade desta proposta venceu em {formatarDataDaFesta(proposta.validoAte)}. Aprovar mantém os valores dela como estão.
            </p>
          )}

          {!aprovadaPeloLink && proposta.opcoes.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Qual opção a cliente fechou?</legend>
              {proposta.opcoes.map((o) => (
                <label
                  key={o.id}
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  style={opcaoId === o.id ? { borderColor: "var(--color-navy)", boxShadow: "0 0 0 1px var(--color-navy)" } : undefined}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="opcao-aprovacao" value={o.id} checked={opcaoId === o.id} onChange={() => setOpcaoId(o.id)} />
                    {o.nome}
                  </span>
                  <span className="tabular-nums">{brl(o.valores.total)}</span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Valor total da proposta</Label>
              <p className="flex min-h-11 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums" data-total-da-proposta>
                {opcao ? brl(opcao.valores.total) : "Escolha a opção"}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aprovacao-valor">Valor do Pix recebido</Label>
              <Input
                id="aprovacao-valor"
                inputMode="decimal"
                type="number"
                step="0.01"
                min="0"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="min-h-11 text-base tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="aprovacao-data">Data do recebimento</Label>
              <Input
                id="aprovacao-data"
                type="date"
                max={hoje}
                value={recebidoEm}
                onChange={(e) => setRecebidoEm(e.target.value)}
                className="min-h-11"
              />
              {dataNoFuturo && <p className="text-xs text-destructive">A data não pode estar no futuro.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="aprovacao-forma">Forma de pagamento</Label>
              <select
                id="aprovacao-forma"
                value={forma}
                onChange={(e) => setForma(e.target.value as FormaDaAprovacaoManual)}
                className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              >
                {FORMAS_DA_APROVACAO_MANUAL.map((f) => (
                  <option key={f} value={f}>
                    {FORMA_DA_APROVACAO_MANUAL_LABEL[f]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Recebido direto na conta da Festaê, fora do checkout.</p>
            </div>
          </div>

          {precisaDeCanal && (
            <div className="grid gap-2">
              <Label htmlFor="aprovacao-canal">Por qual canal esta cliente chegou?</Label>
              <select
                id="aprovacao-canal"
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Escolha o canal</option>
                {SALE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {SALE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="aprovacao-obs">Observações (opcional)</Label>
            <Textarea
              id="aprovacao-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: Pix do dia 12, conta PJ, combinado no WhatsApp."
            />
          </div>

          {/* O resumo: o que vai ficar registrado, em números. */}
          {opcao && conferido && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={conferido.ok ? { background: "rgba(46,155,107,0.07)" } : { background: "rgba(224,90,58,0.08)" }}
              data-resumo-aprovacao
            >
              {conferido.ok ? (
                <>
                  <p className="flex justify-between gap-3">
                    <span>Saldo restante a receber</span>
                    <strong className="tabular-nums" data-saldo-restante>{brl(conferido.saldo)}</strong>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {conferido.abaixoDoPadrao
                      ? `Abaixo do sinal padrão (${opcao.sinal.percentual.toLocaleString("pt-BR")}% = ${brl(opcao.sinal.valor)}). Tudo bem: vale o combinado, e o restante fica como saldo para cobrar depois.`
                      : conferido.saldo === 0
                        ? "Valor integral: o pedido fica quitado."
                        : "O restante fica como saldo para cobrar depois."}
                  </p>
                </>
              ) : (
                <p style={{ color: "#c4472a" }}>{conferido.erro}</p>
              )}
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-sm" htmlFor="aprovacao-confirmo">
            <Checkbox
              id="aprovacao-confirmo"
              checked={confirmado}
              onCheckedChange={(v) => setConfirmado(v === true)}
              className="mt-0.5"
            />
            <span>
              Confirmo que conferi o Pix
              {conferido?.ok ? ` de ${brl(valorNumerico)}` : ""} na conta da Festaê e que a cliente aceitou esta proposta.
            </span>
          </label>

          {erro && (
            <p className="rounded-md px-3 py-2 text-sm" style={{ background: "rgba(224,90,58,0.08)", color: "#c4472a" }} data-erro-aprovacao>
              {erro} Nada foi criado nem lançado.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar} disabled={aprovar.isPending} className="min-h-11">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setErro(null);
              aprovar.mutate();
            }}
            disabled={!podeEnviar || aprovar.isPending}
            className="min-h-11"
            data-confirmar-aprovacao
          >
            {aprovar.isPending ? "Registrando…" : aprovadaPeloLink ? "Registrar Pix e criar reserva" : "Aprovar e registrar Pix"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
