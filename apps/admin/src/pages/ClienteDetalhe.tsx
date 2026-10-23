import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, Undo2 } from "lucide-react";
import {
  TIPO_DE_MOVIMENTO_LABEL,
  extratoDeCredito,
  formatarDataDaFesta,
  formatarDiaDoMomento,
  numeroDoContrato,
  type LinhaDoExtrato,
  type MovimentoDeCredito,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFormato } from "@/lib/privacidade";

type DadosDaCliente = {
  cliente: {
    id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    perfil: string;
    desde: string;
    excluida: boolean;
  };
  saldo: number;
  movimentos: MovimentoDeCredito[];
  festas: {
    id: string;
    numero: number;
    festaEm: string;
    status: string;
    valor: number;
    recebido: number;
    creditoAplicado: number;
  }[];
};

const ETAPA: Record<string, string> = {
  PENDING: "Solicitação",
  CONFIRMED: "Confirmada",
  PREPARING: "Preparação",
  READY: "Pronta",
  AGUARDANDO_DEVOLUCAO: "Aguardando devolução",
  COMPLETED: "Concluída",
  REJECTED: "Recusada",
  CANCELLED: "Cancelada",
};

/** De qual reserva o movimento veio, ou para qual foi. */
function origemOuDestino(l: LinhaDoExtrato): string {
  if (l.reservaOrigem) return `Origem: reserva nº ${l.reservaOrigem.numero}`;
  if (l.reservaDestino) return `Destino: reserva nº ${l.reservaDestino.numero}`;
  return "—";
}

/**
 * O cadastro da cliente, com o crédito Festaê dela.
 *
 * O saldo em destaque e o extrato embaixo são o mesmo número, calculado da
 * mesma lista: o saldo é a última linha do extrato. Nada aqui edita o saldo —
 * crédito nasce de cancelamento, sai quando é usado numa festa, e um uso
 * errado se desfaz com um estorno que fica registrado ao lado do uso.
 */
