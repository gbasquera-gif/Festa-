import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { REGIME_LABEL, type Regime } from "@festae/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Barra, Indicador } from "@/components/financeiro/pecas";
import { Gastos } from "@/components/financeiro/Gastos";
import { Contratos } from "@/components/financeiro/Contratos";
import { api } from "@/lib/api";

/**
 * A saúde financeira do negócio.
 *
 * A diferença para o painel antigo não está na aparência: está em nunca
 * subtrair competência de caixa. Lá, "lucro líquido" somava contrato assinado
 * e descontava conta paga — dois regimes num número só, que em setembro/2026
 * exibia quase três vezes o resultado real. Aqui os dois regimes aparecem
 * lado a lado, cada um inteiro, cada um dizendo o que é.
 */

interface Resultado {
  regime: Regime;
  receita: number;
  despesa: number;
  resultado: number;
  margem: number | null;
}

interface Ritmo {
  meta: number;
  realizado: number;
  falta: number;
  atrasoNoRitmo: number;
  porDia: number | null;
  percentualAtingido: number | null;
  percentualDoMes: number;
}

interface Indicadores {
  mes: string;
  competencia: Resultado;
  caixa: Resultado;
  contratosFechados: number;
  festasNoMes: number;
  ticketMedio: number | null;
  acervoNoMes: number;
  acervoAcumulado: number;
  aReceber: number;
  recebidoSemData: number;
  recebidoAcumulado: number;
  gastoAcumulado: number;
  meta: number | null;
  ritmo: Ritmo | null;
}

const brl = (valor: number) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (valor: number | null) =>
  valor === null ? "—" : `${(valor * 100).toFixed(1)}%`;

