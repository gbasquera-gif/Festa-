import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pareceProLabore, type NaturezaDoGasto } from "@festae/shared";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import { FormularioDeGasto, type Gasto } from "./FormularioDeGasto";
import { Indicador, Natureza, Rotulo } from "./pecas";
import { dia, nomeDoMes } from "./formato";
import { useFormato } from "@/lib/privacidade";

/**
 * Despesas e Aportes são esta mesma tela, com filtro diferente.
 *
 * Separá-las em duas entidades foi o que quebrou o painel antigo: o cálculo
 * de despesa lia só uma das abas, então balão comprado como "aporte" sumia do
 * resultado e inflava o capital investido. Aqui é uma tabela só, e a natureza
 * é um campo que o cálculo lê.
 */
export function Gastos({
  mes,
  naturezas,
  titulo,
  explicacao,
}: {
  /** Filtro global da tela. `null` = todos os meses. */
  mes: string | null;
  naturezas: readonly NaturezaDoGasto[];
  titulo: string;
  explicacao: string;
}) {
  const { brl, numero } = useFormato();
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
  // Despesas: o que entra no Resultado Operacional e o pró-labore, à parte.
  const comProLabore = naturezas.includes("PRO_LABORE");
  const somaDe = (lista: Gasto[]) => Math.round(lista.reduce((t, g) => t + Number(g.valor) * 100, 0)) / 100;
  const doResultado = somaDe(lancamentos.filter((g) => g.natureza === "CONSUMO" || g.natureza === "CUSTEIO"));
  const proLabore = somaDe(lancamentos.filter((g) => g.natureza === "PRO_LABORE"));
  // Lançamentos antigos de consumo/custeio que dizem "pró-labore": só aviso.
  // Reclassificar é decisão da gestão — muda o Resultado Operacional do mês.
  const proLaboreForaDaNatureza = comProLabore
    ? lancamentos.filter((g) => (g.natureza === "CONSUMO" || g.natureza === "CUSTEIO") && pareceProLabore(g.descricao, g.categoria))
    : [];

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

      {comProLabore && lancamentos.length > 0 && (
        <p className="text-xs" style={{ color: "var(--fin-muted)" }} data-separacao-pro-labore>
          Consumo + custeio (entram no Resultado Operacional): <strong>{brl(doResultado)}</strong> · Pró-labore (despesa com os
          sócios, fora do Resultado Operacional): <strong>{brl(proLabore)}</strong>
        </p>
      )}
      {proLaboreForaDaNatureza.length > 0 && (
        <div className="fin-cartao text-sm" style={{ borderColor: "var(--fin-coral)" }} data-pro-labore-fora-da-natureza>
          <p style={{ color: "var(--fin-navy-ink)" }}>
            {proLaboreForaDaNatureza.length === 1 ? "Um lançamento" : `${proLaboreForaDaNatureza.length} lançamentos`} de
            consumo/custeio parece{proLaboreForaDaNatureza.length === 1 ? "" : "m"} pró-labore. Se for{proLaboreForaDaNatureza.length === 1 ? "" : "em"},
            edite e escolha a natureza “Pró-labore” — o Resultado Operacional daquele mês muda, por isso a decisão é da gestão.
          </p>
          <ul className="mt-1 grid gap-0.5 text-xs" style={{ color: "var(--fin-muted)" }}>
            {proLaboreForaDaNatureza.slice(0, 5).map((g) => (
              <li key={g.id}>
                {g.descricao} · {brl(Number(g.valor))}
              </li>
            ))}
          </ul>
        </div>
      )}

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
