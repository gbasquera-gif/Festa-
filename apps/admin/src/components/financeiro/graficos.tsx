import { brl } from "./formato";

/**
 * Os gráficos da Evolução, desenhados em SVG à mão.
 *
 * Sem biblioteca: são duas formas — linhas e barras — sobre uma escala só, e
 * uma dependência de gráfico custaria mais a manter do que estas funções
 * custam a escrever. Os tokens visuais são os mesmos do resto do Financeiro.
 */

const MESES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export type PontoDaSerie = {
  mes: string;
  numero: number;
  faturamento: number;
  despesas: number;
  resultado: number;
  acumuladoFaturamento: number;
  acumuladoResultado: number;
  temDados: boolean;
  futuro: boolean;
};

/** Escala que sempre inclui o zero: sem isso, resultado negativo sai do quadro. */
function escala(valores: number[], altura: number, topo: number, base: number) {
  const max = Math.max(0, ...valores);
  const min = Math.min(0, ...valores);
  const amplitude = max - min || 1;
  return {
    max,
    min,
    y: (v: number) => topo + (max - v) / amplitude * (altura - topo - base),
    zero: topo + (max - 0) / amplitude * (altura - topo - base),
  };
}

/**
 * Faturamento e resultado ao longo do ano, com despesas em barras ao fundo.
 *
 * O mês futuro é desenhado tracejado: a festa está contratada e o valor é
 * real, mas ainda não aconteceu. Desenhá-lo igual ao passado diria que já
 * faturamos o que ainda vamos entregar.
 */
