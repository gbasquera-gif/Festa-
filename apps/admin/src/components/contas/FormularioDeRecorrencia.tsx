import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AJUSTES_DE_DIA_INEXISTENTE,
  AJUSTE_DE_DIA_INEXISTENTE_LABEL,
  AJUSTES_DE_DIA_NAO_UTIL,
  AJUSTE_DE_DIA_NAO_UTIL_LABEL,
  INTERVALOS_DA_RECORRENCIA,
  INTERVALO_DA_RECORRENCIA_LABEL,
  NATUREZAS_DO_GASTO,
  NATUREZA_LABEL,
  diaEmChapeco,
  pareceProLabore,
  proximosVencimentos,
  type AjusteDeDiaInexistente,
  type AjusteDeDiaNaoUtil,
  type IntervaloDaRecorrencia,
  type NaturezaDoGasto,
  type TipoDeValor,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { novaChave } from "@/lib/chave";
import { dia } from "@/components/financeiro/formato";
import type { Recorrencia, ResumoDaGeracao } from "./tipos";

const NOTA_DA_NATUREZA: Record<NaturezaDoGasto, string> = {
  CUSTEIO: "Mantém a empresa de pé (aluguel, internet, contador). Despesa do mês em que for paga.",
  CONSUMO: "Some na festa. Despesa do mês em que for paga.",
  ACERVO: "Vira patrimônio (compra parcelada de peça). Não é despesa do mês.",
  PRO_LABORE: "Remuneração pelo trabalho dos sócios. Despesa fora do Resultado Operacional.",
};

/** Cadastro devolve geração e meses anteriores; edição, quantas contas mudaram. */
type RespostaDoSalvar = { contasAfetadas?: number; geracao?: ResumoDaGeracao | null; retroativas?: unknown[] };

type Campos = {
  descricao: string;
  natureza: NaturezaDoGasto | "";
  categoria: string;
  fornecedor: string;
  tipoDeValor: TipoDeValor;
  valorPrevisto: string;
  intervaloMeses: IntervaloDaRecorrencia;
  diaDoVencimento: string;
  dataInicial: string;
  dataFinal: string;
  ajusteDiaInexistente: AjusteDeDiaInexistente;
  ajusteDiaNaoUtil: AjusteDeDiaNaoUtil;
};

const vazio = (hoje: string): Campos => ({
  descricao: "",
  natureza: "",
  categoria: "",
  fornecedor: "",
  tipoDeValor: "FIXO",
  valorPrevisto: "",
  intervaloMeses: 1,
  diaDoVencimento: "",
  dataInicial: hoje,
  dataFinal: "",
  ajusteDiaInexistente: "ULTIMO_DIA_DO_MES",
  ajusteDiaNaoUtil: "MANTER",
});

/**
 * Cadastro e edição de despesa recorrente.
 *
 * Mostra, enquanto se digita, os próximos vencimentos — calculados pela mesma
 * regra que o servidor usa (@festae/shared). Na edição, frequência e data
 * inicial ficam travadas: mudar a cadência reescreveria quais meses existem.
 */
