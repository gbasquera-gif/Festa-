import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { NaturezaDoGasto } from "@festae/shared";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { FormularioDeGasto, type Gasto } from "./FormularioDeGasto";
import { Indicador, Natureza, Rotulo } from "./pecas";
import { brl, dia, mesesRecentes, nomeDoMes, numero } from "./formato";

/**
 * Despesas e Aportes são esta mesma tela, com filtro diferente.
 *
 * Separá-las em duas entidades foi o que quebrou o painel antigo: o cálculo
 * de despesa lia só uma das abas, então balão comprado como "aporte" sumia do
 * resultado e inflava o capital investido. Aqui é uma tabela só, e a natureza
 * é um campo que o cálculo lê.
 */
export function Gastos({
  naturezas,
  titulo,
  explicacao,
}: {
  naturezas: readonly NaturezaDoGasto[];
  titulo: string;
  explicacao: string;
}) {
  const meses = mesesRecentes();
  const [mes, setMes] = useState<string>("");
  const [emEdicao, setEmEdicao] = useState<Gasto | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [aExcluir, setAExcluir] = useState<Gasto | null>(null);
  const queryClient = useQueryClient();

  const parametros = new URLSearchParams({ natureza: naturezas.join(",") });
  if (mes) parametros.set("mes", mes);

  const { data, isLoading, error } = useQuery<Gasto[]>({
    queryKey: ["financeiro", "gastos", naturezas.join(","), mes],
    queryFn: () => api(`/financeiro/gastos?${parametros.toString()}`),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => api(`/financeiro/gastos/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast.success("Lançamento excluído.");
      setAExcluir(null);
    },
    onError: (erro: Error) => toast.error(erro.message),
  });

  const lancamentos = data ?? [];
  const total = lancamentos.reduce((soma, g) => soma + Number(g.valor), 0);
  const pagos = lancamentos.filter((g) => g.pagoEm !== null);
  const emAberto = lancamentos.filter((g) => g.pagoEm === null);
  const totalEmAberto = emAberto.reduce((soma, g) => soma + Number(g.valor), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            {titulo}
          </h2>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
            {explicacao}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="fin-rotulo">Mês</span>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-sm"
              aria-label="Filtrar por mês"
            >
              <option value="">Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nomeDoMes(m)}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="min-h-11"
            onClick={() => {
              setEmEdicao(null);
              setFormAberto(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Novo lançamento
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo={mes ? `Total em ${nomeDoMes(mes)}` : "Total acumulado"}
          valor={brl(total)}
          nota={`${lancamentos.length} lançamento${lancamentos.length === 1 ? "" : "s"}`}
          tom={naturezas.length === 1 && naturezas[0] === "ACERVO" ? "acervo" : "normal"}
        />
        <Indicador rotulo="Já pago" valor={brl(total - totalEmAberto)} nota={`${pagos.length} lançamentos`} />
        <Indicador
          rotulo="Em aberto"
          valor={brl(totalEmAberto)}
          nota={emAberto.length > 0 ? `${emAberto.length} sem data de pagamento` : "nada pendente"}
          tom={totalEmAberto > 0 ? "alerta" : "normal"}
        />
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar os lançamentos.</p>}

      {!isLoading && lancamentos.length === 0 && (
        <div className="fin-cartao text-center">
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhum lançamento {mes ? `em ${nomeDoMes(mes)}` : "ainda"}.
          </p>
        </div>
      )}

      {lancamentos.length > 0 && (
        <div className="fin-cartao overflow-x-auto p-0">
          <table className="fin-tabela">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Natureza</th>
                <th>Fornecedor</th>
                <th>Pago em</th>
                <th className="num">Valor</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {lancamentos.map((g) => (
                <tr key={g.id}>
                  <td>
                    <span style={{ color: "var(--fin-navy-ink)" }}>{g.descricao}</span>
                    {g.referenciaExterna && (
                      <span
                        className="ml-2 fin-rotulo"
                        style={{ fontSize: "0.58rem", opacity: 0.6 }}
                        title="Veio da migração do painel antigo"
                      >
                        migrado
                      </span>
                    )}
                    {g.categoria && (
                      <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                        {g.categoria}
                      </span>
                    )}
                  </td>
                  <td><Natureza valor={g.natureza} /></td>
                  <td style={{ color: "var(--fin-muted)" }}>{g.fornecedor ?? "—"}</td>
                  <td>
                    {g.pagoEm ? (
                      dia(g.pagoEm)
                    ) : (
                      <span style={{ color: "var(--fin-coral-dark)" }}>
                        a pagar{g.venceEm ? ` · vence ${dia(g.venceEm)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="num">{numero(Number(g.valor))}</td>
                  <td className="num">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-label={`Editar ${g.descricao}`}
                        onClick={() => {
                          setEmEdicao(g);
                          setFormAberto(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        aria-label={`Excluir ${g.descricao}`}
                        onClick={() => setAExcluir(g)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormularioDeGasto
        aberto={formAberto}
        aoFechar={() => setFormAberto(false)}
        gasto={emEdicao}
        naturezasPermitidas={naturezas}
      />

      <AlertDialog open={aExcluir !== null} onOpenChange={(v) => !v && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aExcluir?.descricao} — {aExcluir ? brl(Number(aExcluir.valor)) : ""}.
              {aExcluir?.referenciaExterna
                ? " Este lançamento veio da migração do painel antigo; excluí-lo faz os totais deixarem de bater com o histórico."
                : ""}{" "}
              Os indicadores do mês mudam na hora, e isso não tem desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11"
              onClick={() => aExcluir && excluir.mutate(aExcluir.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-end">
        <Rotulo>
          {naturezas.length === 1
            ? "Acervo é capital, não despesa do mês"
            : "Consumo e custeio entram no resultado do mês"}
        </Rotulo>
      </div>
    </div>
  );
}
