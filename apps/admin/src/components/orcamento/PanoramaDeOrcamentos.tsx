import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import type { PanoramaDeOrcamentos as Panorama, StatusDoOrcamento } from "@festae/shared";
import { api } from "@/lib/api";
import { brl, nomeDoMes, pct } from "@/components/financeiro/formato";

/**
 * O resumo do topo da aba Orçamentos.
 *
 * Todos os números vêm prontos do servidor (`/orcamentos/panorama`), que usa
 * o funil da Visão Geral: a tela só apresenta. Os cards de situação são as
 * abas da lista — clicar em um escolhe a aba, pelo mesmo filtro que os
 * botões de aba usam.
 */

type Aba = "TODOS" | StatusDoOrcamento;
type Taxa = Panorama["conversao"];

/** A mesma apresentação de taxa da Visão Geral: abaixo da base mínima, a contagem. */
function textoDaTaxa(t: Taxa, base: string) {
  if (t.denominador === 0) return "sem base no período";
  if (t.percentual === null) return `${t.numerador} de ${t.denominador} ${base} · base ainda pequena`;
  return `${t.numerador} de ${t.denominador} ${base}`;
}

function diasTexto(d: number) {
  const arred = Math.round(d * 10) / 10;
  return `${arred.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${arred === 1 ? "dia" : "dias"}`;
}

/** "jan", "fev"… — o ano vai no título do bloco, para caber doze meses no celular. */
const mesCurto = (mes: string) => {
  const [ano, n] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, n - 1, 1)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
};
const mesComAno = (mes: string) => `${mesCurto(mes)}/${mes.slice(2, 4)}`;

