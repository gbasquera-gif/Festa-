import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RESERVATION_STATUSES, type ReservationStatus } from "@festae/shared";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

interface ReservationRow {
  id: string;
  eventDate: string;
  status: ReservationStatus;
  notes: string | null;
  order: {
    total: string;
    kit: { name: string } | null;
    event: {
      user: { name: string; email: string };
      theme: { name: string } | null;
    };
  };
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmada",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
};

const STATUS_VARIANT: Record<ReservationStatus, "default" | "secondary" | "destructive"> = {
  PENDING: "secondary",
  CONFIRMED: "default",
  REJECTED: "destructive",
  CANCELLED: "destructive",
  COMPLETED: "default",
};

export default function Reservations() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["reservations"],
    queryFn: () => api<ReservationRow[]>("/reservations"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      api(`/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Status da reserva atualizado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao atualizar reserva."),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Reservas</h1>
      <p className="mb-6 text-muted-foreground">Acompanhe e confirme as solicitações de reserva de data.</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data do evento</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Tema / Kit</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                Nenhuma reserva solicitada ainda.
              </TableCell>
            </TableRow>
          )}
          {data?.map((reservation) => (
            <TableRow key={reservation.id}>
              <TableCell>{new Date(reservation.eventDate).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                <div className="font-medium">{reservation.order.event.user.name}</div>
                <div className="text-xs text-muted-foreground">{reservation.order.event.user.email}</div>
              </TableCell>
              <TableCell>
                <div>{reservation.order.event.theme?.name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{reservation.order.kit?.name ?? "—"}</div>
              </TableCell>
              <TableCell>R$ {Number(reservation.order.total).toFixed(2)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[reservation.status]}>{STATUS_LABEL[reservation.status]}</Badge>
                  <Select
                    value={reservation.status}
                    onValueChange={(status) =>
                      statusMutation.mutate({ id: reservation.id, status: status as ReservationStatus })
                    }
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESERVATION_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABEL[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">{reservation.notes ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
