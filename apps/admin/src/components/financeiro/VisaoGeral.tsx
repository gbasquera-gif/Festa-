import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { api, baixarArquivo } from "@/lib/api";
import { Barra, Indicador, NumeroEscuro, Rotulo } from "./pecas";
import { brl, nomeDoMes, pct } from "./formato";
import { DetalheDoIndicador, type TipoDeDetalhe } from "./DetalheDoIndicador";
import type { Panorama } from "./panorama";

/**
 * A leitura executiva do mês.
 *
 * A pergunta que a tela responde em poucos segundos é uma sequência:
 * faturou, gastou, sobrou, com que margem. Por isso os quatro números
 * principais ficam juntos no bloco escuro, na ordem da conta, e tudo o mais
 * vem depois em hierarquia menor. Um dashboard que trata quinze indicadores
 * como igualmente importantes não tem nenhum importante.
 *
 * O resultado se chama operacional, e não líquido: não há impostos,
 * pró-labore nem depreciação nesta conta.
 */
export function VisaoGeral({ ano, mes }: { ano: number; mes: string }) {
  const [detalhe, setDetalhe] = useState<{ tipo: TipoDeDetalhe; escopo: "MES" | "ANO" } | null>(null);
  const { data, isLoading, error } = useQuery<Panorama>({
    queryKey: ["financeiro", "panorama", ano, mes],
    queryFn: () => api(`/financeiro/panorama?ano=${ano}&mes=${mes}`),
  });

  if (isLoading) return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Apurando…</p>;
  if (error || !data) return <p className="text-sm text-destructive">Não foi possível apurar este mês.</p>;

  const { operacional: op, ytd, meta, comparacao: cmp } = data;
  const seta = (v: number) => (v > 0 ? "▲" : v < 0 ? "▼" : "—");

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <BotaoDoRelatorio ano={ano} mes={mes} />
      </div>
      {/* Faturou -> gastou -> sobrou -> margem. A conta, na ordem da conta. */}
      <div className="fin-bloco-escuro">
        <p className="fin-rotulo">Resultado operacional · {nomeDoMes(mes)} · por competência</p>
        <div className="fin-grade mt-4">
          <NumeroEscuro rotulo="Faturamento bruto" valor={brl(op.faturamento)}
            nota={`${data.festasNoMes} festa${data.festasNoMes === 1 ? "" : "s"} no mês`}
            aoAbrir={() => setDetalhe({ tipo: "FATURAMENTO", escopo: "MES" })} />
          <NumeroEscuro rotulo="Despesas" valor={brl(op.despesas)} nota="consumo e custeio" />
          <NumeroEscuro rotulo="Resultado operacional" valor={brl(op.resultado)}
            nota="faturamento − despesas"
            destaque={op.resultado < 0 ? "alerta" : "bom"} />
          <NumeroEscuro rotulo="Margem operacional" valor={pct(op.margem)}
            nota={op.margem === null ? "sem faturamento no mês" : "do faturamento"} />
        </div>
        <p className="mt-4 text-xs text-white/60">
          Resultado operacional é faturamento menos consumo e custeio. Acervo não entra: é
          investimento, não despesa do mês. Não considera impostos, pró-labore nem depreciação —
          por isso não se chama lucro líquido.
        </p>
      </div>

      {/* Meta: só existe quando foi definida. */}
      {meta ? (
        <div className="fin-cartao">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Rotulo>Meta de resultado · {nomeDoMes(mes)}</Rotulo>
            <span className="text-sm" style={{ color: "var(--fin-muted)" }}>
              {brl(meta.realizado)} de {brl(meta.valor)}
            </span>
          </div>
          <div className="mt-3" style={{ background: "var(--fin-navy)", borderRadius: 999, padding: 3 }}>
            <Barra preenchido={meta.percentual ?? 0} marca={meta.percentualDoMes} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 text-xs"
               style={{ color: "var(--fin-muted)" }}>
            <span>
              <strong style={{ color: "var(--fin-navy-ink)" }}>{pct(meta.percentual)}</strong> da meta
              {" · "}o mês está {pct(meta.percentualDoMes)} completo
            </span>
            <span>
              {meta.gap > 0
                ? <>faltam <strong style={{ color: "var(--fin-coral-dark)" }}>{brl(meta.gap)}</strong>
                    {meta.porDia !== null ? ` — ${brl(meta.porDia)} por dia` : ""}</>
                : <strong style={{ color: "var(--fin-good)" }}>meta batida</strong>}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
          Nenhuma meta definida para {nomeDoMes(mes)}.
        </p>
      )}

      {/* Acumulado do ano e o que falta entrar. Hierarquia secundária. */}
      <div>
        <Rotulo>Acumulado do ano · janeiro a {nomeDoMes(mes)}</Rotulo>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador rotulo="Faturamento no ano" valor={brl(ytd.faturamento)}
            nota={`${ytd.mesesComDados} ${ytd.mesesComDados === 1 ? "mês" : "meses"} com movimento`}
            aoAbrir={() => setDetalhe({ tipo: "FATURAMENTO", escopo: "ANO" })} />
          <Indicador rotulo="Resultado no ano" valor={brl(ytd.resultado)}
            nota={ytd.margem === null ? "sem faturamento" : `margem de ${pct(ytd.margem)}`}
            tom={ytd.resultado < 0 ? "alerta" : "normal"} />
          <Indicador rotulo="A receber" valor={brl(data.aReceber)}
            nota="saldo aberto de todos os contratos vigentes"
            aoAbrir={() => setDetalhe({ tipo: "A_RECEBER", escopo: "MES" })} />
          <Indicador rotulo="Acervo acumulado" valor={brl(data.acervoAcumulado)}
            nota="investimento, fora do resultado" tom="acervo" />
        </div>
      </div>

      {/* Comparação com o mês anterior. */}
      <div className="fin-cartao">
        <Rotulo>Contra {nomeDoMes(cmp.mesAnterior)}</Rotulo>
        {cmp.temBase ? (
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {([["Faturamento", cmp.faturamento], ["Resultado operacional", cmp.resultado]] as const).map(
              ([rotulo, v]) => (
                <div key={rotulo} className="flex items-baseline justify-between gap-3">
                  <span className="text-sm" style={{ color: "var(--fin-muted)" }}>{rotulo}</span>
                  <span className="fin-numero" style={{
                    fontSize: "0.95rem",
                    color: v.absoluta > 0 ? "var(--fin-good)"
                         : v.absoluta < 0 ? "var(--fin-bad)" : "var(--fin-muted)",
                  }}>
                    {seta(v.absoluta)} {brl(Math.abs(v.absoluta))}
                    {v.percentual !== null && (
                      <span style={{ opacity: 0.75 }}> ({pct(Math.abs(v.percentual), 0)})</span>
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm" style={{ color: "var(--fin-muted)" }}>
            {nomeDoMes(cmp.mesAnterior)} não teve movimento — não há base de comparação.
          </p>
        )}
      </div>

      {data.recebidoSemData > 0 && (
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          {brl(data.recebidoSemData)} foram recebidos sem data conhecida, herança do painel antigo.
          Contam no recebido e abatem o saldo, mas não entram no caixa de mês nenhum.
        </p>
      )}

      {detalhe && (
        <DetalheDoIndicador
          tipo={detalhe.tipo}
          escopo={detalhe.escopo}
          mes={mes}
          aoFechar={() => setDetalhe(null)}
        />
      )}
    </div>
  );
}

/**
 * O Relatório Executivo em PDF do mesmo período do filtro.
 *
 * O servidor desenha o PDF a partir dos mesmos números desta tela; aqui só
 * se pede e se entrega o arquivo. Nada fica salvo em lugar nenhum.
 */
function BotaoDoRelatorio({ ano, mes }: { ano: number; mes: string }) {
  const [gerando, setGerando] = useState(false);
  async function gerar() {
    setGerando(true);
    try {
      await baixarArquivo(
        `/financeiro/relatorio.pdf?ano=${ano}&mes=${mes}`,
        `Festae-Relatorio-Financeiro-${mes}.pdf`,
      );
    } catch {
      toast.error("Não foi possível gerar o relatório. Tente de novo em instantes.");
    } finally {
      setGerando(false);
    }
  }
  return (
    <button
      type="button"
      onClick={gerar}
      disabled={gerando}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--fin-line)", color: "var(--fin-navy-ink)", background: "var(--fin-paper)" }}
    >
      <FileDown className="size-4" aria-hidden />
      {gerando ? "Gerando relatório…" : "Relatório executivo (PDF)"}
    </button>
  );
}
