import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "CLIENT" | "ADMIN" | "OPS";
  createdAt: string;
}

export default function Users() {
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/users") });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Clientes</h1>
      <p className="mb-6 text-muted-foreground">Todas as contas cadastradas no app.</p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Desde</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>{user.phone ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={user.role === "CLIENT" ? "secondary" : "default"}>{user.role}</Badge>
              </TableCell>
              <TableCell>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
