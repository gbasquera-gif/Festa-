import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { Rotulo } from "./pecas";
import { dia } from "./formato";
import { useFormato } from "@/lib/privacidade";

type Situacao =
  | "CONFERE"
  | "PAGO_NAO_REGISTRADO"
  | "SEM_PAGAMENTO"
  | "NAO_ENCONTRADO"
  | "ERRO_NA_CONSULTA"
  | "REFERENCIA_DIVERGENTE"
  | "ID_DIVERGENTE"
  | "VALOR_DIVERGENTE"
  | "MOEDA_DIVERGENTE"
  | "PAGAMENTO_DE_TESTE"
  | "ESTORNO_NO_PROVEDOR"
  | "CONTESTACAO_NO_PROVEDOR"
  | "NAO_APROVADO_NO_PROVEDOR"
  | "COBRANCA_ANULADA";

type Item = {
  pagamentoId: string;
  reservaId: string | null;
  contrato: number | null;
  tipo: string;
  metodo: string;
  statusAqui: string;
  valorAqui: number;
  recebidoEm: string | null;
  criadoEm: string;
  idNoProvedor: string | null;
  statusNoProvedor: string | null;
  valorNoProvedor: number | null;
  valorEstornado: number | null;
  situacao: Situacao;
};
type Resposta = { de: string; ate: string; total: number; limitado: boolean; itens: Item[] };

/**
 * Como cada situação aparece. A classe reaproveita o semáforo das etiquetas
 * de pagamento: verde confere, dourado pede uma ação simples, coral pede
 * conferência humana.
 */
const SITUACAO: Record<Situacao, { rotulo: string; classe: string; nota: string }> = {
  CONFERE: { rotulo: "Confere", classe: "quitado", nota: "Recebido aqui e aprovado no Mercado Pago, no mesmo valor." },
  PAGO_NAO_REGISTRADO: {
    rotulo: "Pago, não registrado",
    classe: "parcial",
    nota: "Aprovado e conferido no Mercado Pago, ainda não registrado aqui. Use “Registrar” para gravar pelo mesmo caminho do aviso automático.",
  },
  SEM_PAGAMENTO: { rotulo: "Sem pagamento", classe: "aguardando", nota: "Pendente ou recusado lá também. Nada a registrar." },
  NAO_ENCONTRADO: { rotulo: "Não encontrado", classe: "vencido", nota: "O Mercado Pago não encontrou este pagamento na conta da Festaê." },
  ERRO_NA_CONSULTA: { rotulo: "Sem resposta", classe: "aguardando", nota: "O Mercado Pago não respondeu agora. Tente de novo em alguns minutos." },
  REFERENCIA_DIVERGENTE: { rotulo: "Outra cobrança", classe: "vencido", nota: "O pagamento no Mercado Pago aponta para outra cobrança." },
  ID_DIVERGENTE: { rotulo: "Pix diferente", classe: "vencido", nota: "Há um pagamento com a referência desta cobrança, mas não é o Pix gerado para ela. Não foi registrado." },
  VALOR_DIVERGENTE: { rotulo: "Valor diferente", classe: "vencido", nota: "O valor pago no Mercado Pago é diferente do cobrado. Não foi registrado." },
  MOEDA_DIVERGENTE: { rotulo: "Moeda diferente", classe: "vencido", nota: "O pagamento não está em reais. Não foi registrado." },
  PAGAMENTO_DE_TESTE: { rotulo: "Pagamento de teste", classe: "vencido", nota: "Pagamento de teste do Mercado Pago. Não foi registrado." },
  ESTORNO_NO_PROVEDOR: {
    rotulo: "Estornado lá",
    classe: "vencido",
    nota: "O Mercado Pago informa estorno. Nada foi desfeito aqui: confira se já há reembolso registrado no cancelamento antes de qualquer ajuste.",
  },
  CONTESTACAO_NO_PROVEDOR: {
    rotulo: "Contestado lá",
    classe: "vencido",
    nota: "O Mercado Pago informa contestação ou mediação. Nada foi desfeito aqui: acompanhe a disputa no painel do Mercado Pago.",
  },
  NAO_APROVADO_NO_PROVEDOR: {
    rotulo: "Não aprovado lá",
    classe: "vencido",
    nota: "Registrado como recebido aqui, mas o Mercado Pago não aprovou (pendente, recusado ou cancelado). Nada foi desfeito aqui: confira no painel do Mercado Pago antes de qualquer ajuste.",
  },
  COBRANCA_ANULADA: { rotulo: "Anulado aqui", classe: "vencido", nota: "Anulado no painel, mas aprovado no Mercado Pago." },
};