export function PanoramaDeOrcamentos({
  ano,
  mes,
  aba,
  aoEscolherAba,
}: {
  /** "todos" ou "AAAA". */
  ano: string;
  /** "todos" ou "AAAA-MM". */
  mes: string;
  aba: Aba;
  aoEscolherAba: (aba: Aba) => void;
}) {
  const { data: p, isLoading, error } = useQuery<Panorama>({
    queryKey: ["orcamentos", "panorama", ano, mes],
    queryFn: () => api(`/orcamentos/panorama?ano=${ano}&mes=${mes}`),
  });
  // Os detalhes nascem abertos no computador e fechados no celular: no
  // telefone, o resumo não pode empurrar a lista para fora da tela.
  const [detalhes, setDetalhes] = useState(() => {
    try {
      return window.matchMedia("(min-width: 1024px)").matches;
    } catch {
      return true;
    }
  });

  if (isLoading) return <div className="financeiro orc-panorama fin-cartao"><p className="text-sm" style={{ color: "var(--fin-muted)" }}>Apurando o panorama…</p></div>;
  if (error || !p) return <div className="financeiro orc-panorama fin-cartao"><p className="text-sm text-destructive">Não foi possível apurar o panorama deste período.</p></div>;

  const cartao = (
    alvo: Aba,
    rotulo: string,
    quantidade: number,
    linha2: string | null,
    nota: string,
  ) => (
    <button
      type="button"
      className="orc-kpi"
      data-kpi={alvo}
      aria-pressed={aba === alvo}
      title={`Mostrar na lista: ${rotulo}`}
      onClick={() => aoEscolherAba(aba === alvo && alvo !== "TODOS" ? "TODOS" : alvo)}
    >
      <span className="fin-rotulo">{rotulo}</span>
      <span className="orc-kpi-numero fin-numero">{quantidade}</span>
      {linha2 && <span className="orc-kpi-valor">{linha2}</span>}
      <span className="orc-kpi-nota">{nota}</span>
    </button>
  );

  const maiorMes = Math.max(1, ...p.evolucao.map((m) => m.enviadas));
  const maiorMotivo = Math.max(1, ...p.motivosDaPerda.map((m) => m.quantidade));

  return (
    <section className="financeiro orc-panorama" aria-label="Panorama das propostas">
      {!p.confere && (
        <p className="rounded-md border p-2 text-xs text-destructive">
          As situações não fecharam com o total de propostas. Não use estes números até conferir.
        </p>
      )}

      <div className="orc-kpis">
        {cartao("TODOS", "Propostas", p.propostas, null, "no período")}
        {cartao("ENVIADO", "Em negociação", p.emNegociacao.quantidade, brl(p.emNegociacao.valor), "enviadas, aguardando resposta")}
        {cartao(
          "APROVADO",
          "Aprovadas",
          p.aprovadas.quantidade,
          brl(p.aprovadas.valor),
          p.aprovadas.quantidade > 0
            ? `${p.aprovadas.convertidas} ${p.aprovadas.convertidas === 1 ? "virou reserva" : "viraram reserva"}`
            : "valor aprovado pela cliente",
        )}
        {cartao("RECUSADO", "Perdidas", p.perdidas.quantidade, brl(p.perdidas.valor), "encerradas como perda")}
        <div className="orc-kpi orc-kpi-fixo" data-kpi="CONVERSAO">
          <span className="fin-rotulo">Conversão</span>
          {/* Base pequena: a contagem vira o número principal, sem percentual —
              a mesma regra da Visão Geral. */}
          <span className="orc-kpi-numero fin-numero">
            {p.conversao.denominador === 0
              ? "—"
              : p.conversao.percentual === null
                ? `${p.conversao.numerador} de ${p.conversao.denominador}`
                : pct(p.conversao.percentual, 1)}
          </span>
          <span className="orc-kpi-nota">
            {p.conversao.denominador === 0
              ? "nenhuma enviada no período"
              : p.conversao.percentual === null
                ? "enviadas aprovadas · base ainda pequena"
                : `${p.conversao.numerador} de ${p.conversao.denominador} enviadas aprovadas`}
          </span>
        </div>
        <div className="orc-kpi orc-kpi-fixo" data-kpi="TICKET">
          <span className="fin-rotulo" title="Ticket médio aprovado">Ticket médio</span>
          <span className="orc-kpi-numero fin-numero">
            {p.ticketMedioAprovado === null ? "—" : brl(p.ticketMedioAprovado)}
          </span>
          <span className="orc-kpi-nota">
            {p.aprovadas.quantidade > 0
              ? `por aprovada · ${p.aprovadas.quantidade} no período`
              : "sem aprovações no período"}
          </span>
        </div>
      </div>

      <div className="orc-funil">
        <p className="orc-funil-linha" data-funil>
          <strong>{p.funil.enviadas}</strong> {p.funil.enviadas === 1 ? "enviada" : "enviadas"}
          <span aria-hidden> → </span>
          <strong>{p.funil.aprovadas}</strong> {p.funil.aprovadas === 1 ? "aprovada" : "aprovadas"}
          <span aria-hidden> → </span>
          <strong>{p.funil.convertidas}</strong> {p.funil.convertidas === 1 ? "reserva" : "reservas"}
        </p>
        <button
          type="button"
          className="orc-funil-toggle"
          aria-expanded={detalhes}
          aria-controls="orc-panorama-detalhes"
          onClick={() => setDetalhes((v) => !v)}
        >
          {detalhes ? "Menos detalhes" : "Mais detalhes"}
          <ChevronDown className="size-4" style={{ transform: detalhes ? "rotate(180deg)" : undefined }} aria-hidden />
        </button>
      </div>

      {detalhes && (
        <div id="orc-panorama-detalhes" className="orc-detalhes">
          <dl className="orc-secundarios">
            <div>
              <dt>Rascunhos</dt>
              <dd>
                <button type="button" className="orc-link" aria-pressed={aba === "RASCUNHO"}
                  onClick={() => aoEscolherAba(aba === "RASCUNHO" ? "TODOS" : "RASCUNHO")}>
                  {p.rascunhos.quantidade}
                </button>
                <small>ainda não enviados</small>
              </dd>
            </div>
            <div>
              <dt>Sem resposta</dt>
              <dd>
                <button type="button" className="orc-link" aria-pressed={aba === "EXPIRADO"}
                  onClick={() => aoEscolherAba(aba === "EXPIRADO" ? "TODOS" : "EXPIRADO")}>
                  {p.semResposta.quantidade}
                </button>
                <small>venceram sem aceite nem perda</small>
              </dd>
            </div>
            <div>
              <dt>Taxa de perda</dt>
              <dd>
                {p.taxaDePerda.percentual === null ? "—" : pct(p.taxaDePerda.percentual, 1)}
                <small>{textoDaTaxa(p.taxaDePerda, "enviadas perdidas")}</small>
              </dd>
            </div>
            <div>
              <dt>Tempo até aprovar</dt>
              <dd>
                {p.tempoAteAprovacao.mediaEmDias === null ? "—" : diasTexto(p.tempoAteAprovacao.mediaEmDias)}
                <small>
                  {p.tempoAteAprovacao.base > 0
                    ? `média, do 1º envio ao aceite · ${p.tempoAteAprovacao.base} ${p.tempoAteAprovacao.base === 1 ? "proposta" : "propostas"}`
                    : "sem aprovações com as duas datas"}
                </small>
              </dd>
            </div>
          </dl>

          <div className="orc-blocos">
            <div className="orc-bloco">
              <p className="fin-rotulo">Principais motivos de perda</p>
              {p.motivosDaPerda.length === 0 ? (
                <p className="orc-vazio">Nenhuma perda no período.</p>
              ) : (
                <ul className="com-barras orc-motivos">
                  {p.motivosDaPerda.map((m) => (
                    <li key={m.chave}>
                      <span className="com-barras-rotulo">{m.rotulo}</span>
                      <span className="com-barras-trilho" aria-hidden>
                        <i style={{ width: `${(m.quantidade / maiorMotivo) * 100}%`, background: "var(--fin-coral)" }} />
                      </span>
                      <span className="com-barras-valor">{m.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="orc-bloco">
              <div className="orc-evolucao-cabeca">
                <p className="fin-rotulo">
                  Evolução{p.evolucao.length > 0 && ` · ${mesComAno(p.evolucao[0].mes)} a ${mesComAno(p.evolucao[p.evolucao.length - 1].mes)}`}
                </p>
                <span className="orc-legenda">
                  <i style={{ background: "var(--orc-enviadas)" }} /> Enviadas
                  <i style={{ background: "var(--orc-aprovadas)" }} /> Aprovadas
                </span>
              </div>
              {p.evolucao.every((m) => m.enviadas === 0) ? (
                <p className="orc-vazio">Nenhuma proposta enviada nestes meses.</p>
              ) : (
                <ol className="orc-evolucao" aria-label="Enviadas e aprovadas por mês de primeiro envio">
                  {p.evolucao.map((m) => (
                    <li key={m.mes} title={`${nomeDoMes(m.mes)}: ${m.enviadas} enviadas, ${m.aprovadas} aprovadas`}>
                      <span className="orc-evolucao-barras" aria-hidden>
                        <i style={{ height: `${(m.enviadas / maiorMes) * 100}%`, background: "var(--orc-enviadas)" }} />
                        <i style={{ height: `${(m.aprovadas / maiorMes) * 100}%`, background: "var(--orc-aprovadas)" }} />
                      </span>
                      <span className="orc-evolucao-mes">{mesCurto(m.mes)}</span>
                      <span className="sr-only">{`${m.enviadas} enviadas, ${m.aprovadas} aprovadas`}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          <p className="orc-rodape">
            Propostas contam pelo mês do primeiro envio; rascunhos, pela criação. Conversão e taxa de
            perda seguem a regra da Visão Geral: a base são as propostas com primeiro envio no período.
            Valores em negociação e perdidos são o valor de referência de cada proposta (a 1ª opção),
            nunca a soma das opções; aprovados, o valor da opção escolhida.
            {p.funil.semPrimeiroEnvio > 0 &&
              ` ${p.funil.semPrimeiroEnvio} ${p.funil.semPrimeiroEnvio === 1 ? "proposta antiga, sem primeiro envio registrado, aparece" : "propostas antigas, sem primeiro envio registrado, aparecem"} nos cards e fica${p.funil.semPrimeiroEnvio === 1 ? "" : "m"} fora das taxas.`}
          </p>
        </div>
      )}
    </section>
  );
}
