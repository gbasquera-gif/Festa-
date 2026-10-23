import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, History, Pencil, Plus, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIAS_DA_RETIRADA,
  CATEGORIA_DA_RETIRADA_LABEL,
  CATEGORIA_DA_RETIRADA_NOTA,
  FORMAS_DA_RETIRADA,
  FORMA_DA_RETIRADA_LABEL,
  diaEmChapeco,
  type CategoriaDaRetirada,
  type FormaDaRetirada,
  type TotalPorCategoria,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, baixarArquivo } from "@/lib/api";
import { Indicador, Rotulo } from "./pecas";
import { dia, nomeDoMes } from "./formato";
import { useSaldoDeCaixa } from "./SaldoDisponivel";
import type { Panorama } from "./panorama";
import { useFormato } from "@/lib/privacidade";

type Socio = { id: string; nome: string; ativo: boolean };
type Retirada = {
  id: string;
  socioId: string;
  socio: string;
  categoria: CategoriaDaRetirada;
  valor: number;
  retiradaEm: string;
  forma: FormaDaRetirada;
  descricao: string | null;
  registradoPor: string | null;
  registradoEm: string;
  estornada: boolean;
  estornadaEm: string | null;
  estornadaPor: string | null;
  motivoDoEstorno: string | null;
};
type Resposta = {
  recorte: { ano: number; mes: string | null };
  indicadores: { mes: TotalPorCategoria | null; ano: TotalPorCategoria; historico: TotalPorCategoria };
  porSocio: { socioId: string; socio: string; mes: number; ano: number; historico: number; porCategoria: TotalPorCategoria }[];
  itens: Retirada[];
  totalDoFiltro: TotalPorCategoria;
};

/** Uma linha que diz o que cada categoria é, ao lado do número. */
const RESUMO_DA_CATEGORIA: Record<CategoriaDaRetirada, string> = {
  DISTRIBUICAO_DE_LUCROS: "destino do lucro · não é despesa",
  DEVOLUCAO_DE_APORTE: "devolução de capital · não é lucro nem despesa",
};

/** "distribuição R$ 1.000 · devolução R$ 300" — só o que não é zero. */
function porCategoria(t: TotalPorCategoria, brl: (v: number) => string): string {
  const partes = CATEGORIAS_DA_RETIRADA.filter((c) => t[c] > 0).map((c) => `${CATEGORIA_DA_RETIRADA_LABEL[c].toLowerCase()} ${brl(t[c])}`);
  return partes.length > 0 ? partes.join(" · ") : "nenhuma retirada";
}

/**
 * Retiradas dos sócios.
 *
 * Seção própria, e não uma natureza de despesa: retirada não é custo da
 * operação. Não entra em despesas nem no Resultado Operacional — aparece no
 * fluxo de caixa da Visão Geral como saída classificada. Os números desta tela
 * e os do fluxo vêm das mesmas funções.
 */
