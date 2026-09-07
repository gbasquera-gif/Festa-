import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Pencil, Trash2 } from "lucide-react";
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
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { CorrigirDadosReserva } from "@/components/CorrigirDadosReserva";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** O que a pessoa precisa digitar para a exclusão sair do lugar. */
const PALAVRA_DE_CONFIRMACAO = "EXCLUIR";

/**
 * As três ações de uma reserva, na ordem do risco.
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
  const queryClient = useQueryClient();
  const [corrigindo, setCorrigindo] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [digitado, setDigitado] = useState("");

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
    queryClient.invalidateQueries({ queryKey: ["conflitos"] });
  }

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
        <Button variant="outline" className="justify-start" onClick={() => setCorrigindo(true)}>
          <Pencil className="mr-2 size-4" />
          Editar dados
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
