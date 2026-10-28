import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import {
  NATUREZAS_DO_GASTO,
  NATUREZA_LABEL,
  SITUACOES_DA_CONTA,
  SITUACAO_DA_CONTA_LABEL,
  diasAte,
  textoDoPrazo,
  type NaturezaDoGasto,
  type SituacaoDaConta,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useFormato } from "@/lib/privacidade";
import { Indicador, Natureza } from "@/components/financeiro/pecas";
import { dia, nomeDoMes } from "@/components/financeiro/formato";
import { Conferencias } from "./Conferencias";
import { RegistrarPagamento } from "./RegistrarPagamento";
import type { Conta, RespostaDasContas } from "./tipos";

/** A ordem de leitura: o que pede ação primeiro. */
const ORDEM: SituacaoDaConta[] = ["VENCIDA", "VENCE_HOJE", "PROXIMA", "A_VENCER", "SEM_VENCIMENTO", "PAGA"];

export function EtiquetaDaConta({ situacao }: { situacao: SituacaoDaConta }) {
  const classe: Record<SituacaoDaConta, string> = {
    VENCIDA: "vencido",
    VENCE_HOJE: "hoje",
    PROXIMA: "parcial",
    A_VENCER: "aguardando",
    SEM_VENCIMENTO: "cancelado",
    PAGA: "quitado",
  };
  const rotulo: Record<SituacaoDaConta, string> = {
    VENCIDA: "Vencida",
    VENCE_HOJE: "Vence hoje",
    PROXIMA: "Próxima",
    A_VENCER: "A vencer",
    SEM_VENCIMENTO: "Sem vencimento",
    PAGA: "Paga",
  };
  return <span className={`fin-situacao ${classe[situacao]}`}>{rotulo[situacao]}</span>;
}

function Prazo({ conta, hoje }: { conta: Conta; hoje: string }) {
  if (conta.pagoEm) {
    return (
      <span>
        pago {dia(conta.pagoEm)}
        {conta.formaDePagamento ? ` · ${conta.formaDePagamento}` : ""}
      </span>
    );
  }
  if (!conta.venceEm) return <span>sem vencimento</span>;
  const dias = diasAte(hoje, conta.venceEm);
  return (
    <span style={dias < 0 ? { color: "var(--fin-coral-dark)", fontWeight: 600 } : undefined}>
      {dia(conta.venceEm)} · {textoDoPrazo(dias)}
    </span>
  );
}

function Recorrente({ conta }: { conta: Conta }) {
  if (!conta.recorrencia) return null;
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 fin-rotulo"
      style={{ fontSize: "0.58rem" }}
      title={`Mês ${conta.competencia} da despesa recorrente`}
    >
      <Repeat className="size-3" aria-hidden />
      recorrente{conta.recorrencia.tipoDeValor === "VARIAVEL" ? " · estimado" : ""}
    </span>
  );
}

/**
 * As contas: o que venceu, o que vence hoje, o que vem nos próximos dias, o
 * que foi pago. Indicadores no alto; filtros por natureza, fornecedor e
 * situação; e a ação de registrar o pagamento.
 */
