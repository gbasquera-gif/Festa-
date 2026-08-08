import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { z } from "zod";
import { createKitSchema, type CreateKitInput } from "@festae/shared";
import { ImageUploadField } from "@/components/image-upload-field";
import { ImageCarouselField } from "@/components/image-carousel-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface Theme {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
}
interface Kit extends Omit<CreateKitInput, "products"> {
  id: string;
  theme: Theme | null;
  products: { productId: string; quantity: number; product: Product }[];
}

type KitFormValues = Omit<z.input<typeof createKitSchema>, "products">;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function KitForm({
  kit,
  themes,
  products,
  onSaved,
}: {
  kit?: Kit;
  themes: Theme[];
  products: Product[];
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const initialSelection = new Map(kit?.products.map((p) => [p.productId, p.quantity]) ?? []);
  const [selected, setSelected] = useState<Map<string, number>>(initialSelection);

  const form = useForm<KitFormValues>({
    resolver: zodResolver(createKitSchema.omit({ products: true })),
    defaultValues: kit ?? {
      name: "",
      slug: "",
      description: "",
      basePrice: 0,
      minGuests: 0,
      maxGuests: 9999,
      active: true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: KitFormValues) => {
      // `data` was already validated (and coerced) by the zod resolver at
      // this point — the cast just reconciles RHF's pre-parse input typing.
      const payload = {
        ...data,
        products: Array.from(selected.entries()).map(([productId, quantity]) => ({ productId, quantity })),
      } as CreateKitInput;
      return kit
        ? api(`/kits/${kit.id}`, { method: "PUT", body: JSON.stringify(payload) })
        : api("/kits", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      toast.success(kit ? "Kit atualizado." : "Kit criado.");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao salvar kit."),
  });

  function toggleProduct(productId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(productId, next.get(productId) ?? 1);
      else next.delete(productId);
      return next;
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setSelected((prev) => new Map(prev).set(productId, Math.max(1, quantity)));
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((data) => mutation.mutate(data))}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          {...form.register("name", {
            onChange: (e) => {
              if (!kit) form.setValue("slug", slugify(e.target.value));
            },
          })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" {...form.register("slug")} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Tema</Label>
          <Select defaultValue={kit?.theme?.id} onValueChange={(v) => form.setValue("themeId", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sem tema" />
            </SelectTrigger>
            <SelectContent>
              {themes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="basePrice">Preço base (R$)</Label>
          <Input id="basePrice" type="number" step="0.01" {...form.register("basePrice", { valueAsNumber: true })} />
        </div>
        <div className="flex flex-col gap-2" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="minGuests">Mín. convidados</Label>
          <Input id="minGuests" type="number" {...form.register("minGuests", { valueAsNumber: true })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="maxGuests">Máx. convidados</Label>
          <Input id="maxGuests" type="number" {...form.register("maxGuests", { valueAsNumber: true })} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" rows={2} {...form.register("description")} />
      </div>

      <ImageUploadField
        label="Foto de capa"
        folder="kits"
        value={form.watch("coverImageUrl")}
        onChange={(url) => form.setValue("coverImageUrl", url)}
      />
      <ImageCarouselField
        label="Carrossel do kit"
        folder="kits"
        value={form.watch("images") ?? []}
        onChange={(urls) => form.setValue("images", urls)}
      />

      <div className="flex flex-col gap-2">
        <Label>Produtos inclusos</Label>
        <div className="max-h-56 overflow-y-auto rounded-md border p-3">
          {products.map((product) => {
            const checked = selected.has(product.id);
            return (
              <div key={product.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleProduct(product.id, v === true)}
                  />
                  <span className="text-sm">{product.name}</span>
                </div>
                {checked && (
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    value={selected.get(product.id)}
                    onChange={(e) => setQuantity(product.id, Number(e.target.value))}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <FormErrors errors={form.formState.errors} />
      <DialogFooter>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export default function Kits() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Kit | undefined>(undefined);
  const queryClient = useQueryClient();

  const { data: kits, isLoading } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/kits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      toast.success("Kit removido.");
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Kits</h1>
          <p className="text-muted-foreground">Combinações de produtos recomendadas por tema e nº de convidados.</p>
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
              <Plus className="size-4" /> Novo kit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar kit" : "Novo kit"}</DialogTitle>
            </DialogHeader>
            {(themes || editing === undefined) && (
              <KitForm
                kit={editing}
                themes={themes ?? []}
                products={products ?? []}
                onSaved={() => setOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Tema</TableHead>
            <TableHead>Preço base</TableHead>
            <TableHead>Convidados</TableHead>
            <TableHead>Itens</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6}>Carregando...</TableCell>
            </TableRow>
          )}
          {kits?.map((kit) => (
            <TableRow key={kit.id}>
              <TableCell className="font-medium">{kit.name}</TableCell>
              <TableCell className="text-muted-foreground">{kit.theme?.name ?? "—"}</TableCell>
              <TableCell>R$ {Number(kit.basePrice).toFixed(2)}</TableCell>
              <TableCell>
                {kit.minGuests}–{kit.maxGuests}
              </TableCell>
              <TableCell>{kit.products.length}</TableCell>
              <TableCell className="flex justify-end gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(kit);
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
                      <AlertDialogTitle>Remover kit?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{kit.name}" será desativado e não aparecerá mais no app.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteMutation.mutate(kit.id)}>Remover</AlertDialogAction>
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