/**
 * Situação que esta tela ainda não conhece (o servidor ganhou uma nova antes
 * do painel): aparece como alerta, em vez de derrubar a tela inteira.
 */
const SITUACAO_DESCONHECIDA = {
  rotulo: "Conferir",
  classe: "vencido",
  nota: "Situação que esta tela ainda não sabe descrever. Confira a cobrança no painel do Mercado Pago.",
};
const situacaoDe = (situacao: string) => SITUACAO[situacao as Situacao] ?? SITUACAO_DESCONHECIDA;

/** O que pede atenção vem primeiro; o que confere, por último. */
const ORDEM: Situacao[] = [
  "ESTORNO_NO_PROVEDOR",
  "CONTESTACAO_NO_PROVEDOR",
  "NAO_APROVADO_NO_PROVEDOR",
  "VALOR_DIVERGENTE",
  "ID_DIVERGENTE",
  "REFERENCIA_DIVERGENTE",
  "MOEDA_DIVERGENTE",
  "PAGAMENTO_DE_TESTE",
  "COBRANCA_ANULADA",
  "NAO_ENCONTRADO",
  "PAGO_NAO_REGISTRADO",
  "ERRO_NA_CONSULTA",
  "SEM_PAGAMENTO",
  "CONFERE",
];

const TIPO: Record<string, string> = { DEPOSIT: "Sinal", BALANCE: "Saldo" };
const STATUS_AQUI: Record<string, string> = {
  PAID: "Recebido",
  PENDING: "Pendente",
  FAILED: "Recusado",
  ANULADO: "Anulado",
};

/** O status do Mercado Pago em português; o original fica no título. */
const STATUS_LA: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  in_process: "Em análise",
  authorized: "Autorizado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Estornado",
  charged_back: "Contestado (chargeback)",
  in_mediation: "Em mediação",
};
const statusLa = (s: string | null) => (s ? (STATUS_LA[s] ?? s) : "—");

function Etiqueta({ situacao }: { situacao: Situacao }) {
  const s = situacaoDe(situacao);
  return (
    <span className={`fin-situacao ${s.classe}`} title={s.nota}>
      {s.rotulo}
    </span>
  );
}

/**
 * Conciliação com o Mercado Pago.
 *
 * Só leitura: compara cada cobrança online do período com o que o Mercado
 * Pago diz dela, agora. Estorno e contestação nunca são desfeitos sozinhos —
 * desfazer um recebimento mexe no caixa de um mês que pode estar fechado, e o
 * reembolso de um cancelamento já tem registro próprio. Esta tela é onde eles
 * aparecem para alguém decidir.
 */
