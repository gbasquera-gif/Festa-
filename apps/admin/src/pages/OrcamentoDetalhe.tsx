import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink } from "lucide-react";
import {
  EVENT_TYPE_META,
  STATUS_DO_ORCAMENTO_LABEL,
  TIPO_DA_LINHA_LABEL,
  formatarDataDaFesta,
  isEventType,
  type StatusDoOrcamento,
  type TipoDaLinha,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { brl } from "@/components/financeiro/formato";

/**
 * A proposta vista por dentro.
 *
 * Três ações mudam o estado do negócio e ficam juntas no topo: enviar, marcar
 * como perdida e converter em reserva. A conversão é a única que toca no
 * estoque, e é a única que pode ser recusada pelo sistema — por isso o
 * conflito dela aparece inteiro na tela, com o que faltou.
 */
export default function OrcamentoDetalhe({ id }: { id: string }) {
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [perdendo, setPerdendo] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);

  const { data: o, isLoading } = useQuery<any>({
    queryKey: ["orcamento", id],
    queryFn: () => api(`/orcamentos/${id}`),
  });

  const linkPublico = o ? `${window.location.origin}/proposta/${o.token}` : "";

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["orcamento", id] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const enviar = useMutation({
    mutationFn: () => api(`/orcamentos/${id}/enviar`, { method: "PATCH" }),
    onSuccess: () => { invalidar(); toast.success("Proposta marcada como enviada. Mande o link para a cliente."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar."),
  });

  const recusar = useMutation({
    mutationFn: () => api(`/orcamentos/${id}/recusar`, { method: "PATCH", body: JSON.stringify({ motivo }) }),
    onSuccess: () => { invalidar(); setPerdendo(false); toast.success("Proposta marcada como perdida."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao registrar."),
  });

  const converter = useMutation({
    mutationFn: () => api<{ reservaId: string }>(`/orcamentos/${id}/converter`, { method: "POST" }),
    onSuccess: (r) => {
      invalidar();
      toast.success("Reserva criada a partir da proposta.");
      navegar(`/reservas`);
      return r;
    },
    onError: (e) => {
      // O 409 de disponibilidade traz os conflitos detalhados. Mostrar só
      // "erro" aqui seria esconder exatamente a informação que permite
      // decidir: qual peça faltou, e para quando.
      if (e instanceof ApiError && e.detalhes?.conflitos) {
        const lista = (e.detalhes.conflitos as any[])
          .map((c) => `${c.produto ?? c.nome ?? "item"}: faltam ${c.faltando ?? "?"}`)
          .join(" · ");
        setConflito(`${e.message} ${lista}`);
      } else {
        setConflito(e instanceof Error ? e.message : "Não foi possível converter.");
      }
    },
  });

  if (isLoading || !o) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const situacao = o.situacao as StatusDoOrcamento;
  const tipoDeFesta = isEventType(String(o.tipoDeFesta))
    ? EVENT_TYPE_META[String(o.tipoDeFesta) as keyof typeof EVENT_TYPE_META].label
    : String(o.tipoDeFesta);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="painel-periodo">
            Proposta nº {o.numero}{o.versao > 1 ? ` · versão ${o.versao}` : ""} · {STATUS_DO_ORCAMENTO_LABEL[situacao]}
          </p>
          <h1 className="text-[1.65rem] font-semibold" style={{ color: "var(--color-navy)" }}>
            {o.cliente}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tipoDeFesta} em {formatarDataDaFesta(o.festaEm)} · {o.cidade}
            {o.local ? ` · ${o.local}` : ""} · válida até {formatarDataDaFesta(o.validoAte)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" asChild>
            <Link href={`/comercial/orcamentos/${id}/editar`}>Editar</Link>
          </Button>
          {situacao !== "APROVADO" && (
            <Button className="min-h-11" onClick={() => enviar.mutate()} disabled={enviar.isPending}>
              {situacao === "RASCUNHO" ? "Marcar como enviada" : "Reenviar"}
            </Button>
          )}
          {situacao === "APROVADO" && !o.reservaId && (
            <Button className="min-h-11" onClick={() => converter.mutate()} disabled={converter.isPending}>
              {converter.isPending ? "Convertendo…" : "Converter em reserva"}
            </Button>
          )}
        </div>
      </div>

      {conflito && (
        <div className="painel-cartao p-4" style={{ borderColor: "var(--color-coral)" }}>
          <p className="text-sm" style={{ color: "#c4472a" }}>{conflito}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nada foi criado. A proposta continua aprovada — ajuste a composição ou a data e converta
            de novo.
          </p>
        </div>
      )}

      {situacao === "APROVADO" && (
        <div className="painel-cartao p-4" style={{ background: "rgba(46,155,107,0.06)" }}>
          <p className="text-sm" style={{ color: "#2e9b6b" }}>
            Aprovada por <strong>{o.aprovadoPorNome ?? "—"}</strong> em{" "}
            {o.aprovadoEm ? new Date(o.aprovadoEm).toLocaleString("pt-BR") : "—"} · valor aprovado{" "}
            {brl(o.valores.total)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.reservaId
              ? "Já virou reserva."
              : "Ainda não virou reserva. A conversão confere disponibilidade das peças para a data."}
          </p>
        </div>
      )}

      {/* O SINAL
        *
        * Aprovada não quer dizer paga. Enquanto o sinal não é confirmado na
        * reserva, a proposta fica aqui como "aguardando" — e quem confirma o
        * recebimento é a tela de Reservas, pelo caminho de sempre. Nenhum
        * pagamento nasce de um clique da cliente. */}
      {situacao === "APROVADO" && o.sinal && (
        <section className="painel-cartao space-y-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
              Sinal para reservar a data
            </h2>
            <span
              className="rounded px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider"
              style={
                o.sinal.pago
                  ? { background: "rgba(46,155,107,0.12)", color: "#2e9b6b" }
                  : { background: "rgba(224,90,58,0.12)", color: "#c4472a" }
              }
            >
              {o.sinal.pago ? "sinal confirmado" : "aguardando sinal"}
            </span>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Sinal ({o.sinal.percentual.toLocaleString("pt-BR")}% do aprovado)
              </dt>
              <dd className="fin-numero">{brl(o.sinal.valor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Recebido até agora</dt>
              <dd className="fin-numero">{brl(o.sinal.recebido)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {o.reservaId
              ? "O recebimento é registrado na reserva, como em toda venda — nada é dado como pago pela aprovação da cliente."
              : "Enquanto a proposta não vira reserva, não existe pagamento a registrar: o recebimento mora no pedido."}
          </p>
        </section>
      )}

      {/* LINK PÚBLICO */}
      <section className="painel-cartao space-y-2 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
          Link da proposta
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-3 py-2 text-xs">{linkPublico}</code>
          <Button
            variant="outline" className="min-h-11"
            onClick={() => {
              navigator.clipboard?.writeText(linkPublico);
              toast.success("Link copiado. É só colar no WhatsApp.");
            }}
          >
            <Copy className="mr-1 size-4" /> Copiar
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <a href={linkPublico} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-4" /> Abrir
            </a>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {situacao === "RASCUNHO"
            ? "Enquanto for rascunho, o link responde “não encontrada” — a cliente não vê proposta pela metade."
            : "Quem tiver o link vê esta proposta. O endereço é aleatório e não dá acesso a nenhuma outra."}
        </p>
      </section>

      {/* COMPOSIÇÃO */}
      <section className="painel-cartao p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
            Composição
          </h2>
          <span className="painel-periodo">
            {o.mostrarValoresIndividuais
              ? "a cliente vê o valor de cada item"
              : "a cliente vê só o investimento total"}
          </span>
        </div>
        <table className="fin-tabela mt-3">
          <thead>
            <tr><th>Item</th><th>Tipo</th><th className="num">Qtd</th><th className="num">Unitário</th><th className="num">Total</th></tr>
          </thead>
          <tbody>
            {o.linhas.map((l: any) => (
              <tr key={l.id}>
                <td style={{ color: "var(--fin-navy-ink)" }}>{l.descricao}</td>
                <td style={{ color: "var(--fin-muted)" }}>{TIPO_DA_LINHA_LABEL[l.tipo as TipoDaLinha]}</td>
                <td className="num">{l.quantidade}</td>
                <td className="num">{brl(l.valorUnitario)}</td>
                <td className="num">{brl(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="space-y-1 border-t p-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="fin-numero">{brl(o.valores.subtotal)}</dd></div>
          {o.valores.desconto > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="fin-numero" style={{ color: "#c0614a" }}>− {brl(o.valores.desconto)}</dd></div>}
          {o.valores.entrega > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Entrega</dt><dd className="fin-numero">{brl(o.valores.entrega)}</dd></div>}
          {o.valores.montagem > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Montagem</dt><dd className="fin-numero">{brl(o.valores.montagem)}</dd></div>}
          <div className="flex items-baseline justify-between border-t pt-2">
            <dt className="font-medium" style={{ color: "var(--color-navy)" }}>Investimento total</dt>
            <dd className="fin-numero text-xl" style={{ color: "var(--color-navy)" }}>{brl(o.valores.total)}</dd>
          </div>
        </dl>
      </section>

      {o.versoes?.length > 0 && (
        <section className="painel-cartao p-4">
          <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>Versões anteriores</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {o.versoes.map((v: any) => (
              <li key={v.versao} className="flex justify-between">
                <span>Versão {v.versao} · {new Date(v.criadoEm).toLocaleDateString("pt-BR")}</span>
                <span className="fin-numero">{brl(v.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {situacao !== "APROVADO" && situacao !== "RECUSADO" && (
        <div className="flex justify-end pb-4">
          <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={() => setPerdendo(true)}>
            Marcar como perdida
          </Button>
        </div>
      )}

      {o.motivoDaPerda && (
        <p className="pb-4 text-sm text-muted-foreground">Motivo registrado: {o.motivoDaPerda}</p>
      )}

      <AlertDialog open={perdendo} onOpenChange={(v) => !v && setPerdendo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar a proposta de {o.cliente} como perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai da lista de acompanhamento e fica no histórico. O motivo é opcional — e é ele
              que, lá na frente, diz onde a Festaê está perdendo venda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Preço, prazo, fechou com outro fornecedor…"
          />
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="min-h-11" onClick={(e) => { e.preventDefault(); recusar.mutate(); }}>
              Marcar como perdida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
