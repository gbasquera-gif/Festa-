import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { formatarDataDaFesta, EVENT_TYPE_META, isEventType } from "@festae/shared";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { brl, nomeDoMes, numero } from "./formato";

/**
 * De que contratos um indicador é feito.
 *
 * Um número sozinho não se confere. "R$ 9.029,00 a receber" só vira trabalho
 * quando alguém sabe de quem — e ir procurar noutra tela é o passo que
 * ninguém dá. Aqui a resposta abre no clique, e é a mesma carteira que a aba
 * Vendas/Contratos mostra.
 *
 * O componente é um só para os três indicadores porque a diferença entre
 * eles é qual coluna importa, não de onde vem o dado: o servidor devolve as
 * mesmas linhas e recalcula o total pela regra compartilhada. Três modais
 * seriam três chances de um deles somar diferente do card que o abriu.
 */

export type TipoDeDetalhe = "A_RECEBER" | "FATURAMENTO" | "FESTAS";

export type LinhaDoDetalhe = {
  reservaId: string;
  numero: number;
  cliente: string;
  festaEm: string;
  tipoDeFesta: string;
  cidade: string;
  entrega: boolean;
  status: string;
  situacao: string;
  valor: number;
  recebido: number;
  saldo: number;
};

export type Detalhamento = {
  apuradoEm: string;
  tipo: TipoDeDetalhe;
  escopo: "MES" | "ANO" | null;
  periodo: string | null;
  linhas: LinhaDoDetalhe[];
  totais: { contratado: number; recebido: number; saldo: number; festas: number };
  confere: boolean;
};

const TITULO: Record<TipoDeDetalhe, string> = {
  A_RECEBER: "A receber",
  FATURAMENTO: "Faturamento",
  FESTAS: "Festas no período",
};

const EXPLICACAO: Record<TipoDeDetalhe, string> = {
  A_RECEBER:
    "Saldo aberto de todos os contratos vigentes, hoje. Não tem recorte de mês: é o que falta entrar, venha a festa quando vier.",
  FATURAMENTO:
    "Competência pela data da festa: o contrato pertence ao mês em que a festa acontece, não ao mês em que foi fechado.",
  FESTAS:
    "As festas cuja data cai no período selecionado. Canceladas não entram — aparecem na lista de Reservas, mas em indicador nenhum.",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Solicitação",
  CONFIRMED: "Confirmada",
  PREPARING: "Preparação",
  READY: "Pronta",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
};

const tipoDeFesta = (t: string) => (isEventType(t) ? EVENT_TYPE_META[t].label : t);

export function DetalheDoIndicador({
  tipo,
  escopo,
  mes,
  aoFechar,
}: {
  tipo: TipoDeDetalhe;
  escopo: "MES" | "ANO";
  /** O mês que a tela estava mostrando, "AAAA-MM". */
  mes: string;
  aoFechar: () => void;
}) {
  const { data, isLoading, error } = useQuery<Detalhamento>({
    queryKey: ["financeiro", "detalhe", tipo, escopo, mes],
    queryFn: () => api(`/financeiro/detalhe?tipo=${tipo}&escopo=${escopo}&mes=${mes}`),
  });

  const periodo =
    tipo === "A_RECEBER"
      ? "hoje"
      : escopo === "ANO"
        ? `janeiro a ${nomeDoMes(mes).replace(` de ${mes.slice(0, 4)}`, "")} de ${mes.slice(0, 4)}`
        : nomeDoMes(mes);

  return (
    <DetalhePainel
      tipo={tipo}
      periodo={periodo}
      dados={data}
      carregando={isLoading}
      erro={Boolean(error)}
      aoFechar={aoFechar}
    />
  );
}

/**
 * O painel em si, sem saber de onde os dados vêm.
 *
 * Os indicadores do Financeiro têm recorte de mês e ano, e o servidor os
 * apura. O da Visão Geral tem também "hoje", "7 dias" e "30 dias", que são
 * janelas da tela e não existem na apuração financeira — ali as linhas saem
 * da mesma lista que já produziu o número na tela. Em ambos os casos o
 * detalhamento nasce do mesmo conjunto do KPI; muda só quem fez a conta.
 */
