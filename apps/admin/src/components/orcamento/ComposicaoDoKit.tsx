import { PECAS_EM_UMA_LINHA, textoDaComposicao, type ItemDaComposicao } from "@festae/shared";

/**
 * O que vem dentro do kit, para quem monta a proposta.
 *
 * Informativo: não tem preço e não é item — o kit continua cobrado pela
 * linha KIT. Até seis peças numa linha; acima disso, lista.
 */
export function ComposicaoDoKit({
  kitNome,
  itens,
  nota,
}: {
  kitNome: string;
  itens: readonly ItemDaComposicao[];
  /** De onde veio a composição mostrada (catálogo ou como enviada). */
  nota?: string;
}) {
  return (
    <div className="rounded-md border px-3 py-2.5 text-sm" style={{ borderColor: "var(--color-line, #e8dfd5)", background: "#fdf9f4" }}>
      <p className="painel-periodo">{kitNome} · inclui</p>
      {itens.length === 0 ? (
        <p className="mt-1 text-muted-foreground">Este kit não tem peças ativas cadastradas.</p>
      ) : itens.length <= PECAS_EM_UMA_LINHA ? (
        <p className="mt-1" style={{ color: "var(--color-navy)" }}>{textoDaComposicao(itens)}</p>
      ) : (
        <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2" style={{ color: "var(--color-navy)" }}>
          {itens.map((i) => (
            <li key={i.productId}>
              <span className="tabular-nums">{i.quantidade}</span> {i.nome}
            </li>
          ))}
        </ul>
      )}
      {nota && <p className="mt-1.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
