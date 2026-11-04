import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  MOTIVO_DA_FALTA_LABEL,
  NATUREZA_DA_FALTA_LABEL,
  formatarDataDaFesta,
  textoDoResponsavel,
  unidades,
  type FaltaDeItem,
  type OpcaoConferida,
} from "@festae/shared";
import { Button } from "@/components/ui/button";

/**
 * O aviso de itens indisponíveis, opção por opção, item por item.
 *
 * Mostra tudo o que falta de uma vez — quem monta a proposta precisa saber
 * o que trocar sem descobrir um problema por tentativa. Cada item diz quanto
 * a opção pede, quanto está livre na data, quanto falta, por quê e quem está
 * segurando (reserva ou proposta), com link para abrir o registro.
 *
 * É do painel. O link da cliente nunca recebe nada disto.
 */

const CORAL = "#c4472a";
const NAVY = "var(--color-navy)";

/** Conflito real em coral; inconsistência em âmbar, para a operação conferir o cadastro. */
const COR_DA_NATUREZA: Record<FaltaDeItem["natureza"], string> = {
  OUTRA_FESTA: CORAL,
  ACERVO: CORAL,
  CADASTRO: "#9a6a1f",
  TECNICA: "#9a6a1f",
  NAO_IDENTIFICADA: "#7a7266",
};

export function dataNoAviso(data: string): string {
  return formatarDataDaFesta(`${data}T12:00:00.000Z`);
}

export function horaDaConferencia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="painel-periodo">{rotulo}</dt>
      <dd className="fin-numero text-sm" style={{ color: destaque ? CORAL : NAVY }}>
        {unidades(valor)}
      </dd>
    </div>
  );
}

function Responsaveis({ falta }: { falta: FaltaDeItem }) {
  if (falta.motivo === "SEM_UNIDADES_NO_ACERVO" || falta.motivo === "PEDIDO_MAIOR_QUE_O_ACERVO") {
    return <span className="text-muted-foreground">não se aplica — o acervo cadastrado não comporta o pedido.</span>;
  }
  if (falta.responsaveis.length === 0) {
    return <span className="text-muted-foreground">não identificado.</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {falta.responsaveis.map((r) => (
        <Link
          key={`${r.tipo}-${r.id}`}
          href={r.tipo === "RESERVA" ? `/reservas/${r.id}/editar` : `/comercial/orcamentos/${r.id}`}
          className="underline underline-offset-2"
          style={{ color: NAVY }}
        >
          {textoDoResponsavel(r)}
        </Link>
      ))}
    </span>
  );
}

