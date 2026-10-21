import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CheckCircle2, Copy, FileDown } from "lucide-react";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  diaEmChapeco,
  formatarReais,
  fromCentsInt,
  mensagemDoVoucher,
  motivoDeRecusaDaDistribuicao,
  toCentsInt,
  type PaymentMethod,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Voucher = { id: string; numero: number; valor: number };

/** O que aconteceu com as cobranças Pix que estavam vivas no cancelamento. */
type Cobrancas = { encerradas: number; jaPagas: number; naoEncerradas: number };

type ResultadoDoCancelamento = {
  cancelada: true;
  clienteId: string;
  recebido: number;
  creditoDevolvido: number;
  voucher: Voucher | null;
  cobrancas?: Cobrancas;
};

type ResultadoDoComplementar = {
  tratado: true;
  clienteId: string;
  valorTratado: number;
  voucher: Voucher | null;
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
 * Frases sobre as cobranças Pix depois do cancelamento. Vazio quando não
 * havia cobrança viva — aí não há o que dizer.
 */
function avisosDasCobrancas(c: Cobrancas | undefined): string[] {
  if (!c) return [];
  const avisos: string[] = [];
  if (c.jaPagas > 0) {
    avisos.push(
      `${c.jaPagas === 1 ? "Uma cobrança Pix já tinha sido paga" : `${c.jaPagas} cobranças Pix já tinham sido pagas`}: ` +
        "o valor foi registrado como pagamento após o cancelamento e aguarda o tratamento financeiro.",
    );
  }
  if (c.naoEncerradas > 0) {
    avisos.push(
      `${c.naoEncerradas === 1 ? "Uma cobrança Pix não pôde ser encerrada" : `${c.naoEncerradas} cobranças Pix não puderam ser encerradas`} ` +
        "no Mercado Pago. Se for paga, o valor aparece na reserva como pagamento após o cancelamento.",
    );
  }
  return avisos;
}

/**
 * A distribuição de um valor entre crédito, reembolso e retenção.
 *
 * A mesma no cancelamento e no tratamento de pagamento recebido depois dele:
 * os três destinos somam exatamente o valor, e a tela mostra a soma enquanto
 * a pessoa digita.
 */
function useDistribuicao(valor: number) {
  const [credito, setCredito] = useState("");
  const [reembolso, setReembolso] = useState("");
  const [retencao, setRetencao] = useState("");
  /**
   * Reembolso nasce "a realizar": a Festaê ainda vai devolver. Só quando a
   * devolução JÁ aconteceu a pessoa marca isso e informa o dia — e só então
   * o valor sai do caixa.
   */
  const [jaDevolvido, setJaDevolvido] = useState(false);
  const [reembolsadoEm, setReembolsadoEm] = useState(diaEmChapeco(new Date()));
  const [formaDoReembolso, setFormaDoReembolso] = useState<PaymentMethod>("PIX");

  const total = fromCentsInt(toCentsInt(valor));
  const partes = { credito: lerValor(credito), reembolso: lerValor(reembolso), retencao: lerValor(retencao) };
  const distribuido = fromCentsInt(
    toCentsInt(partes.credito) + toCentsInt(partes.reembolso) + toCentsInt(partes.retencao),
  );
  const problema = useMemo(
    () => motivoDeRecusaDaDistribuicao(total, partes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, credito, reembolso, retencao],
  );
  const faltaData = partes.reembolso > 0 && jaDevolvido && !reembolsadoEm;

  return {
    total,
    partes,
    distribuido,
    problema,
    faltaData,
    campos: {
      credito,
      setCredito,
      reembolso,
      setReembolso,
      retencao,
      setRetencao,
      jaDevolvido,
      setJaDevolvido,
      reembolsadoEm,
      setReembolsadoEm,
      formaDoReembolso,
      setFormaDoReembolso,
    },
    corpo: {
      credito: partes.credito,
      reembolso: partes.reembolso,
      reembolsadoEm: partes.reembolso > 0 && jaDevolvido ? reembolsadoEm : undefined,
      formaDoReembolso: partes.reembolso > 0 && jaDevolvido ? formaDoReembolso : undefined,
      retencao: partes.retencao,
    },
    preencher(destino: "credito" | "reembolso" | "retencao") {
      const tudo = total.toFixed(2);
      setCredito(destino === "credito" ? tudo : "");
      setReembolso(destino === "reembolso" ? tudo : "");
      setRetencao(destino === "retencao" ? tudo : "");
    },
    limpar() {
      setCredito("");
      setReembolso("");
      setRetencao("");
      setJaDevolvido(false);
    },
  };
}

function DistribuicaoDoValor({
  d,
  titulo,
  aoMudar,
}: {
  d: ReturnType<typeof useDistribuicao>;
  titulo: string;
  aoMudar: () => void;
}) {
  const { campos } = d;
  // A devolução já feita é dinheiro saindo, registrado à mão: só ADMIN.
  const ehAdmin = useAuth().user?.role === "ADMIN";
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
          aoMudar();
        }}
        placeholder="0,00"
      />
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium text-navy">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["credito", "Tudo em crédito"],
            ["reembolso", "Tudo em reembolso"],
            ["retencao", "Reter tudo"],
          ] as const
        ).map(([destino, rotulo]) => (
          <button
            key={destino}
            type="button"
            onClick={() => {
              d.preencher(destino);
              aoMudar();
            }}
            className="min-h-11 rounded-full border border-input px-3 text-xs hover:bg-muted sm:min-h-9"
          >
            {rotulo}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {campo("Crédito Festaê", "fica no cadastro da cliente", campos.credito, campos.setCredito, "dist-credito")}
        {campo("Reembolso", "a Festaê devolve à cliente", campos.reembolso, campos.setReembolso, "dist-reembolso")}
        {campo("Retenção", "fica com a Festaê", campos.retencao, campos.setRetencao, "dist-retencao")}
      </div>
      {/* O sistema não devolve dinheiro: registra a devolução que a Festaê
          faz por Pix ou outro meio. Por isso a pergunta é se ela JÁ aconteceu,
          e o padrão é que ainda não. */}
      {d.partes.reembolso > 0 && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3" data-escolha-reembolso>
          <p className="text-xs text-muted-foreground">
            O sistema não faz a devolução: a Festaê devolve por Pix ou outro meio, e o caixa só muda
            quando a devolução for registrada como realizada.
          </p>
          <div role="radiogroup" aria-label="Situação do reembolso" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [false, "Reembolso a realizar", ehAdmin ? "a Festaê ainda vai devolver" : "o ADMIN registra quando devolver"],
                [true, "Já devolvido", "registrar a devolução já feita"],
              ] as const
            ).filter(([valor]) => ehAdmin || !valor).map(([valor, titulo, nota]) => (
              <button
                key={titulo}
                type="button"
                role="radio"
                aria-checked={campos.jaDevolvido === valor}
                onClick={() => {
                  campos.setJaDevolvido(valor);
                  aoMudar();
                }}
                className={`rounded-md border p-2 text-left text-sm ${
                  campos.jaDevolvido === valor ? "border-navy bg-white ring-1 ring-navy" : "border-input"
                }`}
              >
                <span className="block font-medium">{titulo}</span>
                <span className="block text-xs text-muted-foreground">{nota}</span>
              </button>
            ))}
          </div>
          {campos.jaDevolvido && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dia-reembolso">Dia em que a devolução foi feita</Label>
                <Input
                  id="dia-reembolso"
                  type="date"
                  max={diaEmChapeco(new Date())}
                  value={campos.reembolsadoEm}
                  onChange={(e) => campos.setReembolsadoEm(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="forma-reembolso">Meio</Label>
                <select
                  id="forma-reembolso"
                  className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm sm:h-9"
                  value={campos.formaDoReembolso}
                  onChange={(e) => campos.setFormaDoReembolso(e.target.value as PaymentMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
      <p className={`text-sm tabular-nums ${d.problema ? "text-amber-800" : "text-emerald-700"}`} data-distribuicao>
        Distribuído {formatarReais(d.distribuido)} de {formatarReais(d.total)}
        {d.problema ? "" : " — fecha certinho."}
      </p>
      <p className="text-xs text-muted-foreground">
        Retenção é receita de retenção por cancelamento, separada do faturamento das festas.
      </p>
    </fieldset>
  );
}

/** Depois de gerar crédito: baixar o voucher e copiar a mensagem para a cliente. */
function VoucherGerado({
  titulo,
  clienteId,
  cliente,
  voucher,
  observacoes,
  aoFechar,
}: {
  titulo: string;
  clienteId: string;
  cliente: string;
  voucher: Voucher;
  observacoes: string[];
  aoFechar: () => void;
}) {
  const [, navegar] = useLocation();
  return (
    <div className="min-w-0 space-y-4" data-voucher-gerado>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
          {titulo}
        </DialogTitle>
      </DialogHeader>
      <p className="text-base font-medium text-navy">Crédito de {formatarReais(voucher.valor)} gerado com sucesso.</p>
      {observacoes.map((o) => (
        <p key={o} className="text-sm text-muted-foreground">
          {o}
        </p>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button className="h-11 sm:h-9" onClick={() => navegar(`/clientes/${clienteId}/creditos/${voucher.id}/voucher`)}>
          <FileDown className="mr-2 size-4" aria-hidden />
          Baixar Voucher de Crédito
        </Button>
        <Button variant="outline" className="h-11 sm:h-9" onClick={() => copiar(mensagemDoVoucher(cliente, voucher.valor))}>
          <Copy className="mr-2 size-4" aria-hidden />
          Copiar mensagem para cliente
        </Button>
      </div>
      <pre className="min-w-0 whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-sans text-sm text-navy">
        {mensagemDoVoucher(cliente, voucher.valor)}
      </pre>
      <DialogFooter>
        <Button variant="ghost" className="w-full sm:w-auto" onClick={aoFechar}>
          Fechar
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Recusa do servidor, com o valor que ele leu na hora quando é o caso. */
function textoDaRecusa(e: unknown, padrao: string): string {
  if (e instanceof ApiError && typeof e.detalhes?.recebido === "number") {
    return `${e.message} (valor confirmado agora: ${formatarReais(e.detalhes.recebido as number)})`;
  }
  return e instanceof Error ? e.message : padrao;
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
  const [motivo, setMotivo] = useState("");
  const [recusa, setRecusa] = useState<string | null>(null);
  const [feito, setFeito] = useState<ResultadoDoCancelamento | null>(null);
  const d = useDistribuicao(jaPago);
  const podeCancelar = motivo.trim().length >= 3 && !d.problema && !d.faltaData;

  const cancelar = useMutation({
    mutationFn: () =>
      api<ResultadoDoCancelamento>(`/reservations/${reservaId}/cancelar`, {
        method: "PATCH",
        body: JSON.stringify({ motivo: motivo.trim(), ...d.corpo }),
      }),
    // Com voucher, a lista só recarrega quando o diálogo fecha: recarregar
    // antes tira a reserva da aba em que ela estava, e o diálogo — que mora
    // dentro do detalhe dela — sumiria junto com o voucher.
    onSuccess: (r) => {
      if (r.voucher) {
        setFeito(r);
        return;
      }
      aoCancelar();
      toast.success(
        "Reserva cancelada. A data e o material voltaram a ficar livres." +
          (r.creditoDevolvido > 0
            ? ` ${formatarReais(r.creditoDevolvido)} de crédito usado voltaram ao saldo da cliente.`
            : ""),
      );
      for (const aviso of avisosDasCobrancas(r.cobrancas)) toast.warning(aviso, { duration: 12_000 });
      fechar();
    },
    // O servidor confere contra o pago lido na hora: se um pagamento caiu
    // enquanto a tela estava aberta, a recusa traz o número novo.
    onError: (e) => setRecusa(textoDaRecusa(e, "Não foi possível cancelar.")),
  });

  function fechar() {
    if (feito) aoCancelar();
    setMotivo("");
    d.limpar();
    setRecusa(null);
    setFeito(null);
    aoFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        {feito?.voucher ? (
          <VoucherGerado
            titulo="Reserva cancelada"
            clienteId={feito.clienteId}
            cliente={cliente}
            voucher={feito.voucher}
            observacoes={[
              ...(feito.creditoDevolvido > 0
                ? [
                    `${formatarReais(feito.creditoDevolvido)} de crédito que estava sendo usado nesta festa também voltaram ao saldo da cliente.`,
                  ]
                : []),
              ...avisosDasCobrancas(feito.cobrancas),
            ]}
            aoFechar={fechar}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Cancelar a reserva de {cliente}?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>
                A festa de <strong>{data}</strong> deixa de ocupar a agenda, e o material volta para o
                acervo. A reserva continua no sistema com o histórico; fica gravado quem cancelou, quando
                e por quê. Cobranças Pix ainda abertas são encerradas no Mercado Pago.
              </p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-muted/40 p-3 tabular-nums">
                <dt className="text-muted-foreground">Valor contratado</dt>
                <dd className="text-right">{formatarReais(total)}</dd>
                <dt className="text-muted-foreground">Pago (confirmado)</dt>
                <dd className="text-right font-semibold text-navy">{formatarReais(d.total)}</dd>
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

              {d.total > 0 ? (
                <DistribuicaoDoValor
                  d={d}
                  titulo={`O que fazer com os ${formatarReais(d.total)} pagos?`}
                  aoMudar={() => setRecusa(null)}
                />
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

/**
 * Dar destino a pagamento recebido depois do cancelamento.
 *
 * O tratamento do cancelamento não muda: este é um tratamento a mais, para o
 * valor que chegou depois. Mesma distribuição, mesma regra — a soma tem de
 * ser exatamente o valor pendente, conferido pelo servidor na hora.
 */
export function TratarPagamentoTardio({
  reservaId,
  cliente,
  pendente,
  aberto,
  aoFechar,
  aoTratar,
}: {
  reservaId: string;
  cliente: string;
  pendente: number;
  aberto: boolean;
  aoFechar: () => void;
  aoTratar: () => void;
}) {
  const [observacao, setObservacao] = useState("");
  const [recusa, setRecusa] = useState<string | null>(null);
  const [feito, setFeito] = useState<ResultadoDoComplementar | null>(null);
  const d = useDistribuicao(pendente);

  const tratar = useMutation({
    mutationFn: () =>
      api<ResultadoDoComplementar>(`/reservations/${reservaId}/tratamento-complementar`, {
        method: "POST",
        body: JSON.stringify({ ...d.corpo, observacao: observacao.trim() || undefined }),
      }),
    // Mesma razão do cancelamento: com voucher, recarrega ao fechar.
    onSuccess: (r) => {
      if (r.voucher) {
        setFeito(r);
        return;
      }
      aoTratar();
      toast.success(`Tratamento definido para ${formatarReais(r.valorTratado)} recebidos após o cancelamento.`);
      fechar();
    },
    onError: (e) => setRecusa(textoDaRecusa(e, "Não foi possível registrar o tratamento.")),
  });

  function fechar() {
    if (feito) aoTratar();
    setObservacao("");
    d.limpar();
    setRecusa(null);
    setFeito(null);
    aoFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        {feito?.voucher ? (
          <VoucherGerado
            titulo="Tratamento definido"
            clienteId={feito.clienteId}
            cliente={cliente}
            voucher={feito.voucher}
            observacoes={[]}
            aoFechar={fechar}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pagamento recebido após o cancelamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>
                Entraram <strong className="text-navy">{formatarReais(d.total)}</strong> depois que a reserva de{" "}
                <strong>{cliente}</strong> foi cancelada. O dinheiro continua no caixa do dia em que entrou; defina
                o destino dele. O tratamento do cancelamento continua como foi registrado.
              </p>
              <DistribuicaoDoValor
                d={d}
                titulo={`O que fazer com os ${formatarReais(d.total)} recebidos depois?`}
                aoMudar={() => setRecusa(null)}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="observacao-complementar">Observação</Label>
                <textarea
                  id="observacao-complementar"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                  placeholder="Ex.: Pix antigo pago depois do cancelamento"
                />
              </div>
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
                disabled={Boolean(d.problema) || d.faltaData || tratar.isPending}
                onClick={() => tratar.mutate()}
              >
                {tratar.isPending ? "Registrando..." : "Registrar tratamento"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
