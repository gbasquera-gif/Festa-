import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import {
  EVENT_TYPE_META,
  STATUS_DO_ORCAMENTO_LABEL,
  TIPO_DA_LINHA_LABEL,
  formatarDataDaFesta,
  isEventType,
  mensagemDaProposta,
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
import { urlDaProposta } from "@/lib/site";
import { brl } from "@/components/financeiro/formato";

/**
 * A proposta vista por dentro.
 *
 * Três ações mudam o estado do negócio e ficam juntas no topo: enviar, marcar
 * como perdida e converter em reserva. A conversão é a única que toca no
 * estoque, e é a única que pode ser recusada pelo sistema — por isso o
 * conflito dela aparece inteiro na tela, com o que faltou.
 */
/**
 * O 409 de disponibilidade traz os conflitos detalhados.
 *
 * Mostrar só "erro" esconderia exatamente a informação que permite decidir:
 * qual peça faltou, e para quando.
 */
function mensagemDeConflito(e: unknown): string {
  if (e instanceof ApiError && e.detalhes?.conflitos) {
    const lista = (e.detalhes.conflitos as any[])
      .map((c) => {
        const falta =
          typeof c.necessario === "number" && typeof c.disponivel === "number"
            ? `precisa de ${c.necessario}, há ${c.disponivel} livre${c.disponivel === 1 ? "" : "s"}`
            : "sem quantidade suficiente";
        return `${c.produto ?? "item"} (${falta})`;
      })
      .join(" · ");
    return `${e.message} ${lista}`;
  }
  return e instanceof Error ? e.message : "Não foi possível concluir.";
}

/**
 * Copiar sem depender de o navegador cooperar.
 *
 * A API de área de transferência exige contexto seguro e permissão; quando
 * falha, ela falha em silêncio. Aqui o silêncio vira aviso, para a Maria não
 * colar no WhatsApp um texto que nunca foi copiado.
 */
async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar por aqui. Selecione o texto abaixo e copie à mão.");
  }
}

