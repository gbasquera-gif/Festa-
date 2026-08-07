import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { createThemeSchema, type CreateThemeInput } from "@festae/shared";
import { ImageUploadField } from "@/components/image-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FormErrors } from "@/components/form-errors";
import { api } from "@/lib/api";

interface Theme extends CreateThemeInput {
  id: string;
}

// zod .default()/coerce fields make the schema's input type diverge from its
// output type (z.infer) — the form works with the pre-parse input shape and
// lets the backend (which validates with the same schema) fill in defaults.
type ThemeFormValues = z.input<typeof createThemeSchema>;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ThemeForm({ theme, onSaved }: { theme?: Theme; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<ThemeFormValues>({
    resolver: zodResolver(createThemeSchema),
    defaultValues: theme ?? {
      name: "",
      slug: "",
      description: "",
      colorPalette: [],
      suggestedEventTypes: [],
      active: true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: ThemeFormValues) =>
      theme
        ? api(`/themes/${theme.id}`, { method: "PUT", body: JSON.stringify(data) })
        : api("/themes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      toast.success(theme ? "Tema atualizado." : "Tema criado.");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar tema."),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          {...form.register("name", {
            onChange: (e) => {
              if (!theme) form.setValue("slug", slugify(e.target.value));
            },
          })}
        />
        {form.formState.errors.name && (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" {...form.register("slug")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" rows={3} {...form.register("description")} />
      </div>
      <ImageUploadField
        label="Foto de capa"
        folder="themes"
        value={form.watch("coverImageUrl")}
        onChange={(url) => form.setValue("coverImageUrl", url)}
      />
      <FormErrors errors={form.formState.errors} />
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Themes() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Theme | undefined>(undefined);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/themes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      toast.success("Tema removido.");
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Temas</h1>
          <p className="text-muted-foreground">Catálogo de temas usados na recomendação de kits.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(undefined);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(undefined)}>
              <Plus className="size-4" /> Novo tema
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar tema" : "Novo tema"}</DialogTitle>
            </DialogHeader>
            <ThemeForm theme={editing} onSaved={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.map((theme) => (
            <TableRow key={theme.id}>
              <TableCell className="font-medium">{theme.name}</TableCell>
              <TableCell className="text-muted-foreground">{theme.slug}</TableCell>
              <TableCell>
                <Badge variant={theme.active ? "default" : "secondary"}>
                  {theme.active ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(theme);
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover tema?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{theme.name}" será desativado e não aparecerá mais no app.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(theme.id)}>
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
