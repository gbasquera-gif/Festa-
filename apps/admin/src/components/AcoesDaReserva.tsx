import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Ban, CalendarClock, Pencil, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CorrigirDadosReserva } from "@/components/CorrigirDadosReserva";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Item que não cabe na data de destino, com a conta que a operação precisa ver. */
interface ConflitoDeData {
  produto: string;
  estoqueTotal: number;
  jaComprometido: number;
  necessario: number;
  disponivel: number;
}

/** O que a pessoa precisa digitar para a exclusão sair do lugar. */
const PALAVRA_DE_CONFIRMACAO = "EXCLUIR";

/**
 * As ações de uma reserva, na ordem do risco.
 *
 * Corrigir dados é reversível, cancelar guarda o histórico e excluir não tem
 * volta — e a tela precisa deixar essa diferença óbvia antes do toque, não
 * depois. Por isso a exclusão é vermelha, fica por último, é separada por uma
 * linha e só existe para quem é ADMIN.
 */
export function AcoesDaReserva({
  reservaId,
  cliente,
  telefone,
  endereco,
  data,
  total,
  jaCancelada,
  onDepoisDeExcluir,
}: {
  reservaId: string;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  data: string;
  total: number;
  jaCancelada: boolean;
  onDepoisDeExcluir?: () => void;
}) {
  const { user } = useAuth();
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();
  const [corrigindo, setCorrigindo] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [remarcando, setRemarcando] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoDeData[] | null>(null);
  /** Recusa que não é falta de material — agenda cheia, data igual à atual. */
  const [motivoRecusa, setMotivoRecusa] = useState<string | null>(null);

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
    queryClient.invalidateQueries({ queryKey: ["conflitos"] });
  }

  const remarcar = useMutation({
    mutationFn: () =>
      api(`/reservations/${reservaId}/data`, {
        method: "PATCH",
        body: JSON.stringify({ data: novaData }),
      }),
    onSuccess: () => {
      toast.success("Data alterada. A data antiga voltou a ficar livre na loja.");
      setRemarcando(false);
      setConflitos(null);
      setMotivoRecusa(null);
      setNovaData("");
      recarregar();
    },
    // A recusa fica dentro do diálogo, não num aviso que some sozinho: quem
    // está com a cliente na linha precisa reler o motivo enquanto escolhe
    // outro dia, e um aviso passageiro obriga a tentar de novo para lembrar.
    onError: (e) => {
      setConflitos(null);
      setMotivoRecusa(null);
      if (e instanceof ApiError && Array.isArray(e.detalhes?.conflitos)) {
        setConflitos(e.detalhes.conflitos as ConflitoDeData[]);
        return;
      }
      setMotivoRecusa(e instanceof Error ? e.message : "Não foi possível alterar a data.");
    },
  });

  const cancelar = useMutation({
    mutationFn: () => api(`/reservations/${reservaId}/cancelar`, { method: "PATCH" }),
    onSuccess: () => {
      toast.success("Reserva cancelada. A data e o material voltaram a ficar livres.");
      setConfirmandoCancelar(false);
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível cancelar."),
  });

  const excluir = useMutation({
    mutationFn: () =>
      api<{ pagamentosApagados: number; clienteRemovido: string | null }>(
        `/reservations/${reservaId}`,
        { method: "DELETE" },
      ),
    onSuccess: (r) => {
      toast.success(
        `Reserva excluída.${r.clienteRemovido ? ` A ficha de ${r.clienteRemovido} saiu junto.` : ""}`,
      );
      setConfirmandoExcluir(false);
      setDigitado("");
      recarregar();
      onDepoisDeExcluir?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
  });

  return (
    <section className="min-w-0 space-y-3">
      <h3 className="text-sm font-bold text-navy">Ações</h3>

      <div className="flex flex-col gap-2">
        {/* A edição completa vem primeiro porque é o que a operação procura
            quando a cliente muda de ideia: data, kit, itens e valores numa
            tela só. As ações abaixo são atalhos para os casos estreitos. */}
        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada}
          onClick={() => navegar(`/reservas/${reservaId}/editar`)}
        >
          <SquarePen className="mr-2 size-4" />
          Editar reserva completa
        </Button>

        <Button variant="outline" className="justify-start" onClick={() => setCorrigindo(true)}>
          <Pencil className="mr-2 size-4" />
          Corrigir contato e observações
        </Button>

        {/* Remarcar é o pedido mais comum depois que a festa já está fechada:
            a cliente muda o dia e, sem esta ação, a saída seria cancelar e
            lançar de novo — perdendo pagamento, histórico e checklist. */}
        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada}
          onClick={() => {
            setConflitos(null);
            setMotivoRecusa(null);
            setRemarcando(true);
          }}
        >
          <CalendarClock className="mr-2 size-4" />
          Alterar data da festa
        </Button>

        <Button
          variant="outline"
          className="justify-start"
          disabled={jaCancelada || cancelar.isPending}
          onClick={() => setConfirmandoCancelar(true)}
        >
          <Ban className="mr-2 size-4" />
          {jaCancelada ? "Reserva já cancelada" : "Cancelar reserva"}
        </Button>

        {/* Só o dono apaga. Cancelar desfaz a venda guardando o histórico;
            excluir apaga a festa inteira e não tem volta — não é tarefa de
            operação do dia a dia, e o botão nem aparece para quem não pode. */}
        {user?.role === "ADMIN" && (
          <>
            <div className="mt-1 border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmandoExcluir(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Excluir definitivamente
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Para lançamentos de teste ou feitos por engano. Não tem volta.
              </p>
            </div>
          </>
        )}
      </div>

      {corrigindo && (
        <CorrigirDadosReserva
          reservaId={reservaId}
          cliente={cliente}
          telefone={telefone}
          endereco={endereco}
          aberto
          onFechar={() => setCorrigindo(false)}
        />
      )}

      {/* Remarcar: a data de destino passa pelas mesmas conferências de uma
          reserva nova. Quando não cabe, a tela mostra a conta em vez de um
          "erro" seco — quem está com a cliente na linha precisa saber se o
          problema é agenda cheia ou material, para propor outro dia. */}
      <Dialog
        open={remarcando}
        onOpenChange={(v) => {
          if (!v) {
            setRemarcando(false);
            setConflitos(null);
            setMotivoRecusa(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar a data da festa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Hoje marcada para <strong className="text-navy">{data}</strong>. O pagamento, o
              histórico e o checklist ficam como estão — só a data muda.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label>Nova data</Label>
              <Input
                type="date"
                value={novaData}
                onChange={(e) => {
                  setNovaData(e.target.value);
                  setConflitos(null);
                  setMotivoRecusa(null);
                }}
              />
            </div>

            {motivoRecusa && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {motivoRecusa}
              </div>
            )}

            {conflitos && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm">
                <p className="font-semibold text-red-900">Falta material nessa data</p>
                {conflitos.map((c) => (
                  <p key={c.produto} className="mt-1 text-red-800">
                    <strong>{c.produto}</strong>: acervo {c.estoqueTotal} · já comprometido{" "}
                    {c.jaComprometido} · disponível {c.disponivel} · esta festa precisa de{" "}
                    {c.necessario}
                  </p>
                ))}
                <p className="mt-2 text-red-800">Escolha outro dia ou remarque a outra festa.</p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              A data antiga volta a ficar livre na loja assim que você salvar. Se a cliente já
              adicionou a festa ao calendário do celular, o arquivo antigo continua com a data
              velha — vale reenviar.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setRemarcando(false);
                setConflitos(null);
                setMotivoRecusa(null);
              }}
            >
              Voltar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!novaData || remarcar.isPending}
              onClick={() => remarcar.mutate()}
            >
              {remarcar.isPending ? "Alterando..." : "Alterar data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancelar: confirmação simples, porque a ação é reversível na prática
          — a reserva continua no banco e o histórico permanece. */}
      <Dialog open={confirmandoCancelar} onOpenChange={(v) => !v && setConfirmandoCancelar(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar a reserva de {cliente}?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              A festa de <strong>{data}</strong> deixa de ocupar a agenda, e o material volta para o
              acervo — a data fica livre para outra cliente na mesma hora.
            </p>
            <p className="text-muted-foreground">
              A reserva continua no sistema com o histórico e os pagamentos já registrados. Fica
              gravado quem cancelou e quando.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => setConfirmandoCancelar(false)}
            >
              Voltar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={cancelar.isPending}
              onClick={() => cancelar.mutate()}
            >
              {cancelar.isPending ? "Cancelando..." : "Cancelar reserva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir: duas etapas. A primeira diz o que some; a segunda exige
          digitar a palavra, para o toque errado num celular não apagar uma
          festa de verdade. */}
      <Dialog
        open={confirmandoExcluir}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmandoExcluir(false);
            setDigitado("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir definitivamente?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Some do sistema a festa de <strong>{cliente}</strong> em <strong>{data}</strong>, com
              o pedido, os itens, os pagamentos registrados ({brl(total)}) e o checklist.
            </p>
            <p>
              A data e o material voltam a ficar livres, e a reserva sai da lista, das Próximas
              Ações e dos indicadores.
            </p>
            <p className="font-medium text-destructive">
              Não tem como desfazer. Para desfazer uma venda de verdade, use "Cancelar reserva" —
              ali o histórico fica.
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <Label>
                Digite <span className="font-mono font-bold">{PALAVRA_DE_CONFIRMACAO}</span> para
                confirmar
              </Label>
              <Input
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                placeholder={PALAVRA_DE_CONFIRMACAO}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                setConfirmandoExcluir(false);
                setDigitado("");
              }}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              disabled={digitado.trim().toUpperCase() !== PALAVRA_DE_CONFIRMACAO || excluir.isPending}
              onClick={() => excluir.mutate()}
            >
              {excluir.isPending ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