export function ConciliacaoMercadoPago() {
  const { brl } = useFormato();
  const queryClient = useQueryClient();
  const [dias, setDias] = useState(30);
  const [pedida, setPedida] = useState(false);

  const chave = ["financeiro", "conciliacao-mercado-pago", dias];
  const { data, isFetching, error, refetch } = useQuery<Resposta>({
    queryKey: chave,
    queryFn: () => api(`/pagamentos/conciliacao-mercado-pago?dias=${dias}`),
    // Cada abertura consulta o Mercado Pago cobrança por cobrança: só quando
    // alguém pede.
    enabled: pedida,
    staleTime: 60_000,
  });

  const registrar = useMutation({
    mutationFn: (id: string) =>
      api<{ resultado: string; status: string }>(`/pagamentos/${id}/conferir-no-mercado-pago`, { method: "POST" }),
    onSuccess: (r, id) => {
      toast[r.status === "PAID" ? "success" : "warning"](
        r.status === "PAID" ? "Pagamento registrado." : "Nada registrado: o pagamento não passou na conferência.",
      );
      // Atualiza só a linha: refazer a conciliação consultaria de novo cada
      // cobrança no Mercado Pago.
      if (r.status === "PAID") {
        queryClient.setQueryData<Resposta>(chave, (atual) =>
          atual && {
            ...atual,
            itens: atual.itens.map((i) =>
              i.pagamentoId === id ? { ...i, statusAqui: "PAID", situacao: "CONFERE" } : i,
            ),
          },
        );
      }
      // O resto do Financeiro muda com um recebimento novo.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "financeiro" && q.queryKey[1] !== "conciliacao-mercado-pago",
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Situação desconhecida (-1) vem primeiro: é alerta até alguém olhar.
  const itens = [...(data?.itens ?? [])].sort((a, b) => ORDEM.indexOf(a.situacao) - ORDEM.indexOf(b.situacao));
  const atencao = itens.filter((i) => !["CONFERE", "SEM_PAGAMENTO"].includes(i.situacao)).length;

  return (
    <div className="space-y-5" data-conciliacao-mp>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            Conciliação com o Mercado Pago
          </h2>
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Compara cada pagamento online com o que o Mercado Pago informa agora. Não altera nada: estornos e
            contestações aparecem aqui para conferência, e só um pagamento aprovado e conferido pode ser registrado.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--fin-muted)" }}>
              Período
            </span>
            <select
              id="conciliacao-dias"
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              className="h-11 rounded-md border bg-background px-3 text-sm"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={90}>Últimos 90 dias</option>
            </select>
          </label>
          <Button
            className="h-11"
            onClick={() => (pedida ? refetch() : setPedida(true))}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            {isFetching ? "Conferindo..." : "Conferir agora"}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--fin-bad)" }}>
          {(error as Error).message}
        </p>
      )}

      {data && (
        <>
          <div className="fin-cartao flex flex-wrap gap-x-8 gap-y-2" aria-live="polite">
            <div>
              <Rotulo>Pagamentos conferidos</Rotulo>
              <p className="fin-numero">{data.total}</p>
            </div>
            <div>
              <Rotulo>Pedem atenção</Rotulo>
              <p className="fin-numero" style={atencao > 0 ? { color: "var(--fin-coral)" } : undefined}>
                {atencao}
              </p>
            </div>
            {data.limitado && (
              <p className="self-center text-sm" style={{ color: "var(--fin-muted)" }}>
                Mostrando os {data.total} mais recentes. Escolha um período menor para ver os demais.
              </p>
            )}
          </div>

          {itens.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
              Nenhum pagamento online no período.
            </p>
          ) : (
            <>
              <div className="fin-cartao hidden overflow-x-auto p-0 md:block">
                <table className="fin-tabela">
                  <thead>
                    <tr>
                      <th>Situação</th>
                      <th>Contrato</th>
                      <th>Cobrança</th>
                      <th>Aqui</th>
                      <th className="num">Valor aqui</th>
                      <th>No Mercado Pago</th>
                      <th className="num">Valor lá</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((i) => (
                      <tr key={i.pagamentoId}>
                        <td>
                          <Etiqueta situacao={i.situacao} />
                        </td>
                        <td>{i.contrato !== null ? `nº ${i.contrato}` : "—"}</td>
                        <td>
                          {TIPO[i.tipo] ?? i.tipo} · {i.metodo === "PIX" ? "Pix" : "Cartão"}
                          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                            {dia(i.recebidoEm ?? i.criadoEm)}
                          </span>
                        </td>
                        <td>{STATUS_AQUI[i.statusAqui] ?? i.statusAqui}</td>
                        <td className="num">{brl(i.valorAqui)}</td>
                        <td title={i.statusNoProvedor ?? undefined}>
                          {statusLa(i.statusNoProvedor)}
                          {i.idNoProvedor && (
                            <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                              id {i.idNoProvedor}
                            </span>
                          )}
                        </td>
                        <td className="num">
                          {i.valorNoProvedor !== null ? brl(i.valorNoProvedor) : "—"}
                          {(i.valorEstornado ?? 0) > 0 && (
                            <span className="block text-xs" style={{ color: "var(--fin-coral)" }}>
                              estornado {brl(i.valorEstornado ?? 0)}
                            </span>
                          )}
                        </td>
                        <td>
                          {i.situacao === "PAGO_NAO_REGISTRADO" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={registrar.isPending}
                              onClick={() => registrar.mutate(i.pagamentoId)}
                            >
                              Registrar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden">
                {itens.map((i) => (
                  <div key={i.pagamentoId} className="fin-linha">
                    <div className="flex items-start justify-between gap-2">
                      <Etiqueta situacao={i.situacao} />
                      <span className="text-sm" style={{ color: "var(--fin-muted)" }}>
                        {i.contrato !== null ? `nº ${i.contrato}` : "—"} · {TIPO[i.tipo] ?? i.tipo}
                      </span>
                    </div>
                    <p className="mt-2 text-xs" style={{ color: "var(--fin-muted)" }}>
                      {situacaoDe(i.situacao).nota}
                    </p>
                    <dl>
                      <div>
                        <dt>Aqui</dt>
                        <dd>{brl(i.valorAqui)}</dd>
                      </div>
                      <div>
                        <dt>Lá</dt>
                        <dd>{i.valorNoProvedor !== null ? brl(i.valorNoProvedor) : "—"}</dd>
                      </div>
                      <div>
                        <dt>Status lá</dt>
                        <dd>{statusLa(i.statusNoProvedor)}</dd>
                      </div>
                    </dl>
                    {i.situacao === "PAGO_NAO_REGISTRADO" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full"
                        disabled={registrar.isPending}
                        onClick={() => registrar.mutate(i.pagamentoId)}
                      >
                        Registrar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