/** Os últimos 18 meses, do mais recente para trás. */
function mesesDisponiveis(): string[] {
  const hoje = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function nomeDoMes(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, numero - 1, 1))
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Um regime inteiro: receita, despesa e o que sobrou. */
function BlocoDeRegime({ titulo, explicacao, dados }: { titulo: string; explicacao: string; dados: Resultado }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{explicacao}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Receita</dt>
            <dd className="tabular-nums">{brl(dados.receita)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Despesa</dt>
            <dd className="tabular-nums">− {brl(dados.despesa)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-2 font-semibold">
            <dt>Resultado</dt>
            <dd className={`tabular-nums ${dados.resultado < 0 ? "text-destructive" : ""}`}>
              {brl(dados.resultado)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Margem</dt>
            <dd className="tabular-nums text-muted-foreground">{pct(dados.margem)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

const ABAS = [
  { chave: "visao", rotulo: "Visão Geral" },
  { chave: "contratos", rotulo: "Vendas / Contratos" },
  { chave: "despesas", rotulo: "Despesas" },
  { chave: "aportes", rotulo: "Aportes / Acervo" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

export default function Financeiro() {
  const [aba, setAba] = useState<Aba>("visao");

  return (
    <div className="financeiro space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Financeiro
        </h1>
        <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
          Tudo é apurado das reservas e dos pagamentos. Nada é digitado duas vezes.
        </p>
      </div>

      <nav
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--fin-line)" }}
        aria-label="Seções do financeiro"
      >
        {ABAS.map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            aria-current={aba === chave ? "page" : undefined}
            className="min-h-11 px-4 text-sm font-semibold"
            style={{
              color: aba === chave ? "var(--fin-navy-ink)" : "var(--fin-muted)",
              borderBottom: `2px solid ${aba === chave ? "var(--fin-coral)" : "transparent"}`,
              marginBottom: "-1px",
            }}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === "visao" && <VisaoGeral />}
      {aba === "contratos" && <Contratos />}
      {aba === "despesas" && (
        <Gastos
          naturezas={["CONSUMO", "CUSTEIO"]}
          titulo="Despesas"
          explicacao="O que some na festa e o que mantém a empresa de pé. Entra no resultado do mês em que foi pago."
        />
      )}
      {aba === "aportes" && (
        <Gastos
          naturezas={["ACERVO"]}
          titulo="Aportes e acervo"
          explicacao="O que vira patrimônio alugável. É capital que fica, não despesa do mês — por isso não derruba o lucro."
        />
      )}
    </div>
  );
}

function VisaoGeral() {
  const meses = mesesDisponiveis();
  const [mes, setMes] = useState(meses[0]);

  const { data, isLoading, error } = useQuery<Indicadores>({
    queryKey: ["financeiro", mes],
    queryFn: () => api(`/financeiro/indicadores?mes=${mes}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Saúde financeira
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mês</span>
          <select
            value={mes}
            onChange={(evento) => setMes(evento.target.value)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {nomeDoMes(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Apurando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível apurar este mês.</p>}

      {data && (
        <>
          {data.ritmo && (
            <div className="fin-bloco-escuro">
              <div className="p-0">
                <p className="fin-rotulo">Meta de lucro do mês · por competência</p>
                <p
                  className="fin-numero mt-2 text-[2.1rem] leading-none"
                  style={{ color: data.ritmo.atrasoNoRitmo < 0 ? "var(--fin-gold)" : "#fff" }}
                >
                  {data.ritmo.atrasoNoRitmo < 0 ? "−" : "+"}
                  {brl(Math.abs(data.ritmo.atrasoNoRitmo))}
                </p>
                <p className="mt-2 text-sm text-white/75">
                  {data.ritmo.atrasoNoRitmo < 0 ? "atrás do ritmo." : "à frente do ritmo."}{" "}
                  {data.ritmo.falta > 0
                    ? `Faltam ${brl(data.ritmo.falta)} para a meta de ${brl(data.ritmo.meta)}`
                    : `Meta de ${brl(data.ritmo.meta)} batida`}
                  {data.ritmo.porDia !== null && data.ritmo.falta > 0
                    ? ` — ${brl(data.ritmo.porDia)} por dia no que resta do mês.`
                    : "."}
                </p>
                <div className="mt-4">
                  <Barra
                    preenchido={data.ritmo.percentualAtingido ?? 0}
                    marca={data.ritmo.percentualDoMes}
                  />
                </div>
                <p className="mt-2 flex justify-between text-xs text-white/60">
                  <span>{pct(data.ritmo.percentualAtingido)} da meta</span>
                  <span>o mês está {pct(data.ritmo.percentualDoMes)} completo</span>
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <BlocoDeRegime
              titulo="Resultado por competência"
              explicacao="A festa pertence ao mês em que acontece. Responde: este mês deu lucro?"
              dados={data.competencia}
            />
            <BlocoDeRegime
              titulo="Resultado por caixa"
              explicacao="Só o dinheiro que entrou e saiu, na data em que entrou e saiu. Responde: tenho dinheiro?"
              dados={data.caixa}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Festas no mês" valor={String(data.festasNoMes)} nota="por competência" />
            <Indicador
              rotulo="Contratos fechados"
              valor={String(data.contratosFechados)}
              nota="assinados neste mês, a festa podendo ser em outro"
            />
            <Indicador
              rotulo="Ticket médio"
              valor={data.ticketMedio === null ? "—" : brl(data.ticketMedio)}
              nota="por competência"
            />
            <Indicador rotulo="A receber" valor={brl(data.aReceber)} nota="saldo aberto de todos os contratos" />
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">Acumulado</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Indicador
                rotulo="Acervo"
                valor={brl(data.acervoAcumulado)}
                nota="o que virou patrimônio alugável"
                tom="acervo"
              />
              <Indicador
                rotulo="Tudo que saiu"
                valor={brl(data.gastoAcumulado)}
                nota="acervo, consumo e custeio somados"
              />
              <Indicador rotulo="Recebido" valor={brl(data.recebidoAcumulado)} nota="por caixa" />
              <Indicador rotulo="Acervo comprado no mês" valor={brl(data.acervoNoMes)} nota="capital, não despesa" />
            </div>
          </div>

          {data.recebidoSemData > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-4 text-sm">
                <p className="font-medium">
                  {brl(data.recebidoSemData)} entraram sem data de recebimento.
                </p>
                <p className="mt-1 text-muted-foreground">
                  Vieram do painel antigo, que guardava quanto foi pago mas nunca quando. Esse
                  valor conta no recebido acumulado e no saldo em aberto, mas não pode entrar no
                  caixa de mês nenhum — atribuir uma data inventada faria um mês qualquer parecer
                  melhor do que foi.
                </p>
              </CardContent>
            </Card>
          )}

          {data.meta === null && (
            <p className="text-sm text-muted-foreground">
              Nenhuma meta definida para {nomeDoMes(mes)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