export function Retiradas({ ano, mes }: { ano: number; mes: string | null }) {
  const { brl, numero } = useFormato();
  const queryClient = useQueryClient();
  const [socioId, setSocioId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [mostrarEstornadas, setMostrarEstornadas] = useState(true);
  const [registrando, setRegistrando] = useState(false);
  const [editando, setEditando] = useState<Retirada | null>(null);
  const [estornando, setEstornando] = useState<Retirada | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Retirada | null>(null);
  const [gerindoSocios, setGerindoSocios] = useState(false);

  const filtro = new URLSearchParams({ ano: String(ano), mes: mes ? mes.slice(5) : "todos" });
  if (de) filtro.set("de", de);
  if (ate) filtro.set("ate", ate);
  if (socioId) filtro.set("socioId", socioId);
  if (categoria) filtro.set("categoria", categoria);
  if (!mostrarEstornadas) filtro.set("incluirEstornadas", "nao");

  const { data, isLoading, error } = useQuery<Resposta>({
    queryKey: ["financeiro", "retiradas", filtro.toString()],
    queryFn: () => api(`/financeiro/retiradas?${filtro.toString()}`),
  });
  const { data: socios = [] } = useQuery<Socio[]>({
    queryKey: ["financeiro", "socios"],
    queryFn: () => api("/financeiro/socios"),
  });

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ["financeiro"] });
  const periodoLivre = Boolean(de || ate);
  const { data: saldo } = useSaldoDeCaixa();
  const doMes = data?.indicadores.mes ?? null;
  // O controle da distribuição vem do panorama: Resultado Operacional (a mesma
  // conta da Visão Geral) menos o pró-labore, diante do distribuído no ano.
  const hojeIso = diaEmChapeco(new Date());
  const mesDoControle = mes ?? (String(ano) === hojeIso.slice(0, 4) ? hojeIso.slice(0, 7) : `${ano}-12`);
  const { data: panorama } = useQuery<Panorama>({
    queryKey: ["financeiro", "panorama", ano, mesDoControle],
    queryFn: () => api(`/financeiro/panorama?ano=${ano}&mes=${mesDoControle}`),
  });
  const controle = panorama?.distribuicao?.ano;
  const recorte = doMes ?? data?.indicadores.ano ?? null;
  const rotuloDoRecorte = doMes && mes ? nomeDoMes(mes) : String(ano);

  return (
    <div className="space-y-5" data-retiradas>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            Retiradas dos sócios
          </h2>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
            Distribuição de lucros e devolução de aporte: dinheiro que saiu da Festaê para os sócios como capital.
            Reduz o saldo disponível, mas não é despesa: não muda faturamento, despesas nem o Resultado Operacional.
            Pró-labore não entra aqui — é despesa, lançada em Despesas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" className="min-h-11" onClick={() => setGerindoSocios(true)}>
            <Users className="mr-1 h-4 w-4" /> Sócios
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() =>
              baixarArquivo(`/financeiro/retiradas.csv?${filtro.toString()}`, "retiradas-dos-socios.csv").catch((e: Error) =>
                toast.error(e.message),
              )
            }
          >
            <FileDown className="mr-1 h-4 w-4" /> Exportar CSV
          </Button>
          <Button className="min-h-11" onClick={() => setRegistrando(true)} data-registrar-retirada>
            <Plus className="mr-1 h-4 w-4" /> Registrar retirada
          </Button>
        </div>
      </div>

      {/* Os totais respondem "quanto saiu": não mudam com a busca da lista.
          A distribuição de lucros vem diante do resultado que havia para
          distribuir — o Resultado Operacional menos o pró-labore. */}
      <div className="grid gap-3 sm:grid-cols-3" data-indicadores-retiradas>
        <Indicador
          rotulo={`Distribuição de lucros · ${rotuloDoRecorte}`}
          valor={recorte ? brl(recorte.DISTRIBUICAO_DE_LUCROS) : "—"}
          nota={data ? `${doMes ? `${ano}: ${brl(data.indicadores.ano.DISTRIBUICAO_DE_LUCROS)} · ` : ""}histórico: ${brl(data.indicadores.historico.DISTRIBUICAO_DE_LUCROS)}` : undefined}
        />
        <Indicador
          rotulo={`Resultado gerencial após pró-labore · ${ano}`}
          valor={controle ? brl(controle.resultadoAposProLabore) : "—"}
          tom={controle && controle.distribuidoAcima > 0 ? "alerta" : "normal"}
          nota={
            controle ? (
              <span data-nota-gerencial>
                {controle.distribuidoAcima > 0
                  ? `Distribuído ${brl(controle.distribuido)} — ${brl(controle.distribuidoAcima)} acima deste resultado. `
                  : `Resultado Operacional ${brl(controle.resultadoOperacional)} − pró-labore ${brl(controle.proLabore)} · distribuído ${brl(controle.distribuido)}. `}
                Indicador gerencial: não é lucro contábil nem valor disponível para distribuir — confirme com a contabilidade e o saldo.
              </span>
            ) : undefined
          }
        />
        <Indicador
          rotulo="Saldo disponível hoje (calculado)"
          valor={saldo?.saldo != null ? brl(saldo.saldo) : "—"}
          tom={saldo?.saldo != null && saldo.saldo < 0 ? "alerta" : "normal"}
          nota={
            saldo?.referencia
              ? `saldo inicial de ${dia(saldo.referencia.dia)} + entradas − saídas · depende da conciliação com o extrato`
              : "informe o saldo da conta na Visão Geral"
          }
        />
      </div>

      {data && (
        <div className="fin-cartao overflow-x-auto p-0" data-por-categoria>
          <div className="px-4 pt-4">
            <Rotulo>Por categoria</Rotulo>
          </div>
          <table className="fin-tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">{mes ? nomeDoMes(mes) : "Mês"}</th>
                <th className="num">{ano}</th>
                <th className="num">Histórico</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIAS_DA_RETIRADA.map((c) => (
                <tr key={c} data-categoria={c}>
                  <td style={c === "DISTRIBUICAO_DE_LUCROS" ? { color: "var(--fin-navy-ink)", fontWeight: 600 } : undefined}>
                    {CATEGORIA_DA_RETIRADA_LABEL[c]}
                    <span className="block text-xs font-normal" style={{ color: "var(--fin-muted)" }}>
                      {RESUMO_DA_CATEGORIA[c]}
                    </span>
                  </td>
                  <td className="num">{data.indicadores.mes ? numero(data.indicadores.mes[c]) : "—"}</td>
                  <td className="num">{numero(data.indicadores.ano[c])}</td>
                  <td className="num">{numero(data.indicadores.historico[c])}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total saído para os sócios</td>
                <td className="num">{data.indicadores.mes ? brl(data.indicadores.mes.total) : "—"}</td>
                <td className="num">{brl(data.indicadores.ano.total)}</td>
                <td className="num">{brl(data.indicadores.historico.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}


      {data && data.porSocio.length > 0 && (
        <div className="fin-cartao overflow-x-auto p-0" data-por-socio>
          <div className="px-4 pt-4">
            <Rotulo>Por sócio</Rotulo>
          </div>
          <table className="fin-tabela">
            <thead>
              <tr>
                <th>Sócio</th>
                <th className="num">{mes ? nomeDoMes(mes) : "Mês"}</th>
                <th className="num">{ano}</th>
                <th className="num">Histórico</th>
              </tr>
            </thead>
            <tbody>
              {data.porSocio.map((s) => (
                <tr key={s.socioId}>
                  <td style={{ color: "var(--fin-navy-ink)" }}>
                    {s.socio}
                    <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                      {porCategoria(s.porCategoria, brl)}
                    </span>
                  </td>
                  <td className="num">{mes ? numero(s.mes) : "—"}</td>
                  <td className="num">{numero(s.ano)}</td>
                  <td className="num">{numero(s.historico)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filtros da lista. Mês e ano vêm do período global; o período livre os substitui. */}
      <div className="fin-cartao grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-filtros-retiradas>
        <div className="grid gap-1">
          <Label htmlFor="filtro-socio">Sócio</Label>
          <select id="filtro-socio" value={socioId} onChange={(e) => setSocioId(e.target.value)} className="h-11 rounded-md border bg-background px-3 text-sm">
            <option value="">Todos</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
                {s.ativo ? "" : " (inativo)"}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtro-categoria">Categoria</Label>
          <select id="filtro-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-11 rounded-md border bg-background px-3 text-sm">
            <option value="">Todas</option>
            {CATEGORIAS_DA_RETIRADA.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_DA_RETIRADA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtro-de">De</Label>
          <Input id="filtro-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="min-h-11" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="filtro-ate">Até</Label>
          <Input id="filtro-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="min-h-11" />
        </div>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={mostrarEstornadas} onChange={(e) => setMostrarEstornadas(e.target.checked)} />
          Mostrar estornadas
        </label>
        <p className="text-xs sm:col-span-2 lg:col-span-5" style={{ color: "var(--fin-muted)" }}>
          {periodoLivre
            ? `Lista de ${de ? dia(`${de}T12:00:00Z`) : "o começo"} a ${ate ? dia(`${ate}T12:00:00Z`) : "hoje"}.`
            : mes
              ? `Lista de ${nomeDoMes(mes)} (período no topo da tela).`
              : `Lista de ${ano} inteiro (período no topo da tela).`}
        </p>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar as retiradas.</p>}

      {data && data.itens.length === 0 && (
        <div className="fin-cartao text-center">
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhuma retirada nesta busca.
            {socios.length === 0 && " Cadastre os sócios em “Sócios” para começar."}
          </p>
        </div>
      )}

      {data && data.itens.length > 0 && (
        <div className="fin-cartao overflow-x-auto p-0" data-lista-retiradas>
          <table className="fin-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Sócio</th>
                <th>Categoria</th>
                <th className="num">Valor</th>
                <th>Observação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {data.itens.map((r) => (
                <tr key={r.id} data-retirada={r.estornada ? "estornada" : "valida"} style={r.estornada ? { opacity: 0.6 } : undefined}>
                  <td className="whitespace-nowrap">{dia(`${r.retiradaEm}T12:00:00Z`)}</td>
                  <td style={{ color: "var(--fin-navy-ink)" }}>{r.socio}</td>
                  <td>
                    {CATEGORIA_DA_RETIRADA_LABEL[r.categoria]}
                    <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                      {FORMA_DA_RETIRADA_LABEL[r.forma]}
                      {r.registradoPor ? ` · lançado por ${r.registradoPor}` : ""}
                    </span>
                  </td>
                  <td className="num" style={r.estornada ? { textDecoration: "line-through" } : undefined}>
                    {numero(r.valor)}
                  </td>
                  <td className="max-w-[16rem]">
                    {r.estornada ? (
                      <span className="text-xs" style={{ color: "#c4472a" }}>
                        Estornada{r.estornadaPor ? ` por ${r.estornadaPor}` : ""}: {r.motivoDoEstorno}
                      </span>
                    ) : (
                      <span className="text-sm">{r.descricao ?? "—"}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" className="min-h-9" title="Histórico de alterações" onClick={() => setHistoricoDe(r)}>
                      <History className="h-4 w-4" />
                    </Button>
                    {!r.estornada && (
                      <>
                        <Button variant="ghost" size="sm" className="min-h-9" title="Editar" onClick={() => setEditando(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="min-h-9" title="Estornar" onClick={() => setEstornando(r)} data-estornar>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total desta lista (sem as estornadas)</td>
                <td className="num">{numero(data.totalDoFiltro.total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <FormularioDeRetirada
        aberto={registrando || editando !== null}
        retirada={editando}
        socios={socios}
        aoFechar={() => {
          setRegistrando(false);
          setEditando(null);
        }}
        aoSalvar={atualizar}
        aoPedirSocio={() => setGerindoSocios(true)}
      />
      <EstornoDeRetirada retirada={estornando} aoFechar={() => setEstornando(null)} aoSalvar={atualizar} />
      <HistoricoDaRetirada retirada={historicoDe} aoFechar={() => setHistoricoDe(null)} />
      <GestaoDeSocios aberto={gerindoSocios} socios={socios} aoFechar={() => setGerindoSocios(false)} aoSalvar={atualizar} />
    </div>
  );
}

function FormularioDeRetirada({
  aberto,
  retirada,
  socios,
  aoFechar,
  aoSalvar,
  aoPedirSocio,
}: {
  aberto: boolean;
  retirada: Retirada | null;
  socios: Socio[];
  aoFechar: () => void;
  aoSalvar: () => void;
  aoPedirSocio: () => void;
}) {
  const { brl } = useFormato();
  const editando = retirada !== null;
  const hoje = diaEmChapeco(new Date());
  const [chave, setChave] = useState("");
  const { data: saldo } = useSaldoDeCaixa();
  const [form, setForm] = useState({
    socioId: "",
    categoria: "" as CategoriaDaRetirada | "",
    valor: "",
    retiradaEm: hoje,
    forma: "PIX" as FormaDaRetirada,
    descricao: "",
    justificativa: "",
  });

  useEffect(() => {
    if (!aberto) return;
    setChave(crypto.randomUUID());
    setForm(
      retirada
        ? {
            socioId: retirada.socioId,
            categoria: retirada.categoria,
            valor: String(retirada.valor),
            retiradaEm: retirada.retiradaEm,
            forma: retirada.forma,
            descricao: retirada.descricao ?? "",
            justificativa: "",
          }
        : { socioId: "", categoria: "", valor: "", retiradaEm: diaEmChapeco(new Date()), forma: "PIX", descricao: "", justificativa: "" },
    );
  }, [aberto, retirada]);

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        socioId: form.socioId,
        categoria: form.categoria,
        valor: Number(form.valor),
        retiradaEm: form.retiradaEm,
        forma: form.forma,
        descricao: form.descricao.trim() || null,
      };
      return editando
        ? api(`/financeiro/retiradas/${retirada.id}`, { method: "PATCH", body: JSON.stringify({ ...corpo, justificativa: form.justificativa.trim() }) })
        : api("/financeiro/retiradas", { method: "POST", body: JSON.stringify({ ...corpo, chave }) });
    },
    onSuccess: () => {
      aoSalvar();
      toast.success(editando ? "Retirada atualizada. A alteração ficou no histórico." : "Retirada registrada.");
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ativos = socios.filter((s) => s.ativo || s.id === form.socioId);
  const valorNumerico = Number(form.valor);
  // Quanto fica disponível depois desta retirada — só para retirada nova, a
  // partir do dia do saldo inicial (a de antes já está dentro dele).
  const saldoDepois =
    !editando && saldo?.saldo != null && saldo.referencia && valorNumerico > 0 && form.retiradaEm >= saldo.referencia.dia
      ? Math.round((saldo.saldo - valorNumerico) * 100) / 100
      : null;
  const pode =
    form.socioId !== "" &&
    form.categoria !== "" &&
    Number(form.valor) > 0 &&
    form.retiradaEm !== "" &&
    form.retiradaEm <= hoje &&
    (!editando || form.justificativa.trim().length >= 10);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvar.isPending && aoFechar()}>
      <DialogContent className="financeiro max-h-[92vh] overflow-y-auto sm:max-w-[520px]" data-formulario-retirada>
        <DialogHeader>
          <DialogTitle>{editando ? "Editar retirada" : "Registrar retirada"}</DialogTitle>
          <DialogDescription>
            {editando
              ? "A alteração exige justificativa: o valor anterior e o novo ficam no histórico."
              : "Dinheiro que saiu da Festaê para um sócio. Reduz o saldo disponível; fica fora das despesas e do Resultado Operacional."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="retirada-socio">Sócio</Label>
            {socios.length === 0 ? (
              <Button variant="outline" className="min-h-11" onClick={aoPedirSocio}>
                Cadastrar o primeiro sócio
              </Button>
            ) : (
              <select
                id="retirada-socio"
                value={form.socioId}
                onChange={(e) => setForm({ ...form, socioId: e.target.value })}
                className="h-11 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Escolha…</option>
                {ativos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="retirada-categoria">Categoria</Label>
            <select
              id="retirada-categoria"
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaDaRetirada })}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Escolha…</option>
              {CATEGORIAS_DA_RETIRADA.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_DA_RETIRADA_LABEL[c]}
                </option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "var(--fin-muted)" }} data-nota-categoria>
              {form.categoria ? CATEGORIA_DA_RETIRADA_NOTA[form.categoria] : "Cada categoria se lê diferente no financeiro: escolha a natureza da retirada."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="retirada-valor">Valor retirado</Label>
              <Input
                id="retirada-valor"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="min-h-11 text-base tabular-nums"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="retirada-data">Data da retirada</Label>
              <Input
                id="retirada-data"
                type="date"
                max={hoje}
                value={form.retiradaEm}
                onChange={(e) => setForm({ ...form, retiradaEm: e.target.value })}
                className="min-h-11"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="retirada-forma">Forma de pagamento / transferência</Label>
            <select
              id="retirada-forma"
              value={form.forma}
              onChange={(e) => setForm({ ...form, forma: e.target.value as FormaDaRetirada })}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              {FORMAS_DA_RETIRADA.map((f) => (
                <option key={f} value={f}>
                  {FORMA_DA_RETIRADA_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="retirada-descricao">Descrição ou observação (opcional)</Label>
            <Textarea id="retirada-descricao" rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          {editando && (
            <div className="grid gap-2">
              <Label htmlFor="retirada-justificativa">Justificativa da alteração (obrigatória)</Label>
              <Textarea
                id="retirada-justificativa"
                rows={2}
                value={form.justificativa}
                onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                placeholder="Ex.: valor conferido no extrato do banco."
              />
            </div>
          )}
          {saldo?.saldo != null && !editando && (
            <p className="rounded-md border px-3 py-2 text-sm tabular-nums" style={{ color: "var(--fin-navy-ink)" }} data-saldo-na-retirada>
              Saldo disponível hoje: {brl(saldo.saldo)}
              {saldoDepois !== null && (
                <>
                  {" "}→ depois desta retirada:{" "}
                  <strong style={{ color: saldoDepois < 0 ? "var(--fin-coral-dark)" : undefined }}>{brl(saldoDepois)}</strong>
                  {saldoDepois < 0 ? " (fica negativo)" : ""}
                </>
              )}
            </p>
          )}
          <p className="text-xs" style={{ color: "var(--fin-muted)" }} data-nota-pro-labore-na-retirada>
            Pró-labore não é retirada: é despesa, e se lança em Despesas com a natureza “Pró-labore”.
          </p>
          <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
            O usuário logado fica registrado como responsável pelo lançamento.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!pode || salvar.isPending} className="min-h-11" data-salvar-retirada>
            {salvar.isPending ? "Salvando…" : editando ? "Salvar alteração" : "Registrar retirada"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EstornoDeRetirada({ retirada, aoFechar, aoSalvar }: { retirada: Retirada | null; aoFechar: () => void; aoSalvar: () => void }) {
  const { brl } = useFormato();
  const [motivo, setMotivo] = useState("");
  useEffect(() => setMotivo(""), [retirada]);
  const estornar = useMutation({
    mutationFn: () => api(`/financeiro/retiradas/${retirada?.id}/estorno`, { method: "POST", body: JSON.stringify({ motivo: motivo.trim() }) }),
    onSuccess: () => {
      aoSalvar();
      toast.success("Retirada estornada. Ela continua no histórico, fora dos totais.");
      aoFechar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={retirada !== null} onOpenChange={(v) => !v && !estornar.isPending && aoFechar()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Estornar retirada</DialogTitle>
          <DialogDescription>
            {retirada
              ? `${retirada.socio} · ${CATEGORIA_DA_RETIRADA_LABEL[retirada.categoria]} · ${brl(retirada.valor)} em ${dia(`${retirada.retiradaEm}T12:00:00Z`)}. `
              : ""}
            Sai de todos os totais e continua visível, riscada, com o motivo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="estorno-motivo">Motivo (obrigatório)</Label>
          <Textarea id="estorno-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: lançada no sócio errado." />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={aoFechar} className="min-h-11">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => estornar.mutate()} disabled={motivo.trim().length < 10 || estornar.isPending} className="min-h-11">
            {estornar.isPending ? "Estornando…" : "Estornar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoDaRetirada({ retirada, aoFechar }: { retirada: Retirada | null; aoFechar: () => void }) {
  const { brl } = useFormato();
  const { data = [], isLoading } = useQuery<
    { acao: string; antes: Record<string, unknown>; depois: Record<string, unknown>; justificativa: string; usuario: string | null; criadoEm: string }[]
  >({
    queryKey: ["financeiro", "retiradas", "historico", retirada?.id],
    queryFn: () => api(`/financeiro/retiradas/${retirada?.id}/historico`),
    enabled: retirada !== null,
  });
  const valorDe = (v: unknown) => (typeof v === "number" ? brl(v) : String(v ?? "—"));
  return (
    <Dialog open={retirada !== null} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Histórico da retirada</DialogTitle>
          <DialogDescription>
            {retirada ? `Lançada por ${retirada.registradoPor ?? "—"} em ${new Date(retirada.registradoEm).toLocaleString("pt-BR")}.` : ""}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma alteração desde o lançamento.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.map((a, i) => (
              <li key={i} className="rounded-md border px-3 py-2">
                <p className="font-medium">
                  {a.acao === "ESTORNO" ? "Estorno" : "Edição"} · {a.usuario ?? "—"} · {new Date(a.criadoEm).toLocaleString("pt-BR")}
                </p>
                {a.acao === "EDICAO" &&
                  Object.keys(a.depois).map((campo) => (
                    <p key={campo} className="text-xs text-muted-foreground">
                      {campo}: {valorDe(a.antes[campo])} → {valorDe(a.depois[campo])}
                    </p>
                  ))}
                <p className="text-xs text-muted-foreground">“{a.justificativa}”</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GestaoDeSocios({ aberto, socios, aoFechar, aoSalvar }: { aberto: boolean; socios: Socio[]; aoFechar: () => void; aoSalvar: () => void }) {
  const [nome, setNome] = useState("");
  useEffect(() => setNome(""), [aberto]);
  const criar = useMutation({
    mutationFn: () => api("/financeiro/socios", { method: "POST", body: JSON.stringify({ nome: nome.trim() }) }),
    onSuccess: () => {
      aoSalvar();
      setNome("");
      toast.success("Sócio cadastrado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const alternar = useMutation({
    mutationFn: (s: Socio) => api(`/financeiro/socios/${s.id}`, { method: "PATCH", body: JSON.stringify({ ativo: !s.ativo }) }),
    onSuccess: () => aoSalvar(),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Sócios</DialogTitle>
          <DialogDescription>Quem pode receber retiradas. Desativar tira da lista de escolha sem apagar o histórico.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {socios.length === 0 && <li className="text-muted-foreground">Nenhum sócio cadastrado.</li>}
          {socios.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
              <span className={s.ativo ? "" : "text-muted-foreground"}>
                {s.nome}
                {s.ativo ? "" : " (inativo)"}
              </span>
              <Button variant="ghost" size="sm" className="min-h-9" onClick={() => alternar.mutate(s)}>
                {s.ativo ? "Desativar" : "Reativar"}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input aria-label="Nome do novo sócio" placeholder="Nome do sócio" value={nome} onChange={(e) => setNome(e.target.value)} className="min-h-11" />
          <Button onClick={() => criar.mutate()} disabled={nome.trim().length < 2 || criar.isPending} className="min-h-11">
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
