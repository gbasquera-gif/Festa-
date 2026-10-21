import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NATUREZA_LABEL, type NaturezaDoGasto } from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { AvisoDeDepreciacao } from "./pecas";

export interface Gasto {
  id: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  valor: string | number;
  pagoEm: string | null;
  venceEm: string | null;
  categoria: string | null;
  formaDePagamento: string | null;
  fornecedor: string | null;
  observacao: string | null;
  vidaUtilMeses: number | null;
  valorResidual: string | number | null;
  referenciaExterna: string | null;
}

/** Data ISO do backend -> "AAAA-MM-DD" para o input de data. */
const paraCampo = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const VAZIO = {
  descricao: "",
  natureza: "" as NaturezaDoGasto | "",
  valor: "",
  pagoEm: "",
  venceEm: "",
  categoria: "",
  formaDePagamento: "",
  fornecedor: "",
  observacao: "",
  vidaUtilMeses: "",
  valorResidual: "",
};

export function FormularioDeGasto({
  aberto,
  aoFechar,
  gasto,
  naturezasPermitidas,
}: {
  aberto: boolean;
  aoFechar: () => void;
  gasto: Gasto | null;
  /** Despesas oferece consumo e custeio; Aportes oferece acervo. */
  naturezasPermitidas: readonly NaturezaDoGasto[];
}) {
  const [form, setForm] = useState(VAZIO);
  const queryClient = useQueryClient();
  const editando = gasto !== null;

  useEffect(() => {
    if (!aberto) return;
    setForm(
      gasto
        ? {
            descricao: gasto.descricao,
            natureza: gasto.natureza,
            valor: String(gasto.valor),
            pagoEm: paraCampo(gasto.pagoEm),
            venceEm: paraCampo(gasto.venceEm),
            categoria: gasto.categoria ?? "",
            formaDePagamento: gasto.formaDePagamento ?? "",
            fornecedor: gasto.fornecedor ?? "",
            observacao: gasto.observacao ?? "",
            vidaUtilMeses: gasto.vidaUtilMeses === null ? "" : String(gasto.vidaUtilMeses),
            valorResidual: gasto.valorResidual === null ? "" : String(gasto.valorResidual),
          }
        : // Natureza só vem preenchida quando a aba oferece uma opção só. Com
          // duas, a escolha fica em branco de propósito: foi o padrão implícito
          // que fez balão virar patrimônio no painel antigo.
          { ...VAZIO, natureza: naturezasPermitidas.length === 1 ? naturezasPermitidas[0] : "" },
    );
  }, [aberto, gasto, naturezasPermitidas]);

  const salvar = useMutation({
    mutationFn: async () => {
      const corpo: Record<string, unknown> = {
        descricao: form.descricao.trim(),
        natureza: form.natureza,
        valor: Number(form.valor),
        pagoEm: form.pagoEm || null,
        venceEm: form.venceEm || null,
        categoria: form.categoria.trim() || null,
        formaDePagamento: form.formaDePagamento.trim() || null,
        fornecedor: form.fornecedor.trim() || null,
        observacao: form.observacao.trim() || null,
        vidaUtilMeses: form.vidaUtilMeses ? Number(form.vidaUtilMeses) : null,
        valorResidual: form.valorResidual ? Number(form.valorResidual) : null,
      };
      return api(editando ? `/financeiro/gastos/${gasto.id}` : "/financeiro/gastos", {
        method: editando ? "PATCH" : "POST",
        body: JSON.stringify(corpo),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success(editando ? "Lançamento atualizado." : "Lançamento registrado.");
      aoFechar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const ehAcervo = form.natureza === "ACERVO";
  const podeSalvar = form.descricao.trim().length >= 2 && form.natureza !== "" && Number(form.valor) > 0;

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gasto-descricao">O que foi comprado</Label>
            <Input
              id="gasto-descricao"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Painel romano, balões, anúncio…"
              className="min-h-11"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="gasto-natureza">Natureza</Label>
            <select
              id="gasto-natureza"
              value={form.natureza}
              onChange={(e) => setForm({ ...form, natureza: e.target.value as NaturezaDoGasto })}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Escolha…</option>
              {naturezasPermitidas.map((n) => (
                <option key={n} value={n}>
                  {NATUREZA_LABEL[n]}
                </option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
              {form.natureza === "ACERVO"
                ? "Vira patrimônio alugável. Não é despesa do mês."
                : form.natureza === "CONSUMO"
                  ? "Some na festa. É despesa do mês em que saiu."
                  : form.natureza === "CUSTEIO"
                    ? "Mantém a empresa de pé. Despesa do mês, sempre."
                    : "Sem escolha não dá para salvar — foi o padrão implícito que quebrou o painel antigo."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gasto-valor">Valor</Label>
              <Input
                id="gasto-valor"
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gasto-fornecedor">Fornecedor (opcional)</Label>
              <Input
                id="gasto-fornecedor"
                value={form.fornecedor}
                onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
                className="min-h-11"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gasto-pago">Pago em</Label>
              <Input
                id="gasto-pago"
                type="date"
                value={form.pagoEm}
                onChange={(e) => setForm({ ...form, pagoEm: e.target.value })}
                className="min-h-11"
              />
              <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
                Em branco = ainda não foi pago. É o que separa conta a pagar de conta paga.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gasto-vence">Vence em (opcional)</Label>
              <Input
                id="gasto-vence"
                type="date"
                value={form.venceEm}
                onChange={(e) => setForm({ ...form, venceEm: e.target.value })}
                className="min-h-11"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gasto-categoria">Categoria (opcional)</Label>
              <Input
                id="gasto-categoria"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gasto-forma">Forma de pagamento (opcional)</Label>
              <Input
                id="gasto-forma"
                value={form.formaDePagamento}
                onChange={(e) => setForm({ ...form, formaDePagamento: e.target.value })}
                className="min-h-11"
              />
            </div>
          </div>

          {ehAcervo && (
            <div
              className="grid gap-4 rounded-md border p-3"
              style={{ borderColor: "var(--fin-gold)", background: "var(--fin-gold-pale)" }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="gasto-vida">Vida útil em meses (opcional)</Label>
                  <Input
                    id="gasto-vida"
                    type="number"
                    min="1"
                    value={form.vidaUtilMeses}
                    onChange={(e) => setForm({ ...form, vidaUtilMeses: e.target.value })}
                    className="min-h-11"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="gasto-residual">Valor residual (opcional)</Label>
                  <Input
                    id="gasto-residual"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valorResidual}
                    onChange={(e) => setForm({ ...form, valorResidual: e.target.value })}
                    className="min-h-11"
                  />
                </div>
              </div>
              <AvisoDeDepreciacao />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="gasto-obs">Observação (opcional)</Label>
            <Textarea
              id="gasto-obs"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending} className="min-h-11">
            {salvar.isPending ? "Salvando…" : editando ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