export function ItemIndisponivel({
  falta,
  data,
  acoes,
}: {
  falta: FaltaDeItem;
  data: string;
  acoes?: ReactNode;
}) {
  const cor = COR_DA_NATUREZA[falta.natureza];
  return (
    <li className="space-y-2 rounded-md border bg-background p-3" data-falta={falta.identificador ?? falta.productId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-sm" style={{ color: NAVY }}>
          <span className="painel-periodo mr-1">Item</span>
          <strong className="font-semibold">{falta.nome}</strong>
          <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Identificador: {falta.identificador ?? "não cadastrado"}
          </span>
        </p>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider"
          style={{ background: `${cor}14`, color: cor }}
        >
          {NATUREZA_DA_FALTA_LABEL[falta.natureza]}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Numero rotulo="Necessário" valor={falta.necessario} />
        <Numero rotulo="Disponível" valor={falta.disponivel} />
        <Numero rotulo="Faltante" valor={falta.faltante} destaque />
      </dl>
      <p className="text-sm" style={{ color: NAVY }}>
        <span className="text-muted-foreground">Motivo: </span>
        {MOTIVO_DA_FALTA_LABEL[falta.motivo]}
      </p>
      <p className="text-sm" style={{ color: NAVY }}>
        <span className="text-muted-foreground">Responsável: </span>
        <Responsaveis falta={falta} />
      </p>
      <p className="text-xs text-muted-foreground">
        Data do evento: {dataNoAviso(data)}
        {falta.kit
          ? ` · peça do kit “${falta.kit}”${falta.avulso > 0 ? ` (${unidades(falta.noKit)} no kit + ${unidades(falta.avulso)} avulsa)` : ""}`
          : ""}
        {` · ${falta.estoque} no acervo, ${falta.comprometido} comprometida${falta.comprometido === 1 ? "" : "s"} na data`}
      </p>
      {acoes && <div className="flex flex-wrap gap-2 pt-1">{acoes}</div>}
    </li>
  );
}

export function AvisoDeIndisponibilidade({
  data,
  opcoes,
  conferidoEm,
  contexto,
  acoesDaOpcao,
  acoesDoItem,
  aoVerificar,
  verificando,
}: {
  /** O dia da festa, AAAA-MM-DD. */
  data: string;
  opcoes: readonly OpcaoConferida[];
  conferidoEm?: string | null;
  /** Detalhe da proposta, recusa do envio pelo servidor, ou editor. */
  contexto: "detalhe" | "envio" | "editor";
  acoesDaOpcao?: (opcao: OpcaoConferida) => ReactNode;
  acoesDoItem?: (opcao: OpcaoConferida, falta: FaltaDeItem) => ReactNode;
  aoVerificar?: () => void;
  verificando?: boolean;
}) {
  const afetadas = opcoes.filter((o) => o.faltas.length > 0);
  if (afetadas.length === 0) return null;
  const itens = afetadas.reduce((s, o) => s + o.faltas.length, 0);
  const hora = horaDaConferencia(conferidoEm);

  return (
    <section
      role="alert"
      className="painel-cartao overflow-hidden"
      style={{ borderColor: CORAL }}
      data-aviso-indisponibilidade={contexto}
      id="aviso-de-indisponibilidade"
    >
      <header className="space-y-1 p-4" style={{ background: "rgba(224,90,58,0.07)" }}>
        <p className="flex items-center gap-2 text-[0.8rem] font-semibold uppercase tracking-wider" style={{ color: CORAL }}>
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Atenção — itens indisponíveis
        </p>
        <p className="text-sm" style={{ color: NAVY }}>
          {contexto === "envio" ? "O envio foi recusado: o" : "O"} orçamento possui conflitos de disponibilidade para{" "}
          <strong>{dataNoAviso(data)}</strong>, a data do evento — {itens} {itens === 1 ? "item" : "itens"} em{" "}
          {afetadas.length} {afetadas.length === 1 ? "opção" : "opções"}.
        </p>
        <p className="text-xs text-muted-foreground">
          O sistema confere o dia da festa: retirada e devolução não são registradas em datas separadas.
        </p>
      </header>

      <div className="divide-y">
        {afetadas.map((op) => (
          <div key={op.id ?? op.chave ?? op.ordem} className="space-y-3 p-4" data-opcao-com-falta={op.ordem}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[0.95rem] font-semibold" style={{ color: NAVY }}>
                Opção {op.ordem} — {op.nome}
              </h3>
              {acoesDaOpcao?.(op)}
            </div>
            <ul className="space-y-2">
              {op.faltas.map((f) => (
                <ItemIndisponivel key={f.productId} falta={f} data={data} acoes={acoesDoItem?.(op, f)} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <footer className="space-y-2 border-t p-4">
        <p className="text-sm font-medium" style={{ color: CORAL }}>
          Este orçamento não pode ser enviado enquanto houver itens indisponíveis.
        </p>
        {contexto === "editor" && (
          <p className="text-xs text-muted-foreground">
            Você pode salvar como rascunho mesmo assim. Edite a opção, substitua ou remova o item e confira de novo.
          </p>
        )}
        {aoVerificar && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" className="min-h-11" onClick={aoVerificar} disabled={verificando}>
              <RefreshCw className={`mr-1.5 size-4${verificando ? " animate-spin" : ""}`} aria-hidden />
              {verificando ? "Verificando…" : "Verificar disponibilidade novamente"}
            </Button>
            {hora && <span className="painel-periodo">Conferido às {hora}</span>}
          </div>
        )}
      </footer>
    </section>
  );
}
