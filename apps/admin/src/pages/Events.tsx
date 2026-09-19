import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EVENT_TYPES, EVENT_TYPE_META, formatarDataDaFesta, isEventType } from "@festae/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

interface EventRow {
  id: string;
  type: string;
  date: string;
  guestCount: number | null;
  budgetGoal: string | null;
  city: string;
  theme: { name: string } | null;
  user: { name: string; email: string | null };
  order: { status: string; total: string } | null;
}

/** O mesmo nome que o cliente viu no app, vindo do pacote compartilhado. */
function typeLabel(type: string) {
  return isEventType(type) ? EVENT_TYPE_META[type].label : type;
}

/** O dia da festa como o `<input type="date">` espera, sem passar por fuso. */
function diaDoInput(iso: string) {
  return iso.slice(0, 10);
}

/**
 * Corrige o que foi digitado errado no cadastro da festa.
 *
 * Só os campos que a operação realmente precisa acertar pelo painel: data,
 * tipo, convidados e cidade. Tema e kit mudam preço e disponibilidade, então
 * continuam saindo pela tela de Reservas, que confere agenda e estoque — um
 * segundo caminho para trocar o kit seria um caminho sem essa conferência.
 */
function EditarEvento({ evento, aoFechar }: { evento: EventRow; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(diaDoInput(evento.date));
  const [type, setType] = useState(evento.type);
  const [guestCount, setGuestCount] = useState(
    evento.guestCount === null ? "" : String(evento.guestCount),
  );
  const [city, setCity] = useState(evento.city);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/events/${evento.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date,
          type,
          city,
          // Vazio é "a combinar", e vai como nulo explícito: omitir o campo
          // diria "não mexi nisto", e o número apagado voltaria na lista.
          guestCount: guestCount.trim() ? Number(guestCount) : null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-admin"] });
      toast.success("Festa atualizada.");
      aoFechar();
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Erro ao atualizar a festa."),
  });

  const semMudanca =
    date === diaDoInput(evento.date) &&
    type === evento.type &&
    city === evento.city &&
    guestCount === (evento.guestCount === null ? "" : String(evento.guestCount));

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar festa de {evento.user.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="evento-data">Data da festa</Label>
            <Input
              id="evento-data"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {evento.order && (
              <p className="text-sm text-muted-foreground">
                Esta festa já tem pedido. Mudar a data aqui não reconfere agenda nem estoque —
                para remarcar uma reserva, use a tela de Reservas.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-tipo">Tipo</Label>
            <select
              id="evento-tipo"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_META[t].label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-convidados">Convidados</Label>
            <Input
              id="evento-convidados"
              type="number"
              min={1}
              max={2000}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder="a combinar"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="evento-cidade">Cidade</Label>
            <Input id="evento-cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={semMudanca || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Exclui a festa que nunca virou contrato.
 *
 * Festa com reserva, pagamento ou pedido fechado volta recusada do servidor,
 * e a recusa aparece inteira: apagar ali apagaria o contrato e o histórico
 * financeiro em cascata. Desfazer venda é cancelar a reserva, não excluir.
 */
function ExcluirEvento({ evento, aoFechar }: { evento: EventRow; aoFechar: () => void }) {
  const queryClient = useQueryClient();
  const [recusa, setRecusa] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api(`/events/${evento.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-admin"] });
      toast.success("Festa excluída.");
      aoFechar();
    },
    onError: (erro) =>
      setRecusa(erro instanceof Error ? erro.message : "Não foi possível excluir esta festa."),
  });

  return (
    <AlertDialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Excluir a festa de {evento.user.name} em {formatarDataDaFesta(evento.date)}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {recusa ??
              "Só sai daqui o que ainda não virou contrato. Se houver reserva, pagamento ou pedido fechado, o servidor recusa e diz qual é o vínculo. Isto não tem desfazer."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{recusa ? "Fechar" : "Cancelar"}</AlertDialogCancel>
          {!recusa && (
            <AlertDialogAction
              className="min-h-11"
              onClick={(e) => {
                e.preventDefault();
                mutation.mutate();
              }}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Events() {
  const [editando, setEditando] = useState<EventRow | null>(null);
  const [excluindo, setExcluindo] = useState<EventRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["events-admin"],
    queryFn: () => api<EventRow[]>("/events/admin/all"),
  });

  return (
    <div>
      <h1 className="mb-1 text-[1.65rem] font-semibold text-navy">Eventos</h1>
      <p className="mb-6 text-muted-foreground">Todas as festas criadas pelos clientes no app.</p>

      <div className="tabela-cards">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Tema</TableHead>
            <TableHead>Convidados</TableHead>
            <TableHead>Orçamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.map((event) => (
            <TableRow key={event.id}>
              <TableCell data-label="Data">{formatarDataDaFesta(event.date)}</TableCell>
              <TableCell data-label="Cliente">
                <div className="font-medium">{event.user.name}</div>
                <div className="text-xs text-muted-foreground">{event.user.email ?? "sem e-mail"}</div>
              </TableCell>
              <TableCell data-label="Tipo">{typeLabel(event.type)}</TableCell>
              <TableCell data-label="Tema">{event.theme?.name ?? "—"}</TableCell>
              <TableCell data-label="Convidados">{event.guestCount ?? "—"}</TableCell>
              <TableCell data-label="Orçamento">{event.order ? `R$ ${Number(event.order.total).toFixed(2)}` : "—"}</TableCell>
              <TableCell data-label="Status">
                <Badge variant="secondary">{event.order?.status ?? "—"}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditando(event)}>
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExcluindo(event)}>
                    Excluir
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {editando && <EditarEvento evento={editando} aoFechar={() => setEditando(null)} />}
      {excluindo && <ExcluirEvento evento={excluindo} aoFechar={() => setExcluindo(null)} />}
    </div>
  );
}