export default function ClienteDetalhe({ id }: { id: string }) {
  const { formatarReais } = useFormato();
  const [, navegar] = useLocation();
  const { user } = useAuth();
  const [estornando, setEstornando] = useState<LinhaDoExtrato | null>(null);

  const { data, isLoading, error } = useQuery<DadosDaCliente>({
    queryKey: ["cliente", id, "creditos"],
    queryFn: () => api(`/clientes/${id}/creditos`),
  });

  if (isLoading) return <p className="text-muted-foreground">Carregando cadastro…</p>;
  if (error || !data) return <p className="text-destructive">Não foi possível carregar este cadastro.</p>;

  const extrato = extratoDeCredito(data.movimentos);
  const canceladas = new Set(data.festas.filter((f) => f.status === "CANCELLED" || f.status === "REJECTED").map((f) => f.id));
  const podeEstornar = (l: LinhaDoExtrato) =>
    user?.role === "ADMIN" &&
    l.tipo === "CREDITO_UTILIZADO" &&
    !l.estornada &&
    l.reservaDestino !== null &&
    !canceladas.has(l.reservaDestino.id);

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="mb-1 text-[1.65rem] font-semibold text-navy [overflow-wrap:anywhere]">{data.cliente.nome}</h1>
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {[data.cliente.telefone, data.cliente.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"}
          {" · "}cliente desde {formatarDiaDoMomento(data.cliente.desde)}
        </p>
      </div>

      <section className="painel-cartao flex flex-wrap items-end justify-between gap-4 p-4" data-credito-disponivel>
        <div>
          <p className="painel-periodo">Crédito disponível</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-navy">{formatarReais(data.saldo)}</p>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Crédito Festaê de cancelamentos anteriores. É a soma do extrato abaixo, e só muda quando ele
            muda. Para usar, aplique o crédito numa festa da cliente.
          </p>
        </div>
        {data.movimentos.length > 0 && (
          <Button
            variant="outline"
            className="h-11 w-full sm:h-9 sm:w-auto"
            onClick={() => navegar(`/clientes/${id}/creditos/saldo`)}
          >
            <FileDown className="mr-2 size-4" aria-hidden />
            Gerar comprovante do saldo atual
          </Button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[0.95rem] font-medium text-navy">Extrato de créditos</h2>
        {extrato.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum crédito registrado para esta cliente.</p>
        ) : (
          <div className="tabela-cards">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Origem/destino</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Crédito</TableHead>
                  <TableHead className="text-right">Utilização</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {extrato.map((l) => (
                  <TableRow key={l.id} data-movimento={l.tipo}>
                    <TableCell data-label="Data" className="whitespace-nowrap">
                      {formatarDiaDoMomento(l.criadoEm)}
                    </TableCell>
                    <TableCell data-label="Origem/destino">{origemOuDestino(l)}</TableCell>
                    <TableCell data-label="Descrição" className="whitespace-normal">
                      {/* Um bloco só: no celular a célula vira "rótulo: valor", e
                          três peças soltas disputariam a mesma linha. */}
                      <div className="min-w-0">
                        <span className="block">{TIPO_DE_MOVIMENTO_LABEL[l.tipo]}</span>
                        {(l.observacao || l.criadoPor) && (
                          <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
                            {[l.observacao, l.criadoPor ? `por ${l.criadoPor}` : null].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {l.estornada && <span className="block text-xs text-amber-700">estornada</span>}
                      </div>
                    </TableCell>
                    <TableCell data-label="Crédito" className="text-right tabular-nums text-emerald-700">
                      {l.credito !== null ? formatarReais(l.credito) : "—"}
                    </TableCell>
                    <TableCell data-label="Utilização" className="text-right tabular-nums">
                      {l.utilizacao !== null ? formatarReais(l.utilizacao) : "—"}
                    </TableCell>
                    <TableCell data-label="Saldo" className="text-right font-medium tabular-nums text-navy">
                      {formatarReais(l.saldo)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {l.tipo === "CREDITO_GERADO_CANCELAMENTO" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navegar(`/clientes/${id}/creditos/${l.id}/voucher`)}
                          >
                            <FileDown className="mr-1.5 size-4" aria-hidden />
                            Baixar voucher
                          </Button>
                        )}
                        {podeEstornar(l) && (
                          <Button size="sm" variant="outline" onClick={() => setEstornando(l)}>
                            <Undo2 className="mr-1.5 size-4" aria-hidden />
                            Estornar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-[0.95rem] font-medium text-navy">Festas</h2>
        {data.festas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma festa registrada.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {data.festas.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3 text-sm">
                <Link
                  href={`/reservas?aba=TODAS&busca=${f.numero}`}
                  className="font-medium text-navy underline-offset-2 hover:underline"
                >
                  {numeroDoContrato(f.numero)} · {formatarDataDaFesta(f.festaEm)}
                </Link>
                <span className="text-muted-foreground">{ETAPA[f.status] ?? f.status}</span>
                <span className="tabular-nums">
                  {formatarReais(f.valor)}
                  {f.creditoAplicado > 0 && (
                    <span className="text-emerald-700"> · crédito {formatarReais(f.creditoAplicado)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {estornando && (
        <EstornarUtilizacao linha={estornando} clienteId={id} aoFechar={() => setEstornando(null)} />
      )}
    </div>
  );
}

/**
 * Desfazer uma utilização lançada por engano. Só ADMIN.
 *
 * Não apaga a utilização: grava o movimento contrário, e o extrato passa a
 * mostrar as duas linhas. O motivo é obrigatório porque é ele que explica,
 * meses depois, por que duas linhas se anulam.
 */
function EstornarUtilizacao({
  linha,
  clienteId,
  aoFechar,
}: {
  linha: LinhaDoExtrato;
  clienteId: string;
  aoFechar: () => void;
}) {
  const { formatarReais } = useFormato();
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [recusa, setRecusa] = useState<string | null>(null);
  const estornar = useMutation({
    mutationFn: () =>
      api(`/creditos/${linha.id}/estorno`, { method: "POST", body: JSON.stringify({ motivo: motivo.trim() }) }),
    onSuccess: () => {
      toast.success(`Utilização estornada. ${formatarReais(linha.utilizacao ?? 0)} voltaram ao saldo.`);
      queryClient.invalidateQueries({ queryKey: ["cliente", clienteId] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      aoFechar();
    },
    onError: (e) => setRecusa(e instanceof Error ? e.message : "Não foi possível estornar."),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar utilização de crédito?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            {formatarReais(linha.utilizacao ?? 0)} usados na reserva nº {linha.reservaDestino?.numero} voltam ao
            saldo da cliente, e a festa volta a ter esse valor a pagar. A utilização continua no extrato, com o
            estorno ao lado.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-estorno">Motivo *</Label>
            <textarea
              id="motivo-estorno"
              rows={2}
              value={motivo}
              maxLength={500}
              onChange={(e) => {
                setMotivo(e.target.value);
                setRecusa(null);
              }}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
              placeholder="Ex.: crédito aplicado na festa errada"
            />
          </div>
          {recusa && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-800">{recusa}</div>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={aoFechar}>
            Voltar
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={motivo.trim().length < 3 || estornar.isPending}
            onClick={() => estornar.mutate()}
          >
            {estornar.isPending ? "Estornando..." : "Estornar utilização"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