export function FormularioDeRecorrencia({
  aberto,
  recorrencia,
  aoFechar,
}: {
  aberto: boolean;
  /** Nula = cadastro novo. */
  recorrencia: Recorrencia | null;
  aoFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const hoje = diaEmChapeco(new Date());
  const editando = recorrencia !== null;
  const [form, setForm] = useState<Campos>(() => vazio(hoje));
  const [chave, setChave] = useState(novaChave);

  useEffect(() => {
    if (!aberto) return;
    setChave(novaChave());
    setForm(
      recorrencia
        ? {
            descricao: recorrencia.descricao,
            natureza: recorrencia.natureza,
            categoria: recorrencia.categoria ?? "",
            fornecedor: recorrencia.fornecedor ?? "",
            tipoDeValor: recorrencia.tipoDeValor,
            valorPrevisto: String(recorrencia.valorPrevisto),
            intervaloMeses: recorrencia.intervaloMeses as IntervaloDaRecorrencia,
            diaDoVencimento: String(recorrencia.diaDoVencimento),
            dataInicial: recorrencia.dataInicial,
            dataFinal: recorrencia.dataFinal ?? "",
            ajusteDiaInexistente: recorrencia.ajusteDiaInexistente,
            ajusteDiaNaoUtil: recorrencia.ajusteDiaNaoUtil,
          }
        : vazio(hoje),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, recorrencia?.id]);

  const diaNumero = Number(form.diaDoVencimento);
  const diaValido = Number.isInteger(diaNumero) && diaNumero >= 1 && diaNumero <= 31;
  const datasValidas =
    /^\d{4}-\d{2}-\d{2}$/.test(form.dataInicial) && (form.dataFinal === "" || form.dataFinal >= form.dataInicial);

  const previa = useMemo(() => {
    if (!diaValido || !datasValidas) return [];
    return proximosVencimentos(
      {
        diaDoVencimento: diaNumero,
        intervaloMeses: form.intervaloMeses,
        dataInicial: form.dataInicial,
        dataFinal: form.dataFinal || null,
        ajusteDiaInexistente: form.ajusteDiaInexistente,
        ajusteDiaNaoUtil: form.ajusteDiaNaoUtil,
      },
      form.dataInicial > hoje ? form.dataInicial : hoje,
      4,
    );
  }, [diaValido, datasValidas, diaNumero, form, hoje]);

  const salvar = useMutation({
    mutationFn: () => {
      const comum = {
        descricao: form.descricao.trim(),
        natureza: form.natureza,
        categoria: form.categoria.trim() || null,
        fornecedor: form.fornecedor.trim() || null,
        tipoDeValor: form.tipoDeValor,
        valorPrevisto: Number(form.valorPrevisto),
        diaDoVencimento: diaNumero,
        dataFinal: form.dataFinal || null,
        ajusteDiaInexistente: form.ajusteDiaInexistente,
        ajusteDiaNaoUtil: form.ajusteDiaNaoUtil,
      };
      return editando
        ? api<RespostaDoSalvar>(`/financeiro/recorrencias/${recorrencia!.id}`, {
            method: "PATCH",
            body: JSON.stringify(comum),
          })
        : api<RespostaDoSalvar>("/financeiro/recorrencias", {
            method: "POST",
            body: JSON.stringify({ ...comum, intervaloMeses: form.intervaloMeses, dataInicial: form.dataInicial, chave }),
          });
    },
    onSuccess: (resposta) => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      if (editando) {
        const n = resposta.contasAfetadas ?? 0;
        toast.success(n > 0 ? `Despesa atualizada. ${n} conta(s) em aberto acompanharam a mudança.` : "Despesa atualizada.");
      } else {
        const partes = [`${resposta.geracao?.geradas ?? 0} conta(s) gerada(s)`];
        if (resposta.geracao?.conferenciasAbertas) partes.push(`${resposta.geracao.conferenciasAbertas} para conferir`);
        const retro = resposta.retroativas?.length ?? 0;
        if (retro) partes.push(`${retro} mês(es) anterior(es) disponível(is)`);
        toast.success(`Despesa cadastrada: ${partes.join(" · ")}.`);
      }
      aoFechar();
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const podeSalvar =
    form.descricao.trim().length >= 2 && form.natureza !== "" && Number(form.valorPrevisto) > 0 && diaValido && datasValidas;
  const set = <K extends keyof Campos>(campo: K, valor: Campos[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="financeiro max-h-[90vh] overflow-y-auto sm:max-w-[600px]" data-formulario-recorrencia>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar despesa recorrente" : "Nova despesa recorrente"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "Vale para as contas em aberto que vencem de hoje em diante e ainda estão como foram geradas. Contas pagas, vencidas e ajustes feitos à mão não mudam."
              : "Cada mês vira uma conta a pagar. Nada é pago sozinho: a conta só sai do aberto quando o pagamento for registrado."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="rec-descricao">Descrição</Label>
            <Input
              id="rec-descricao"
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="Aluguel do galpão, internet, contador…"
              className="min-h-11"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rec-natureza">Natureza</Label>
              <select
                id="rec-natureza"
                value={form.natureza}
                onChange={(e) => set("natureza", e.target.value as NaturezaDoGasto)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Escolha…</option>
                {NATUREZAS_DO_GASTO.map((n) => (
                  <option key={n} value={n}>
                    {NATUREZA_LABEL[n]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-categoria">Categoria (opcional)</Label>
              <Input id="rec-categoria" value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className="min-h-11" />
            </div>
          </div>
          {form.natureza && (
            <p className="-mt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
              {NOTA_DA_NATUREZA[form.natureza]}
            </p>
          )}
          {form.natureza !== "" && form.natureza !== "PRO_LABORE" && pareceProLabore(form.descricao, form.categoria) && (
            <p className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: "var(--fin-coral)" }}>
              Parece pró-labore. Escolha a natureza “Pró-labore”: como consumo ou custeio ele entraria no Resultado Operacional.
              O sistema não aceita salvar assim.
            </p>
          )}

          <div className="grid gap-2">
            <Label htmlFor="rec-fornecedor">Fornecedor (opcional)</Label>
            <Input id="rec-fornecedor" value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className="min-h-11" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Valor</legend>
              <div className="flex flex-wrap gap-2">
                {(["FIXO", "VARIAVEL"] as const).map((t) => (
                  <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
                    <input type="radio" name="rec-tipo" checked={form.tipoDeValor === t} onChange={() => set("tipoDeValor", t)} className="size-4" />
                    {t === "FIXO" ? "Fixo" : "Variável"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-2">
              <Label htmlFor="rec-valor">{form.tipoDeValor === "FIXO" ? "Valor mensal" : "Valor estimado"}</Label>
              <Input
                id="rec-valor"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.valorPrevisto}
                onChange={(e) => set("valorPrevisto", e.target.value)}
                className="min-h-11"
              />
            </div>
          </div>
          {form.tipoDeValor === "VARIAVEL" && (
            <p className="-mt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
              A conta nasce com a estimativa; o valor real é o informado ao registrar o pagamento.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="rec-frequencia">Frequência</Label>
              <select
                id="rec-frequencia"
                value={form.intervaloMeses}
                disabled={editando}
                onChange={(e) => set("intervaloMeses", Number(e.target.value) as IntervaloDaRecorrencia)}
                className="h-11 rounded-md border bg-background px-3 text-sm disabled:opacity-60"
              >
                {INTERVALOS_DA_RECORRENCIA.map((i) => (
                  <option key={i} value={i}>
                    {INTERVALO_DA_RECORRENCIA_LABEL[i]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-dia">Dia do vencimento</Label>
              <Input
                id="rec-dia"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={form.diaDoVencimento}
                onChange={(e) => set("diaDoVencimento", e.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-inicio">A partir de</Label>
              <Input
                id="rec-inicio"
                type="date"
                value={form.dataInicial}
                disabled={editando}
                onChange={(e) => set("dataInicial", e.target.value)}
                className="min-h-11 disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="rec-fim">Até (opcional)</Label>
              <Input
                id="rec-fim"
                type="date"
                min={form.dataInicial}
                value={form.dataFinal}
                onChange={(e) => set("dataFinal", e.target.value)}
                className="min-h-11"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rec-nao-util">Se cair em fim de semana ou feriado</Label>
              <select
                id="rec-nao-util"
                value={form.ajusteDiaNaoUtil}
                onChange={(e) => set("ajusteDiaNaoUtil", e.target.value as AjusteDeDiaNaoUtil)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                {AJUSTES_DE_DIA_NAO_UTIL.map((a) => (
                  <option key={a} value={a}>
                    {AJUSTE_DE_DIA_NAO_UTIL_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {diaValido && diaNumero >= 29 && (
            <div className="grid gap-2">
              <Label htmlFor="rec-inexistente">Nos meses sem o dia {diaNumero}</Label>
              <select
                id="rec-inexistente"
                value={form.ajusteDiaInexistente}
                onChange={(e) => set("ajusteDiaInexistente", e.target.value as AjusteDeDiaInexistente)}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                {AJUSTES_DE_DIA_INEXISTENTE.map((a) => (
                  <option key={a} value={a}>
                    {AJUSTE_DE_DIA_INEXISTENTE_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="-mt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
            Feriados considerados: só os nacionais. Feriado municipal, estadual e ponto facultativo não são presumidos.
          </p>

          <div className="rounded-md border px-3 py-2" data-previa-vencimentos>
            <p className="fin-rotulo">Próximos vencimentos</p>
            {previa.length === 0 ? (
              <p className="mt-1 text-sm" style={{ color: "var(--fin-muted)" }}>
                Informe o dia e as datas para ver a prévia.
              </p>
            ) : (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {previa.map((o) => (
                  <li key={o.competencia} className="fin-numero text-sm">
                    {dia(`${o.vencimento}T12:00:00Z`)}
                  </li>
                ))}
              </ul>
            )}
            {!editando && form.dataInicial < hoje && (
              <p className="mt-1 text-xs" style={{ color: "var(--fin-muted)" }}>
                Meses que venceram antes de hoje não são gerados sozinhos — depois do cadastro, a tela oferece gerá-los, se
                você quiser.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!podeSalvar || salvar.isPending} className="min-h-11">
            {salvar.isPending ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
