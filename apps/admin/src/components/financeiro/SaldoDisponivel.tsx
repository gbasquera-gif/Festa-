import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { diaEmChapeco, type TotalPorCategoria } from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { Rotulo } from "./pecas";
import { dia, nomeDoMes } from "./formato";
import { useFormato } from "@/lib/privacidade";

export type SaldoDeCaixa = {
  ate: string;
  referencia: {
    id: string;
    dia: string;
    valor: number;
    observacao: string | null;
    registradoPor: string | null;
    registradoEm: string;
  } | null;
  saldo: number | null;
  fluxo: {
    entradas: number;
    reembolsos: number;
    despesasOperacionais: number;
    proLabore: number;
    acervo: number;
    retiradas: TotalPorCategoria;
    saidas: number;
    movimentoLiquido: number;
  } | null;
  primeiroSaldoInformadoEm: string | null;
};

type SaldoInformado = { id: string; dia: string; valor: number; observacao: string | null; registradoPor: string | null; registradoEm: string };

/** O último dia do mês, ou hoje se o mês ainda não acabou (ou é futuro). */
export function fimDoMesOuHoje(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const hoje = diaEmChapeco(new Date());
  return ultimo < hoje ? ultimo : hoje;
}

/** O saldo disponível num dia; sem `ate`, hoje. */
export function useSaldoDeCaixa(ate?: string) {
  return useQuery<SaldoDeCaixa>({
    queryKey: ["financeiro", "saldo-de-caixa", ate ?? "hoje"],
    queryFn: () => api(`/financeiro/saldo-de-caixa${ate ? `?ate=${ate}` : ""}`),
  });
}

/**
 * Saldo disponível: o saldo da conta informado pela gestão, mais o que
 * entrou e menos o que saiu depois dele.
 *
 * É aqui — e não no "Caixa do mês", que mede recebimentos — que a retirada
 * dos sócios reduz o dinheiro disponível. Faturamento, despesas e Resultado
 * Operacional não leem nada deste bloco.
 */
export function SaldoDisponivel({ mes }: { mes: string }) {
  const { brl } = useFormato();
  const ate = fimDoMesOuHoje(mes);
  const hoje = diaEmChapeco(new Date());
  const { data, isLoading } = useSaldoDeCaixa(ate);
  const [informando, setInformando] = useState(false);
  const quando = ate === hoje ? `hoje, ${dia(ate)}` : dia(ate);

  return (
    <div className="fin-cartao p-0" data-saldo-disponivel>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div>
          <Rotulo>Saldo disponível calculado · {ate === hoje ? "hoje" : `fim de ${nomeDoMes(mes)}`}</Rotulo>
          <p className="mt-1 max-w-xl text-xs" style={{ color: "var(--fin-muted)" }}>
            O dinheiro que deveria estar na conta: o saldo inicial informado (abertura do dia), mais o que entrou e menos o
            que saiu a partir dele — despesas, pró-labore, reembolsos, acervo e retiradas dos sócios.
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={() => setInformando(true)} data-informar-saldo>
          Informar saldo da conta
        </Button>
      </div>

      {isLoading || !data ? (
        <p className="px-4 pb-4 pt-3 text-sm" style={{ color: "var(--fin-muted)" }}>Calculando…</p>
      ) : data.saldo === null || !data.referencia || !data.fluxo ? (
        <p className="px-4 pb-4 pt-3 text-sm" style={{ color: "var(--fin-navy-ink)" }} data-saldo-sem-referencia>
          {data.primeiroSaldoInformadoEm && ate < data.primeiroSaldoInformadoEm
            ? `O primeiro saldo informado é de ${dia(data.primeiroSaldoInformadoEm)}. O painel não reconstrói saldo para trás: escolha um mês a partir dele.`
            : "Nenhum saldo da conta informado ainda. Informe o saldo inicial de um dia (do extrato) e o painel calcula o disponível a partir dele."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="fin-tabela" data-conta-do-saldo>
            <tbody>
              <tr>
                <td>Saldo inicial em {dia(data.referencia.dia)} (informado)</td>
                <td className="num">{brl(data.referencia.valor)}</td>
              </tr>
              <Linha rotulo="+ Entradas (pagamentos recebidos)" valor={data.fluxo.entradas} />
              <Linha rotulo="− Reembolsos a clientes" valor={-data.fluxo.reembolsos} />
              <Linha rotulo="− Despesas (consumo e custeio)" valor={-data.fluxo.despesasOperacionais} />
              <Linha rotulo="− Acervo (investimento)" valor={-data.fluxo.acervo} />
              <Linha rotulo="− Pró-labore (despesa com os sócios)" valor={-data.fluxo.proLabore} />
              <Linha rotulo="− Distribuição de lucros" valor={-data.fluxo.retiradas.DISTRIBUICAO_DE_LUCROS} destaque />
              <Linha rotulo="− Devolução de aporte" valor={-data.fluxo.retiradas.DEVOLUCAO_DE_APORTE} />
            </tbody>
            <tfoot>
              <tr>
                <td>Saldo disponível em {quando}</td>
                <td className="num text-[1.15rem]" style={{ color: data.saldo < 0 ? "var(--fin-coral-dark)" : undefined }} data-saldo-valor>
                  {brl(data.saldo)}
                </td>
              </tr>
            </tfoot>
          </table>
          <div className="mx-4 mb-4 mt-2 grid gap-1 rounded-md border px-3 py-2 text-xs" style={{ color: "var(--fin-navy-ink)" }} data-aviso-conciliacao>
            <strong>Depende da conciliação.</strong>
            <span style={{ color: "var(--fin-muted)" }}>
              É um saldo calculado, não lido do banco: só fica certo se tudo o que entrou e saiu estiver lançado no painel —
              pagamentos com data, despesas com data de pagamento, reembolsos realizados e retiradas. Tarifas, rendimentos e
              qualquer movimento feito fora do painel não entram. Confira com o extrato; se divergir, lance o que falta ou
              informe um novo saldo inicial (o mais recente vale, e o que veio antes dele não é somado de novo).
            </span>
            <span style={{ color: "var(--fin-muted)" }}>
              Saldo inicial informado por {data.referencia.registradoPor ?? "—"}
              {data.referencia.observacao ? ` (“${data.referencia.observacao}”)` : ""}.
            </span>
          </div>
        </div>
      )}

      <InformarSaldo aberto={informando} aoFechar={() => setInformando(false)} />
    </div>
  );
}

/** Uma linha da conta. O sinal está no rótulo (+ ou −); o valor vem sem sinal, como num extrato. */
function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  const { brl } = useFormato();
  return (
    <tr style={valor === 0 ? { opacity: 0.55 } : undefined}>
      <td style={destaque ? { color: "var(--fin-navy-ink)", fontWeight: 600 } : undefined}>{rotulo}</td>
      <td className="num">{valor === 0 ? "—" : brl(Math.abs(valor))}</td>
    </tr>
  );
}

