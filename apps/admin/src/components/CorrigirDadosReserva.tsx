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
import { ApiError, api } from "@/lib/api";

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
  /**
   * Como os dados estavam quando esta tela abriu. Vai junto com o que mudou:
   * se outra pessoa corrigiu o mesmo campo nesse meio-tempo, o servidor
   * recusa em vez de gravar por cima (e o que ninguém mais mexeu passa).
   */
  const [antes] = useState({ nome: cliente, telefone: telefone ?? null, endereco: endereco ?? null });
  const [alterado, setAlterado] = useState<string | null>(null);

  const recarregar = () => {
    queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["reserva", reservaId] });
  };

  /** Só o que mudou nesta tela — o resto não é enviado, e não é sobrescrito. */
  const mudancas = {
    ...(nome.trim() !== (antes.nome ?? "").trim() ? { nome } : {}),
    ...(tel.trim() !== (antes.telefone ?? "").trim() ? { telefone: tel } : {}),
    ...(end.trim() !== (antes.endereco ?? "").trim() ? { endereco: end } : {}),
  };
  const semMudanca = Object.keys(mudancas).length === 0;

  const salvar = useMutation({
    mutationFn: () =>
      api(`/operacao/reservas/${reservaId}/dados`, {
        method: "PATCH",
        body: JSON.stringify({
          ...mudancas,
          antes: Object.fromEntries(Object.keys(mudancas).map((c) => [c, antes[c as keyof typeof antes]])),
        }),
      }),
    onSuccess: () => {
      toast.success("Dados corrigidos.");
      recarregar();
      onFechar();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.detalhes?.codigo === "CADASTRO_ALTERADO") {
        setAlterado(e.message);
        recarregar();
        return;
      }
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    },
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
          {alterado && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" data-cadastro-alterado>
              {alterado} Feche e abra de novo para ver os dados atuais.
            </p>
          )}
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
            disabled={salvar.isPending || semMudanca || alterado !== null}
            className="w-full sm:w-auto"
          >
            {salvar.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
