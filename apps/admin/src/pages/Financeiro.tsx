import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { REGIME_LABEL, type Regime } from "@festae/shared";
import { Card, CardContent } from "@/components/ui/card";
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

/** Um número grande com o rótulo em cima e o regime declarado embaixo. */
function Indicador({
  rotulo,
  valor,
  regime,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: string;
  regime?: Regime;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-primary/40 bg-primary/5" : undefined}>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
        {regime && (
          <p className="mt-1 text-xs text-muted-foreground">por {REGIME_LABEL[regime]}</p>
        )}
        {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
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

export default function Financeiro() {
  const meses = mesesDisponiveis();
  const [mes, setMes] = useState(meses[0]);

  const { data, isLoading, error } = useQuery<Indicadores>({
    queryKey: ["financeiro", mes],
    queryFn: () => api(`/financeiro/indicadores?mes=${mes}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saúde financeira</h1>
          <p className="text-sm text-muted-foreground">
            Tudo abaixo é apurado das reservas e dos pagamentos. Nada é digitado duas vezes.
          </p>
        </div>
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
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Meta de lucro do mês · por competência
                </p>
                <p
                  className={`mt-2 text-3xl font-semibold tabular-nums ${
                    data.ritmo.atrasoNoRitmo < 0 ? "text-destructive" : ""
                  }`}
                >
                  {data.ritmo.atrasoNoRitmo < 0 ? "−" : "+"}
                  {brl(Math.abs(data.ritmo.atrasoNoRitmo))}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {data.ritmo.atrasoNoRitmo < 0 ? "atrás do ritmo." : "à frente do ritmo."}{" "}
                  {data.ritmo.falta > 0
                    ? `Faltam ${brl(data.ritmo.falta)} para a meta de ${brl(data.ritmo.meta)}`
                    : `Meta de ${brl(data.ritmo.meta)} batida`}
                  {data.ritmo.porDia !== null && data.ritmo.falta > 0
                    ? ` — ${brl(data.ritmo.porDia)} por dia no que resta do mês.`
                    : "."}
                </p>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, (data.ritmo.percentualAtingido ?? 0) * 100))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{pct(data.ritmo.percentualAtingido)} da meta</span>
                  <span>o mês está {pct(data.ritmo.percentualDoMes)} completo</span>
                </p>
              </CardContent>
            </Card>
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
            <Indicador rotulo="Festas no mês" valor={String(data.festasNoMes)} regime="COMPETENCIA" />
            <Indicador
              rotulo="Contratos fechados"
              valor={String(data.contratosFechados)}
              nota="assinados neste mês, a festa podendo ser em outro"
            />
            <Indicador
              rotulo="Ticket médio"
              valor={data.ticketMedio === null ? "—" : brl(data.ticketMedio)}
              regime="COMPETENCIA"
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
                destaque
              />
              <Indicador
                rotulo="Tudo que saiu"
                valor={brl(data.gastoAcumulado)}
                nota="acervo, consumo e custeio somados"
              />
              <Indicador rotulo="Recebido" valor={brl(data.recebidoAcumulado)} regime="CAIXA" />
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