/** O saldo inicial da conta num dia. Nada se apaga: um saldo errado se corrige informando de novo. */
export function InformarSaldo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { brl } = useFormato();
  const queryClient = useQueryClient();
  const hoje = diaEmChapeco(new Date());
  const [chave, setChave] = useState("");
  const [form, setForm] = useState({ dia: hoje, valor: "", observacao: "" });

  useEffect(() => {
    if (!aberto) return;
    setChave(crypto.randomUUID());
    setForm({ dia: diaEmChapeco(new Date()), valor: "", observacao: "" });
  }, [aberto]);

  const { data: anteriores = [] } = useQuery<SaldoInformado[]>({
    queryKey: ["financeiro", "saldo-de-caixa", "historico"],
    queryFn: () => api("/financeiro/saldo-de-caixa/historico"),
    enabled: aberto,
  });

  const salvar = useMutation({
    mutationFn: () =>
      api("/financeiro/saldo-de-caixa", {
        method: "POST",
        body: JSON.stringify({ dia: form.dia, valor: Number(form.valor), observacao: form.observacao.trim() || null, chave }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success("Saldo inicial registrado. O saldo disponível foi recalculado a partir dele.");
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pode = form.dia !== "" && form.dia <= hoje && form.valor.trim() !== "" && Number.isFinite(Number(form.valor));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvar.isPending && aoFechar()}>
      <DialogContent className="financeiro max-h-[92vh] overflow-y-auto sm:max-w-[480px]" data-dialogo-saldo>
        <DialogHeader>
          <DialogTitle>Informar saldo da conta</DialogTitle>
          <DialogDescription>
            O saldo no começo do dia escolhido — no extrato, o "saldo anterior". O painel soma o que entrar e desconta o
            que sair a partir desse dia, inclusive nele: retiradas, despesas, reembolsos e acervo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="saldo-dia">Dia</Label>
              <Input id="saldo-dia" type="date" max={hoje} value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} className="min-h-11" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="saldo-valor">Saldo inicial do dia</Label>
              <Input
                id="saldo-valor"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="min-h-11 text-base tabular-nums"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="saldo-observacao">Observação (opcional)</Label>
            <Textarea id="saldo-observacao" rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Ex.: conta corrente, saldo anterior do extrato." />
          </div>
          {anteriores.length > 0 && (
            <div className="grid gap-1 text-xs" style={{ color: "var(--fin-muted)" }} data-saldos-anteriores>
              <span className="fin-rotulo">Saldos já informados</span>
              {anteriores.slice(0, 4).map((s) => (
                <span key={s.id}>
                  {dia(s.dia)} · {brl(s.valor)} · por {s.registradoPor ?? "—"}
                </span>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!pode || salvar.isPending} className="min-h-11" data-salvar-saldo>
            {salvar.isPending ? "Salvando…" : "Registrar saldo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