export function GraficoDoAno({ serie, mesSelecionado }: { serie: PontoDaSerie[]; mesSelecionado: string }) {
  const L = 760, A = 260, esq = 8, dir = 8, topo = 16, base = 30;
  const passo = (L - esq - dir) / 11;
  const x = (n: number) => esq + (n - 1) * passo;
  const e = escala(
    serie.flatMap((p) => [p.faturamento, p.resultado, p.despesas]),
    A, topo, base,
  );

  const visiveis = serie.filter((p) => p.temDados);
  const caminho = (campo: "faturamento" | "resultado", futuros: boolean) =>
    visiveis
      .filter((p) => p.futuro === futuros)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.numero)} ${e.y(p[campo])}`)
      .join(" ");

  // A ponte liga o último mês realizado ao primeiro futuro, para a linha não
  // aparecer partida em duas.
  const ultimoReal = [...visiveis].filter((p) => !p.futuro).pop();
  const primeiroFuturo = visiveis.find((p) => p.futuro);

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img"
         aria-label="Faturamento e resultado operacional mês a mês">
      <line x1={esq} y1={e.zero} x2={L - dir} y2={e.zero}
            stroke="var(--fin-line)" strokeWidth="1" />
      {serie.map((p) => (
        <text key={p.mes} x={x(p.numero)} y={A - 8} textAnchor="middle"
              fontSize="11" fontFamily="var(--fin-mono)"
              fill={p.mes === mesSelecionado ? "var(--fin-coral)" : "var(--fin-muted)"}
              fontWeight={p.mes === mesSelecionado ? 700 : 400}>
          {MESES[p.numero - 1]}
        </text>
      ))}

      {visiveis.filter((p) => p.despesas > 0).map((p) => (
        <rect key={p.mes} x={x(p.numero) - 9} width="18"
              y={Math.min(e.y(p.despesas), e.zero)}
              height={Math.abs(e.zero - e.y(p.despesas))}
              fill="var(--fin-coral)" opacity="0.14" />
      ))}

      {ultimoReal && primeiroFuturo && (
        <>
          <path d={`M ${x(ultimoReal.numero)} ${e.y(ultimoReal.faturamento)} L ${x(primeiroFuturo.numero)} ${e.y(primeiroFuturo.faturamento)}`}
                fill="none" stroke="var(--fin-navy)" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
          <path d={`M ${x(ultimoReal.numero)} ${e.y(ultimoReal.resultado)} L ${x(primeiroFuturo.numero)} ${e.y(primeiroFuturo.resultado)}`}
                fill="none" stroke="var(--fin-gold)" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
        </>
      )}
      <path d={caminho("faturamento", true)} fill="none" stroke="var(--fin-navy)"
            strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
      <path d={caminho("resultado", true)} fill="none" stroke="var(--fin-gold)"
            strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
      <path d={caminho("faturamento", false)} fill="none" stroke="var(--fin-navy)" strokeWidth="2.5" />
      <path d={caminho("resultado", false)} fill="none" stroke="var(--fin-gold)" strokeWidth="2.5" />

      {visiveis.map((p) => (
        <g key={p.mes}>
          <circle cx={x(p.numero)} cy={e.y(p.faturamento)} r={p.mes === mesSelecionado ? 5 : 3.5}
                  fill={p.futuro ? "var(--fin-paper)" : "var(--fin-navy)"}
                  stroke="var(--fin-navy)" strokeWidth="2" />
          <circle cx={x(p.numero)} cy={e.y(p.resultado)} r={p.mes === mesSelecionado ? 5 : 3.5}
                  fill={p.futuro ? "var(--fin-paper)" : "var(--fin-gold)"}
                  stroke="var(--fin-gold)" strokeWidth="2" />
          <title>{`${p.mes} — faturamento ${brl(p.faturamento)} · despesas ${brl(p.despesas)} · resultado ${brl(p.resultado)}${p.futuro ? " (contratado, festa ainda não aconteceu)" : ""}`}</title>
        </g>
      ))}
    </svg>
  );
}

/** A curva do acumulado: quanto do ano já foi somado até cada mês. */
export function GraficoAcumulado({ serie }: { serie: PontoDaSerie[] }) {
  const L = 760, A = 150, esq = 8, dir = 8, topo = 12, base = 26;
  const passo = (L - esq - dir) / 11;
  const x = (n: number) => esq + (n - 1) * passo;
  const visiveis = serie.filter((p) => p.temDados);
  const e = escala(serie.map((p) => p.acumuladoFaturamento), A, topo, base);
  if (visiveis.length === 0) return null;

  // O trecho futuro é tracejado pela mesma razão do gráfico do ano: o
  // acumulado de novembro inclui festa contratada que ainda não aconteceu, e
  // uma linha cheia diria que o dinheiro já entrou. A área preenchida para
  // no último mês realizado, que é onde o número do título também para.
  const realizados = visiveis.filter((p) => !p.futuro);
  const futuros = visiveis.filter((p) => p.futuro);
  const traco = (pontos: PontoDaSerie[]) =>
    pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.numero)} ${e.y(p.acumuladoFaturamento)}`).join(" ");
  const ponte = realizados.length > 0 && futuros.length > 0
    ? `M ${x(realizados[realizados.length - 1].numero)} ${e.y(realizados[realizados.length - 1].acumuladoFaturamento)} L ${x(futuros[0].numero)} ${e.y(futuros[0].acumuladoFaturamento)}`
    : "";
  const solidos = realizados.length > 0 ? realizados : visiveis;
  const area = `${traco(solidos)} L ${x(solidos[solidos.length - 1].numero)} ${e.zero} L ${x(solidos[0].numero)} ${e.zero} Z`;

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img"
         aria-label="Faturamento acumulado no ano">
      <path d={area} fill="var(--fin-navy)" opacity="0.08" />
      {ponte && <path d={ponte} fill="none" stroke="var(--fin-navy)" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />}
      <path d={traco(futuros)} fill="none" stroke="var(--fin-navy)" strokeWidth="2" strokeDasharray="5 4" opacity="0.5" />
      <path d={traco(realizados)} fill="none" stroke="var(--fin-navy)" strokeWidth="2.5" />
      {serie.map((p) => (
        <text key={p.mes} x={x(p.numero)} y={A - 7} textAnchor="middle"
              fontSize="11" fontFamily="var(--fin-mono)" fill="var(--fin-muted)">
          {MESES[p.numero - 1]}
        </text>
      ))}
      {visiveis.map((p) => (
        <g key={p.mes}>
          <circle cx={x(p.numero)} cy={e.y(p.acumuladoFaturamento)} r="3.5"
                  fill={p.futuro ? "var(--fin-paper)" : "var(--fin-navy)"}
                  stroke="var(--fin-navy)" strokeWidth="2" />
          <title>{`${p.mes} — acumulado ${brl(p.acumuladoFaturamento)}`}</title>
        </g>
      ))}
    </svg>
  );
}

/** Legenda das séries. Cor é significado, e significado precisa de nome. */
export function Legenda({ itens }: { itens: { cor: string; rotulo: string; tracejado?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {itens.map((i) => (
        <span key={i.rotulo} className="flex items-center gap-2">
          <span aria-hidden style={{
            width: 18, height: 0,
            borderTop: `${i.tracejado ? "2px dashed" : "3px solid"} ${i.cor}`,
            opacity: i.tracejado ? 0.6 : 1,
          }} />
          <span className="fin-rotulo" style={{ fontSize: "0.62rem" }}>{i.rotulo}</span>
        </span>
      ))}
    </div>
  );
}