export function ListaDeContas({ mes }: { mes: string }) {
  const { brl, numero } = useFormato();
  const [natureza, setNatureza] = useState<NaturezaDoGasto | "">("");
  const [fornecedor, setFornecedor] = useState("");
  const [situacao, setSituacao] = useState<SituacaoDaConta | "">("");
  const [aPagar, setAPagar] = useState<Conta | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const parametros = new URLSearchParams({ mes });
  if (natureza) parametros.set("natureza", natureza);
  if (fornecedor) parametros.set("fornecedor", fornecedor);

  const { data, isLoading, error } = useQuery<RespostaDasContas>({
    queryKey: ["financeiro", "contas-a-pagar", mes, natureza, fornecedor],
    queryFn: () => api(`/financeiro/contas-a-pagar?${parametros.toString()}`),
  });

  const contas = (data?.contas ?? []).filter((c) => !situacao || c.situacao === situacao);
  const grupos = ORDEM.map((s) => ({ situacao: s, contas: contas.filter((c) => c.situacao === s) })).filter(
    (g) => g.contas.length > 0,
  );
  const ind = data?.indicadores;

  return (
    <div className="space-y-5" data-contas-a-pagar>
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Total em aberto"
          valor={brl(ind?.totalEmAberto ?? 0)}
          nota="tudo o que falta pagar, de qualquer mês"
        />
        <Indicador
          rotulo="Vencido"
          valor={brl(ind?.vencido ?? 0)}
          nota={(data?.contagem.VENCIDA ?? 0) > 0 ? `${data?.contagem.VENCIDA} conta(s) vencida(s)` : "nada vencido"}
          tom={(ind?.vencido ?? 0) > 0 ? "alerta" : "normal"}
        />
        <Indicador
          rotulo={`Previsto para ${nomeDoMes(mes)}`}
          valor={brl(ind?.previstoNoMes ?? 0)}
          nota={`${brl(ind?.pagoDoPrevisto ?? 0)} pago · ${brl(ind?.emAbertoDoPrevisto ?? 0)} em aberto`}
        />
      </div>

      {(data?.conferenciasPendentes ?? 0) > 0 && (
        <div className="fin-cartao flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "var(--fin-gold)" }} data-aviso-conferencia>
          <p className="text-sm" style={{ color: "var(--fin-navy-ink)" }}>
            {data!.conferenciasPendentes === 1
              ? "Um mês de despesa recorrente parece já ter sido lançado à mão."
              : `${data!.conferenciasPendentes} meses de despesa recorrente parecem já ter sido lançados à mão.`}{" "}
            Nada foi gerado até alguém conferir.
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => setConferindo(true)}>
            Conferir
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs" style={{ color: "var(--fin-muted)" }}>
          Natureza
          <select
            value={natureza}
            onChange={(e) => setNatureza(e.target.value as NaturezaDoGasto | "")}
            className="h-11 rounded-md border bg-background px-3 text-sm"
            aria-label="Filtrar por natureza"
          >
            <option value="">Todas</option>
            {NATUREZAS_DO_GASTO.map((n) => (
              <option key={n} value={n}>
                {NATUREZA_LABEL[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs" style={{ color: "var(--fin-muted)" }}>
          Fornecedor
          <select
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            className="h-11 max-w-[16rem] rounded-md border bg-background px-3 text-sm"
            aria-label="Filtrar por fornecedor"
          >
            <option value="">Todos</option>
            {(data?.fornecedores ?? []).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
        {(["", ...SITUACOES_DA_CONTA] as const).map((s) => {
          const ativo = situacao === s;
          const quantidade = s === "" ? (data?.contas.length ?? 0) : (data?.contagem[s] ?? 0);
          return (
            <button
              key={s || "todas"}
              type="button"
              onClick={() => setSituacao(s)}
              aria-pressed={ativo}
              className="min-h-11 rounded-full border px-3.5 text-sm"
              style={{
                borderColor: ativo ? "var(--fin-navy-ink)" : "var(--fin-line)",
                background: ativo ? "var(--fin-navy-ink)" : "var(--fin-paper)",
                color: ativo ? "#fff" : "var(--fin-navy-ink)",
              }}
            >
              {s === "" ? "Todas" : SITUACAO_DA_CONTA_LABEL[s]}
              <span className="ml-1.5 opacity-70">{quantidade}</span>
            </button>
          );
        })}
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Carregando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar as contas.</p>}
      {!isLoading && !error && grupos.length === 0 && (
        <div className="fin-cartao text-center">
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhuma conta {situacao ? `"${SITUACAO_DA_CONTA_LABEL[situacao].toLowerCase()}"` : ""} em {nomeDoMes(mes)}.
          </p>
        </div>
      )}

      {grupos.map((g) => {
        const total = g.contas.reduce((t, c) => t + Math.round(c.valor * 100), 0) / 100;
        return (
          <section key={g.situacao} className="space-y-2" data-grupo={g.situacao}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
                {SITUACAO_DA_CONTA_LABEL[g.situacao]}
                {g.situacao === "VENCIDA" && g.contas.some((c) => c.venceEm && c.venceEm.slice(0, 7) < mes)
                  ? " (inclui meses anteriores)"
                  : ""}
                <span className="ml-2 font-normal" style={{ color: "var(--fin-muted)" }}>
                  {g.contas.length}
                </span>
              </h3>
              <span className="fin-numero text-sm">{brl(total)}</span>
            </div>

            {/* Computador: tabela. */}
            <div className="fin-cartao hidden overflow-x-auto p-0 lg:block">
              <table className="fin-tabela">
                <thead>
                  <tr>
                    <th>Conta</th>
                    <th>Natureza</th>
                    <th>Fornecedor</th>
                    <th>Vencimento</th>
                    <th className="num">Valor</th>
                    <th aria-label="Situação" />
                    <th aria-label="Ação" />
                  </tr>
                </thead>
                <tbody>
                  {g.contas.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span style={{ color: "var(--fin-navy-ink)" }}>{c.descricao}</span>
                        <Recorrente conta={c} />
                        {c.categoria && (
                          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                            {c.categoria}
                          </span>
                        )}
                      </td>
                      <td>
                        <Natureza valor={c.natureza} />
                      </td>
                      <td style={{ color: "var(--fin-muted)" }}>{c.fornecedor ?? "—"}</td>
                      <td className="text-sm">
                        <Prazo conta={c} hoje={data!.hoje} />
                      </td>
                      <td className="num">{numero(c.valor)}</td>
                      <td>
                        <EtiquetaDaConta situacao={c.situacao} />
                      </td>
                      <td className="num">
                        {c.pagoEm === null && (
                          <Button variant="outline" className="min-h-11" onClick={() => setAPagar(c)}>
                            Registrar pagamento
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões. */}
            <div className="lg:hidden">
              {g.contas.map((c) => (
                <div key={c.id} className="fin-linha" data-conta={c.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: "var(--fin-navy-ink)" }}>
                        {c.descricao}
                      </p>
                      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
                        {c.fornecedor ?? "sem fornecedor"}
                        <Recorrente conta={c} />
                      </p>
                    </div>
                    <EtiquetaDaConta situacao={c.situacao} />
                  </div>
                  <dl>
                    <div>
                      <dt>Valor</dt>
                      <dd>{brl(c.valor)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt>{c.pagoEm ? "Pagamento" : "Vencimento"}</dt>
                      <dd className="text-[0.8rem]">
                        <Prazo conta={c} hoje={data!.hoje} />
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Natureza valor={c.natureza} />
                    {c.pagoEm === null && (
                      <Button variant="outline" className="min-h-11" onClick={() => setAPagar(c)}>
                        Registrar pagamento
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        Conta em aberto é obrigação prevista: não entra no caixa, na DRE nem no saldo disponível. Ela passa a contar no dia
        em que o pagamento é registrado, pelo valor pago.
      </p>

      <RegistrarPagamento conta={aPagar} aoFechar={() => setAPagar(null)} />
      <Conferencias aberto={conferindo} aoFechar={() => setConferindo(false)} />
    </div>
  );
}
