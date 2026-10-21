import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { api, baixarArquivo } from "@/lib/api";
import { Barra, Indicador, NumeroEscuro, Rotulo } from "./pecas";
import { brl, nomeDoMes, numero, pct } from "./formato";
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
            nota={op.retencao > 0 ? "faturamento + retenção − despesas" : "faturamento − despesas"}
            destaque={op.resultado < 0 ? "alerta" : "bom"} />
          <NumeroEscuro rotulo="Margem operacional" valor={pct(op.margem)}
            nota={op.margem === null ? "sem faturamento no mês" : op.retencao > 0 ? "da receita operacional" : "do faturamento"} />
        </div>
        {/* A retenção de cancelamento é receita operacional, mas não é
            festa: aparece em linha própria, só quando existe, e nunca dentro
            do faturamento bruto. */}
        {op.retencao > 0 && (
          <p className="mt-4 text-sm text-white/85" data-retencao>
            + <span className="fin-numero" style={{ fontSize: "0.95rem", color: "inherit" }}>{brl(op.retencao)}</span>{" "}
            de receita de retenção por cancelamento — separada do faturamento das festas, entra no resultado.
          </p>
        )}
        <p className="mt-4 text-xs text-white/60">
          Resultado operacional é faturamento
          {op.retencao > 0 ? ", mais a receita de retenção por cancelamento," : ""} menos consumo e custeio. Acervo não entra: é
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

      {/* O caixa do mês, ao lado da competência e sem se misturar com ela.
          Pagamento de reserva cancelada depois continua aqui, no dia em que
          entrou; o reembolso é a saída, no dia em que saiu. Crédito Festaê
          não aparece: gerar ou usar crédito não move dinheiro. */}
      <div>
        <Rotulo>Caixa · {nomeDoMes(mes)}</Rotulo>
        <div className="mt-2 grid gap-3 sm:grid-cols-3" data-caixa>
          <Indicador rotulo="Entradas" valor={brl(data.caixa.entradas)}
            nota="pagamentos confirmados no mês" />
          <Indicador rotulo="Reembolsos" valor={brl(data.caixa.reembolsos)}
            nota="devolvidos a clientes no mês" tom={data.caixa.reembolsos > 0 ? "alerta" : "normal"} />
          <Indicador rotulo="Caixa do mês" valor={brl(data.caixa.liquido)}
            nota="entradas − reembolsos" />
        </div>
        {(data.caixa.reembolsosARealizar ?? 0) > 0 && (
          <p className="mt-2 text-xs font-medium" style={{ color: "var(--fin-coral-dark)" }} data-reembolsos-a-realizar>
            Reembolsos a realizar: {brl(data.caixa.reembolsosARealizar ?? 0)}. Prometidos a clientes em
            cancelamentos e ainda não devolvidos — não saíram do caixa; saem no dia em que a devolução for registrada.
          </p>
        )}
        {data.creditoEmAberto > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
            Crédito Festaê em aberto das clientes: {brl(data.creditoEmAberto)}. Já entrou no caixa quando foi
            pago — não é receita nova nem dinheiro novo; vira festa quando a cliente usar.
          </p>
        )}
      </div>

      <FluxoDeCaixaDoMes data={data} mes={mes} />

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

/**
 * O fluxo de caixa: o dinheiro que entrou e saiu, por natureza.
 *
 * Bloco novo, abaixo do caixa e sem mexer nele nem no Resultado Operacional.
 * É aqui que as retiradas dos sócios aparecem — como saída, separadas por
 * categoria —, ao lado de despesas e acervo, para a pergunta "para onde foi o
 * dinheiro?" ter resposta numa tela só.
 */
function FluxoDeCaixaDoMes({ data, mes }: { data: Panorama; mes: string }) {
  if (!data.fluxoDeCaixa) return null;
  const { mes: m, ano: a } = data.fluxoDeCaixa;
  const linhas: { rotulo: string; mes: number; ano: number; sinal: "+" | "−"; destaque?: boolean }[] = [
    { rotulo: "Entradas (pagamentos recebidos)", mes: m.entradas, ano: a.entradas, sinal: "+" },
    { rotulo: "Reembolsos a clientes", mes: m.reembolsos, ano: a.reembolsos, sinal: "−" },
    { rotulo: "Despesas (consumo e custeio)", mes: m.despesasOperacionais, ano: a.despesasOperacionais, sinal: "−" },
    { rotulo: "Acervo (investimento)", mes: m.acervo, ano: a.acervo, sinal: "−" },
    { rotulo: "Retiradas · distribuição de lucros", mes: m.retiradas.DISTRIBUICAO_DE_LUCROS, ano: a.retiradas.DISTRIBUICAO_DE_LUCROS, sinal: "−", destaque: true },
    { rotulo: "Retiradas · pró-labore", mes: m.retiradas.PRO_LABORE, ano: a.retiradas.PRO_LABORE, sinal: "−", destaque: true },
    { rotulo: "Retiradas · devolução de aporte", mes: m.retiradas.DEVOLUCAO_DE_APORTE, ano: a.retiradas.DEVOLUCAO_DE_APORTE, sinal: "−", destaque: true },
  ];
  const valor = (v: number, sinal: "+" | "−") => (v === 0 ? "—" : `${sinal} ${numero(v)}`);
  return (
    <div className="fin-cartao overflow-x-auto p-0" data-fluxo-de-caixa>
      <div className="px-4 pt-4">
        <Rotulo>Fluxo de caixa · {nomeDoMes(mes)}</Rotulo>
      </div>
      <table className="fin-tabela">
        <thead>
          <tr>
            <th>Pela data em que o dinheiro entrou ou saiu</th>
            <th className="num">No mês</th>
            <th className="num">No ano, até o mês</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo}>
              <td style={l.destaque ? { color: "var(--fin-navy-ink)" } : undefined}>{l.rotulo}</td>
              <td className="num">{valor(l.mes, l.sinal)}</td>
              <td className="num">{valor(l.ano, l.sinal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Movimento líquido do caixa</td>
            <td className="num" style={{ color: m.movimentoLiquido < 0 ? "var(--fin-coral-dark)" : undefined }} data-movimento-liquido>
              {brl(m.movimentoLiquido)}
            </td>
            <td className="num" style={{ color: a.movimentoLiquido < 0 ? "var(--fin-coral-dark)" : undefined }}>
              {brl(a.movimentoLiquido)}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="px-4 pb-4 pt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
        Retiradas dos sócios não são despesa e não entram no Resultado Operacional acima. O movimento líquido não é o
        saldo do banco: o sistema não tem o saldo inicial da conta, e recebimentos importados sem data ficam de fora.
      </p>
    </div>
  );
}
