import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "CLIENT" | "ADMIN" | "OPS";
  createdAt: string;
  deletedAt: string | null;
  termsAcceptedAt: string | null;
  termsAcceptedVersion: string | null;
}

const MIN_PASSWORD_LENGTH = 8;

/**
 * Define uma senha para o cliente que perdeu a dele e pediu ajuda pelo
 * WhatsApp. É o substituto manual da recuperação por e-mail, que ainda não
 * existe — sem isso a única saída seria mexer no banco na mão.
 */
function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api(`/users/${user.id}/password`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      }),
    onSuccess: () => {
      toast.success(`Senha de ${user.name} redefinida. Combine a nova senha com a pessoa.`);
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao redefinir a senha."),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova senha para {user.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="nova-senha">Senha</Label>
          <Input
            id="nova-senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
            autoComplete="new-password"
          />
          <p className="text-sm text-muted-foreground">
            Passe a senha por um canal direto e peça que a pessoa troque depois.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={password.length < MIN_PASSWORD_LENGTH || mutation.isPending}
          >
            {mutation.isPending ? "Salvando..." : "Definir senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ROLE_OPTIONS: { value: UserRow["role"]; label: string; hint: string }[] = [
  { value: "CLIENT", label: "Cliente", hint: "Usa o aplicativo para contratar festas." },
  { value: "OPS", label: "Operação", hint: "Gerencia catálogo e reservas no painel." },
  { value: "ADMIN", label: "Administrador", hint: "Tudo da operação, mais gestão de contas." },
];

/** Corrige e-mail digitado errado, atualiza nome e gere os acessos da equipe. */
function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRow["role"]>(user.role);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, email, role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success("Conta atualizada.");
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar a conta."),
  });

  const unchanged = name === user.name && email === user.email && role === user.role;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="editar-nome">Nome</Label>
            <Input
              id="editar-nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editar-email">E-mail</Label>
            <Input
              id="editar-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              É com este endereço que a pessoa entra — avise antes de trocar.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Perfil</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRow["role"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} — {option.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={unchanged || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => api<UserRow[]>("/users") });

  // Trocar a senha de alguém é poder entrar na conta dessa pessoa: o backend
  // restringe a ADMIN, e a coluna some para quem não pode usar.
  const canResetPassword = currentUser?.role === "ADMIN";

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
            {/* Prova de consentimento: se um cliente questionar, é aqui que se
                mostra quando ele aceitou e qual texto estava valendo. */}
            <TableHead>Aceite dos termos</TableHead>
            {canResetPassword && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={canResetPassword ? 7 : 6}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>{user.phone ?? "—"}</TableCell>
              <TableCell>
                {user.deletedAt ? (
                  <Badge variant="outline">Conta excluída</Badge>
                ) : (
                  <Badge variant={user.role === "CLIENT" ? "secondary" : "default"}>{user.role}</Badge>
                )}
              </TableCell>
              <TableCell>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</TableCell>
              <TableCell className="text-muted-foreground">
                {user.termsAcceptedAt
                  ? `${new Date(user.termsAcceptedAt).toLocaleDateString("pt-BR")} · v${user.termsAcceptedVersion}`
                  : "—"}
              </TableCell>
              {canResetPassword && (
                <TableCell className="space-x-2 text-right">
                  {!user.deletedAt && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditing(user)}>
                        Editar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setResetting(user)}>
                        Nova senha
                      </Button>
                    </>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && <EditUserDialog user={editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}