export default function OrcamentoDetalhe({ id }: { id: string }) {
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [perdendo, setPerdendo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [conflito, setConflito] = useState<string | null>(null);

  const { data: o, isLoading } = useQuery<any>({
    queryKey: ["orcamento", id],
    queryFn: () => api(`/orcamentos/${id}`),
  });

  const linkPublico = o ? urlDaProposta(String(o.token)) : "";
  const mensagem = o ? mensagemDaProposta(String(o.cliente ?? ""), linkPublico) : "";

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ["orcamento", id] });
    queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
  };

  const enviar = useMutation({
    mutationFn: () => api(`/orcamentos/${id}/enviar`, { method: "PATCH" }),
    onSuccess: () => { invalidar(); toast.success("Proposta marcada como enviada. Mande o link para a cliente."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar."),
  });

  /**
   * Enviar e copiar, nesta ordem, num clique só.
   *
   * O link de um rascunho responde "não encontrada" — é a regra que protege
   * a cliente de abrir proposta pela metade. Mas a tela oferecia o botão de
   * copiar do mesmo jeito, e o recado saiu no WhatsApp com um link morto. A
   * cópia agora espera a proposta virar ENVIADO: se o envio falhar, nada é
   * copiado, e o erro aparece em vez de um link que não abre.
   */
  const enviarECopiar = useMutation({
    mutationFn: async () => {
      await api(`/orcamentos/${id}/enviar`, { method: "PATCH" });
    },
    onSuccess: async () => {
      invalidar();
      await copiar(mensagem, "Proposta enviada. Mensagem copiada!");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar. Nada foi copiado."),
  });

  const excluir = useMutation({
    mutationFn: () => api(`/orcamentos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setExcluindo(false);
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      navegar("/comercial/orcamentos");
      toast.success("Orçamento excluído.");
    },
    onError: (e) => {
      setExcluindo(false);
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir.");
    },
  });

  const recusar = useMutation({
    mutationFn: () => api(`/orcamentos/${id}/recusar`, { method: "PATCH", body: JSON.stringify({ motivo }) }),
    onSuccess: () => { invalidar(); setPerdendo(false); toast.success("Proposta marcada como perdida."); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao registrar."),
  });

  /**
   * A confirmação do sinal, num botão só.
   *
   * Converte (com checagem de disponibilidade) e registra o recebimento pelo
   * mesmo caminho da tela de Reservas. O 409 de falta de peça cai no mesmo
   * tratamento do botão de converter — e, nesse caso, nada é criado nem
   * lançado.
   */
  const confirmarSinal = useMutation({
    mutationFn: () =>
      api<{ reservaId: string; valor: number }>(`/orcamentos/${id}/confirmar-sinal`, {
        method: "POST",
        body: JSON.stringify({ forma: "PIX" }),
      }),
    onSuccess: (r) => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success(`Sinal de ${brl(r.valor)} confirmado. A data está reservada.`);
    },
    onError: (e) => setConflito(mensagemDeConflito(e)),
  });

  const converter = useMutation({
    mutationFn: () => api<{ reservaId: string }>(`/orcamentos/${id}/converter`, { method: "POST" }),
    onSuccess: (r) => {
      invalidar();
      toast.success("Reserva criada a partir da proposta.");
      navegar(`/reservas`);
      return r;
    },
    onError: (e) => setConflito(mensagemDeConflito(e)),
  });

  if (isLoading || !o) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const situacao = o.situacao as StatusDoOrcamento;
  const ehRascunho = situacao === "RASCUNHO";
  /**
   * Quem some da tela e quem fica.
   *
   * A mesma regra do backend, e por isso EXPIRADO entra: expirada é uma
   * proposta enviada que passou da validade — não virou negócio nenhum. O
   * botão não aparece para aprovada, perdida ou convertida; o servidor
   * recusa de novo, mas oferecer o que será negado é convite a erro.
   */
  const podeExcluir =
    !o.reservaId && !o.aprovadoEm && ["RASCUNHO", "ENVIADO", "EXPIRADO"].includes(situacao);
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
          {situacao === "APROVADO" && o.sinal && !o.sinal.pago && (
            <Button
              className="min-h-11"
              onClick={() => { setConflito(null); confirmarSinal.mutate(); }}
              disabled={confirmarSinal.isPending}
            >
              {confirmarSinal.isPending ? "Confirmando…" : `Confirmar sinal de ${brl(o.sinal.valor)}`}
            </Button>
          )}
          {situacao === "APROVADO" && !o.reservaId && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => { setConflito(null); converter.mutate(); }}
              disabled={converter.isPending}
            >
              {converter.isPending ? "Convertendo…" : "Só converter em reserva"}
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
            {o.sinal.pago
              ? "Recebimento registrado no pedido, como em toda venda."
              : o.reservaId
                ? "Confirmar o sinal lança o recebimento nesta reserva, pelo mesmo caminho da tela de Reservas."
                : "Confirmar o sinal cria a reserva — conferindo a disponibilidade das peças para a data — e lança o recebimento. Nada é dado como pago pela aprovação da cliente."}
          </p>
        </section>
      )}

      {/* LINK PÚBLICO */}
      <section className="painel-cartao space-y-2 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
          Link da proposta
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {ehRascunho ? (
            <Button
              className="min-h-11"
              title="Marcar como enviada e copiar"
              disabled={enviarECopiar.isPending}
              onClick={() => enviarECopiar.mutate()}
            >
              <Copy className="mr-1 size-4" />
              {enviarECopiar.isPending ? "Enviando…" : "Marcar como enviada e copiar"}
            </Button>
          ) : (
            <Button
              className="min-h-11"
              title="Copiar mensagem e link"
              onClick={() => copiar(mensagem, "Mensagem copiada!")}
            >
              <Copy className="mr-1 size-4" /> Copiar mensagem e link
            </Button>
          )}
          <Button
            variant="outline" className="min-h-11"
            disabled={ehRascunho}
            title={
              ehRascunho
                ? "Enquanto for rascunho, este link responde “não encontrada”. Marque como enviada primeiro."
                : "Copiar somente link"
            }
            onClick={() => copiar(linkPublico, "Link copiado!")}
          >
            Copiar somente link
          </Button>
          <Button variant="outline" className="min-h-11" asChild>
            <a href={linkPublico} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-4" /> Abrir proposta
            </a>
          </Button>
        </div>
        {/* A prévia é o texto exato que foi para a área de transferência.
            Serve de conferência e de saída manual quando o navegador recusa
            copiar — é também o único lugar onde a URL aparece escrita. */}
        <p className="whitespace-pre-line rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {mensagem}
        </p>
        <p className="text-xs text-muted-foreground">
          {ehRascunho
            ? "Enquanto for rascunho, o link responde “não encontrada” — a cliente não vê proposta pela metade. Por isso copiar já marca como enviada."
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
        {/* Cinco colunas não cabem em 390px: no celular cada item vira uma
            linha vertical, com a mesma informação — descrição, tipo,
            quantidade, unitário e total. Nenhum dado sai da tela. */}
        <table className="fin-tabela mt-3 hidden md:table">
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
        <ul className="mt-3 md:hidden">
          {o.linhas.map((l: any) => (
            <li key={l.id} className="flex items-start justify-between gap-3 border-t px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm" style={{ color: "var(--fin-navy-ink)" }}>{l.descricao}</p>
                <p className="painel-periodo mt-0.5">
                  {TIPO_DA_LINHA_LABEL[l.tipo as TipoDaLinha]} · {l.quantidade} × {brl(l.valorUnitario)}
                </p>
              </div>
              <span className="fin-numero shrink-0 text-sm">{brl(l.total)}</span>
            </li>
          ))}
        </ul>
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

      {/* RODAPÉ — o que tira a proposta de circulação.
        *
        * Fica aqui embaixo, em tom apagado, longe dos botões que fazem a
        * venda andar. Excluir é permanente: não merece estar ao lado de
        * "Enviar" esperando um clique errado. */}
      {(podeExcluir || (situacao !== "APROVADO" && situacao !== "RECUSADO")) && (
        <div className="flex flex-wrap items-center justify-end gap-1 pb-4">
          {situacao !== "APROVADO" && situacao !== "RECUSADO" && (
            <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={() => setPerdendo(true)}>
              Marcar como perdida
            </Button>
          )}
          {podeExcluir && (
            <Button
              variant="ghost"
              className="min-h-11 text-muted-foreground"
              onClick={() => setExcluindo(true)}
            >
              <Trash2 className="mr-1 size-4" /> Excluir orçamento
            </Button>
          )}
        </div>
      )}

      {o.motivoDaPerda && (
        <p className="pb-4 text-sm text-muted-foreground">Motivo registrado: {o.motivoDaPerda}</p>
      )}

      <AlertDialog open={excluindo} onOpenChange={(v) => !v && setExcluindo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir a proposta nº {o.numero} de {o.cliente}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e não tem desfazer. Somem a proposta, os itens dela e o
              histórico de versões, e o link público para de abrir para sempre — se ele já estiver
              no WhatsApp da cliente, ela vai ver “não encontrada”. Cliente, catálogo, reservas e
              pagamentos não são tocados. Se a intenção é só tirar da lista de acompanhamento, use
              “Marcar como perdida”, que preserva o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              style={{ background: "var(--color-coral-dark, #c4472a)" }}
              onClick={(e) => { e.preventDefault(); excluir.mutate(); }}
              disabled={excluir.isPending}
            >
              {excluir.isPending ? "Excluindo…" : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
