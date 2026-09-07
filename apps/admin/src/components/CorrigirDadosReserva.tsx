import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

/**
 * Correção de erro de digitação numa reserva já registrada.
 *
 * Só o que não mexe em agenda, estoque ou dinheiro. Telefone errado é a festa
 * que ninguém confirma no dia; endereço errado é a entrega no lugar errado —
 * os dois erros mais caros e os mais fáceis de cometer digitando com o
 * cliente na linha.
 *
 * Mudar data, itens ou valores continua sendo cancelar e registrar de novo:
 * são as alterações que exigem reconferir a agenda e que reescreveriam um
 * pagamento que pode já ter sido recebido.
 *
 * Vive num componente só porque é usada em dois lugares — Próximas Ações e o
 * detalhe da reserva. Duas cópias divergem no primeiro campo que alguém
 * acrescenta em uma delas.
 */
export function CorrigirDadosReserva({
  reservaId,
  cliente,
  telefone,
  endereco,
  aberto,
  onFechar,
}: {
  reservaId: string;
  cliente: string;
  telefone: string | null;
  endereco: string | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState(cliente);
  const [tel, setTel] = useState(telefone ?? "");
  const [end, setEnd] = useState(endereco ?? "");

  const salvar = useMutation({
    mutationFn: () =>
      api(`/operacao/reservas/${reservaId}/dados`, {
        method: "PATCH",
        body: JSON.stringify({ nome, telefone: tel, endereco: end }),
      }),
    onSuccess: () => {
      toast.success("Dados corrigidos.");
      queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      onFechar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corrigir dados</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Telefone</Label>
            <Input inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Endereço</Label>
            <Textarea
              rows={2}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder="Deixe vazio se for retirada"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Data, itens e valores não se corrigem por aqui — para mudar o que foi vendido, cancele a
            reserva e registre de novo, para a agenda continuar honesta.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending}
            className="w-full sm:w-auto"
          >
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
