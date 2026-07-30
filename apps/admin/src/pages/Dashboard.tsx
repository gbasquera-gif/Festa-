import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface Theme {
  id: string;
}
interface Product {
  id: string;
}
interface Kit {
  id: string;
}
interface EventItem {
  id: string;
}
interface Reservation {
  id: string;
  status: string;
}
interface AdminUserRow {
  id: string;
  role: string;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-extrabold text-navy">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const themes = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const kits = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const events = useQuery({ queryKey: ["events-admin"], queryFn: () => api<EventItem[]>("/events/admin/all") });
  const reservations = useQuery({
    queryKey: ["reservations"],
    queryFn: () => api<Reservation[]>("/reservations"),
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<AdminUserRow[]>("/users") });

  const pendingReservations = reservations.data?.filter((r) => r.status === "PENDING").length ?? 0;
  const clients = users.data?.filter((u) => u.role === "CLIENT").length ?? 0;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Dashboard</h1>
      <p className="mb-6 text-muted-foreground">Visão geral da operação Festaê.</p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Temas ativos" value={themes.data?.length ?? "—"} />
        <StatCard label="Produtos ativos" value={products.data?.length ?? "—"} />
        <StatCard label="Kits ativos" value={kits.data?.length ?? "—"} />
        <StatCard label="Reservas pendentes" value={pendingReservations} />
        <StatCard label="Eventos criados" value={events.data?.length ?? "—"} />
        <StatCard label="Clientes cadastrados" value={clients} />
      </div>
    </div>
  );
}