export function DetalhePainel({
  tipo,
  periodo,
  dados,
  carregando,
  erro,
  aoFechar,
}: {
  tipo: TipoDeDetalhe;
  periodo: string;
  dados: Detalhamento | undefined;
  carregando: boolean;
  erro: boolean;
  aoFechar: () => void;
}) {
  const data = dados;
  const isLoading = carregando;
  const error = erro;

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent
        className="financeiro max-h-[92dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <div
          className="flex items-start justify-between gap-3 border-b p-4 sm:p-5"
          style={{ borderColor: "var(--fin-line)" }}
        >
          <div className="min-w-0">
            <DialogTitle className="text-base font-medium" style={{ color: "var(--fin-navy-ink)" }}>
              {TITULO[tipo]} <span className="font-normal" style={{ color: "var(--fin-muted)" }}>— {periodo}</span>
            </DialogTitle>
            <p className="mt-1 max-w-xl text-xs" style={{ color: "var(--fin-muted)" }}>
              {EXPLICACAO[tipo]}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar detalhamento"
            className="-m-1 shrink-0 rounded p-1"
            style={{ color: "var(--fin-muted)" }}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {isLoading && (
            <p className="p-5 text-sm" style={{ color: "var(--fin-muted)" }}>
              Apurando…
            </p>
          )}
          {error && <p className="p-5 text-sm text-destructive">Não foi possível abrir o detalhamento.</p>}

          {data && data.linhas.length === 0 && (
            <p className="p-5 text-sm" style={{ color: "var(--fin-muted)" }}>
              {tipo === "A_RECEBER"
                ? "Nada a receber: todos os contratos vigentes estão quitados."
                : "Nenhuma festa neste período."}
            </p>
          )}

          {data && data.linhas.length > 0 && (
            <>
              {/* Computador: tabela, que é onde valor compara com valor. */}
              <table className="fin-tabela hidden md:table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Festa</th>
                    <th>{tipo === "FESTAS" ? "Cidade" : "Tipo"}</th>
                    {tipo === "FESTAS" ? (
                      <th>Situação</th>
                    ) : (
                      <>
                        <th className="num">Contratado</th>
                        {tipo === "A_RECEBER" && <th className="num">Pago</th>}
                        {tipo === "A_RECEBER" && <th className="num">Saldo</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.map((l) => (
                    <tr key={l.reservaId}>
                      <td style={{ color: "var(--fin-navy-ink)" }}>
                        {l.cliente}
                        {l.numero > 0 && (
                          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                            contrato nº {l.numero}
                          </span>
                        )}
                      </td>
                      <td>{formatarDataDaFesta(l.festaEm)}</td>
                      <td style={{ color: "var(--fin-muted)" }}>
                        {tipo === "FESTAS"
                          ? `${l.cidade} · ${l.entrega ? "entrega" : "retirada"}`
                          : tipoDeFesta(l.tipoDeFesta)}
                      </td>
                      {tipo === "FESTAS" ? (
                        <td style={{ color: "var(--fin-muted)" }}>
                          {STATUS_LABEL[l.status] ?? l.status}
                        </td>
                      ) : (
                        <>
                          <td className="num">{numero(l.valor)}</td>
                          {tipo === "A_RECEBER" && <td className="num">{numero(l.recebido)}</td>}
                          {tipo === "A_RECEBER" && (
                            <td className="num" style={{ color: "var(--fin-coral-dark)" }}>
                              {numero(l.saldo)}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Celular: um cartão por linha. Seis colunas em 390px não cabem. */}
              <ul className="divide-y md:hidden" style={{ borderColor: "var(--fin-line)" }}>
                {data.linhas.map((l) => (
                  <li key={l.reservaId} className="p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm" style={{ color: "var(--fin-navy-ink)" }}>
                        {l.cliente}
                      </span>
                      <span className="fin-numero shrink-0 text-sm">
                        {tipo === "FESTAS" ? formatarDataDaFesta(l.festaEm) : brl(tipo === "A_RECEBER" ? l.saldo : l.valor)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--fin-muted)" }}>
                      {tipo === "FESTAS"
                        ? `${tipoDeFesta(l.tipoDeFesta)} · ${l.cidade} · ${STATUS_LABEL[l.status] ?? l.status}`
                        : `${formatarDataDaFesta(l.festaEm)}${l.numero > 0 ? ` · contrato nº ${l.numero}` : ""}${
                            tipo === "A_RECEBER" ? ` · pago ${brl(l.recebido)} de ${brl(l.valor)}` : ""
                          }`}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {data && (
          <div
            className="border-t p-4 sm:p-5"
            style={{ borderColor: "var(--fin-line)", background: "var(--fin-cream, #fdf8f4)" }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              {tipo === "FESTAS" ? (
                <Total rotulo="Festas no período" valor={String(data.totais.festas)} destaque />
              ) : (
                <>
                  <Total rotulo="Total contratado" valor={brl(data.totais.contratado)} destaque={tipo === "FATURAMENTO"} />
                  <Total rotulo="Total recebido" valor={brl(data.totais.recebido)} />
                  <Total rotulo="Total a receber" valor={brl(data.totais.saldo)} destaque={tipo === "A_RECEBER"} />
                </>
              )}
            </div>
            {!data.confere && (
              <p className="mt-3 text-xs text-destructive">
                Atenção: a soma das linhas não fechou com o indicador. Não use estes números até
                conferir — avise o suporte.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Total({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <span>
      <span className="painel-periodo block">{rotulo}</span>
      <span
        className="fin-numero"
        style={{
          fontSize: destaque ? "1.25rem" : "1rem",
          color: destaque ? "var(--fin-navy-ink)" : "var(--fin-muted)",
        }}
      >
        {valor}
      </span>
    </span>
  );
}
