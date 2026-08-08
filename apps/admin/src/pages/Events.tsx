import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

interface EventRow {
  id: string;
  type: string;
  date: string;
  guestCount: number;
  budgetGoal: string | null;
  city: string;
  theme: { name: string } | null;
  user: { name: string; email: string };
  order: { status: string; total: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  FESTA_INFANTIL: "Festa Infantil",
  CHA_DE_BEBE: "Chá de Bebê",
  CHA_REVELACAO: "Chá de Revelação",
  OUTRO: "Outro",
};

export default function Events() {
  const { data, isLoading } = useQuery({
    queryKey: ["events-admin"],
    queryFn: () => api<EventRow[]>("/events/admin/all"),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Eventos</h1>
      <p className="mb-6 text-muted-foreground">Todas as festas criadas pelos clientes no app.</p>

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
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.map((event) => (
            <TableRow key={event.id}>
              <TableCell>{new Date(event.date).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell>
                <div className="font-medium">{event.user.name}</div>
                <div className="text-xs text-muted-foreground">{event.user.email}</div>
              </TableCell>
              <TableCell>{TYPE_LABEL[event.type] ?? event.type}</TableCell>
              <TableCell>{event.theme?.name ?? "—"}</TableCell>
              <TableCell>{event.guestCount}</TableCell>
              <TableCell>{event.order ? `R$ ${Number(event.order.total).toFixed(2)}` : "—"}</TableCell>
              <TableCell>
                <Badge variant="secondary">{event.order?.status ?? "—"}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
