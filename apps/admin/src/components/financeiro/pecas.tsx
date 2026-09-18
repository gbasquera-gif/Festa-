import type { ReactNode } from "react";

/**
 * As peças visuais da área financeira.
 *
 * A identidade vem do painel financeiro que a operação já usava: rótulo em
 * mono maiúsculo, número grande em mono com dígitos de mesma largura, e o
 * bloco escuro no topo para meta e ritmo. Os tokens estão em `index.css`,
 * escopados em `.financeiro` — o resto do ERP não fala esta língua.
 */

/** Rótulo em mono maiúsculo. É a assinatura visual do painel antigo. */
export function Rotulo({ children }: { children: ReactNode }) {
  return <p className="fin-rotulo">{children}</p>;
}

/** Cartão compacto: rótulo, número grande, e uma nota opcional embaixo. */
export function Indicador({
  rotulo,
  valor,
  nota,
  tom = "normal",
}: {
  rotulo: string;
  valor: string;
  nota?: ReactNode;
  tom?: "normal" | "acervo" | "alerta";
}) {
  const fundo =
    tom === "acervo"
      ? { background: "var(--fin-gold-pale)", borderColor: "transparent" }
      : tom === "alerta"
        ? { borderColor: "var(--fin-coral)" }
        : undefined;
  return (
    <div className="fin-cartao" style={fundo}>
      <Rotulo>{rotulo}</Rotulo>
      <p className="fin-numero mt-1 text-[1.45rem] leading-tight">{valor}</p>
      {nota && (
        <p className="mt-1 text-xs" style={{ color: "var(--fin-muted)" }}>
          {nota}
        </p>
      )}
    </div>
  );
}

/**
 * Barra de progresso com a marca do ritmo esperado.
 *
 * A marca existe porque "43% da meta" não diz nada sozinho: o que importa é
 * se 43% da meta chegaram antes ou depois de 43% do mês ter passado.
 */
export function Barra({ preenchido, marca }: { preenchido: number; marca?: number }) {
  const limitar = (v: number) => Math.min(100, Math.max(0, v * 100));
  return (
    <div className="fin-barra relative">
      <i style={{ width: `${limitar(preenchido)}%` }} />
      {marca !== undefined && (
        <span
          aria-hidden
          className="absolute top-0 h-full w-px bg-white/70"
          style={{ left: `${limitar(marca)}%` }}
        />
      )}
    </div>
  );
}

/** Etiqueta de natureza. A cor carrega significado: dourado fica, o resto sai. */
export function Natureza({ valor }: { valor: string }) {
  const classe = valor === "ACERVO" ? "acervo" : valor === "CONSUMO" ? "consumo" : "custeio";
  return <span className={`fin-etiqueta ${classe}`}>{valor}</span>;
}

/** Aviso honesto: o resultado exibido ainda não desconta desgaste do acervo. */
export function AvisoDeDepreciacao() {
  return (
    <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
      O resultado gerencial <strong>não considera depreciação do acervo</strong>. Vida útil e
      valor residual já podem ser registrados aqui, mas nenhum cálculo os usa — depreciação
      sobre estimativa inventada seria pior que nenhuma, porque pareceria precisa.
    </p>
  );
}
