import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Notificacoes } from "./tipos";

const CINCO_MINUTOS = 5 * 60_000;

/**
 * O sino do painel: os avisos de contas a pagar. Só ADMIN (quem chama
 * decide; o servidor recusa os outros papéis).
 *
 * A contagem é de avisos não lidos de contas ainda em aberto — conta paga
 * deixa de pedir atenção sozinha. Nenhum valor aparece aqui.
 */
export function SinoDeAvisos({ compacto = false, className = "" }: { compacto?: boolean; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();

  const contagem = useQuery<{ naoLidas: number }>({
    queryKey: ["notificacoes", "contagem"],
    queryFn: () => api("/notificacoes/contagem"),
    refetchInterval: CINCO_MINUTOS,
  });
  const lista = useQuery<Notificacoes>({
    queryKey: ["notificacoes", "lista"],
    queryFn: () => api("/notificacoes?limite=30"),
    enabled: aberto,
  });
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["notificacoes"] });
  const marcar = useMutation({ mutationFn: (id: string) => api(`/notificacoes/${id}/lida`, { method: "POST" }), onSuccess: atualizar });
  const marcarTodas = useMutation({ mutationFn: () => api("/notificacoes/lidas", { method: "POST" }), onSuccess: atualizar });

  const naoLidas = contagem.data?.naoLidas ?? 0;
  const rotulo = naoLidas > 0 ? `Avisos de contas: ${naoLidas} não lido${naoLidas === 1 ? "" : "s"}` : "Avisos de contas";

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={rotulo}
        title={rotulo}
        className={`relative flex items-center gap-2 rounded-md text-sm hover:bg-muted/60 ${className}`}
        style={{ color: "var(--color-navy)" }}
        data-sino
      >
        <Bell className="size-[18px]" aria-hidden />
        {!compacto && <span>Avisos</span>}
        {naoLidas > 0 && (
          <span
            className="absolute -top-0.5 left-5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[0.65rem] font-bold text-white"
            style={{ background: "var(--fin-coral, #e05a3a)", height: 18 }}
            aria-hidden
          >
            {naoLidas > 99 ? "99+" : naoLidas}
          </span>
        )}
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[460px]" data-central-de-avisos>
          <DialogHeader>
            <DialogTitle>Avisos de contas</DialogTitle>
            <DialogDescription>Contas que vencem em breve ou venceram. Conta paga não recebe novo aviso.</DialogDescription>
          </DialogHeader>
          {lista.isLoading && <p className="text-sm">Carregando…</p>}
          {lista.data && lista.data.itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aviso.</p>}
          <ul className="grid gap-2">
            {lista.data?.itens.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
                  style={{ opacity: n.lida || n.paga ? 0.6 : 1 }}
                  onClick={() => {
                    if (!n.lida) marcar.mutate(n.id);
                    setAberto(false);
                    navegar("/financeiro?aba=contas");
                  }}
                >
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: n.lida || n.paga ? "transparent" : "var(--fin-coral, #e05a3a)" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block" style={{ color: "var(--color-navy)" }}>
                      {n.titulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      vence {n.vencimento.split("-").reverse().join("/")} · aviso de {n.dia.split("-").reverse().join("/")}
                      {n.paga ? " · paga" : ""}
                      {n.paga === null ? " · lançamento removido" : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {naoLidas > 0 && (
            <Button variant="outline" className="min-h-11" onClick={() => marcarTodas.mutate()} disabled={marcarTodas.isPending}>
              Marcar todos como lidos
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
