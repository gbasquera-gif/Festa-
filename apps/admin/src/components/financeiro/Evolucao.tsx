import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Rotulo } from "./pecas";
import { brl, nomeDoMes, numero, pct } from "./formato";
import { GraficoAcumulado, GraficoDoAno, Legenda } from "./graficos";
import type { Panorama } from "./panorama";

/**
 * A trajetória do ano.
 *
 * Mês futuro aparece tracejado e com o ponto vazado. A festa de outubro
 * pertence a outubro por competência e o número é real — mas é contratado,
 * não realizado. Desenhá-lo igual ao passado diria que já faturamos o que
 * ainda vamos entregar.
 *
 * Mês sem movimento não vira zero no gráfico: a linha simplesmente não passa
 * por ele. Zero num mês que ainda não aconteceu desenha uma queda que nunca
 * existiu.
 */
export function Evolucao({ ano, mes }: { ano: number; mes: string }) {
  const { data, isLoading, error } = useQuery<Panorama>({
    queryKey: ["financeiro", "panorama", ano, mes],
    queryFn: () => api(`/financeiro/panorama?ano=${ano}&mes=${mes}`),
  });

  if (isLoading) return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Apurando…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Não foi possível apurar este ano.</p>;

  const comDados = data.serie.filter((p) => p.temDados);
  const temFuturo = comDados.some((p) => p.futuro);

  if (comDados.length === 0) {
    return (
      <div className="fin-cartao text-center">
        <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
          {ano} ainda não tem movimento registrado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Evolução de {ano}
        </h2>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
          Faturamento por competência — a festa pertence ao mês em que acontece — contra o
          resultado operacional do mesmo mês.
        </p>
      </div>

      <div className="fin-cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Rotulo>Faturamento × resultado operacional</Rotulo>
          <Legenda itens={[
            { cor: "var(--fin-navy)", rotulo: "Faturamento" },
            { cor: "var(--fin-gold)", rotulo: "Resultado operacional" },
            { cor: "var(--fin-coral)", rotulo: "Despesas" },
            ...(temFuturo ? [{ cor: "var(--fin-navy)", rotulo: "Contratado, festa ainda não aconteceu", tracejado: true }] : []),
          ]} />
        </div>
        <div className="mt-3">
          <GraficoDoAno serie={data.serie} mesSelecionado={mes} />
        </div>
      </div>

      <div className="fin-cartao">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <Rotulo>Faturamento acumulado no ano</Rotulo>
          <span className="fin-numero" style={{ fontSize: "1.05rem" }}>
            {brl(data.ytd.faturamento)}
            <span className="ml-2 text-xs font-normal" style={{ color: "var(--fin-muted)" }}>
              até {nomeDoMes(mes)}
              {temFuturo ? " · o tracejado é festa contratada, ainda não realizada" : ""}
            </span>
          </span>
        </div>
        <div className="mt-3">
          <GraficoAcumulado serie={data.serie} />
        </div>
      </div>

      <div className="fin-cartao overflow-x-auto p-0">
        <table className="fin-tabela">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Faturamento</th>
              <th className="num">Despesas</th>
              <th className="num">Resultado</th>
              <th className="num">Margem</th>
              <th className="num">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {comDados.map((p) => (
              <tr key={p.mes} style={p.mes === mes ? { background: "var(--fin-cream)" } : undefined}>
                <td style={{ color: "var(--fin-navy-ink)" }}>
                  {nomeDoMes(p.mes)}
                  {p.futuro && (
                    <span className="ml-2 fin-rotulo" style={{ fontSize: "0.56rem", opacity: 0.7 }}
                          title="Festa contratada que ainda não aconteceu">
                      contratado
                    </span>
                  )}
                </td>
                <td className="num">{numero(p.faturamento)}</td>
                <td className="num">{numero(p.despesas)}</td>
                <td className="num" style={{ color: p.resultado < 0 ? "var(--fin-bad)" : undefined }}>
                  {numero(p.resultado)}
                </td>
                <td className="num" style={{ color: "var(--fin-muted)" }}>{pct(p.margem, 0)}</td>
                <td className="num" style={{ color: "var(--fin-muted)" }}>
                  {numero(p.acumuladoFaturamento)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Rotulo>Mês sem movimento não vira zero — a linha não passa por ele</Rotulo>
      </div>
    </div>
  );
}
