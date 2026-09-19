import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Plus, Search } from "lucide-react";
import {
  SITUACOES_DE_PAGAMENTO,
  SITUACAO_DE_PAGAMENTO_LABEL,
  saleChannelLabel,
  type SaleChannel,
  type SituacaoDePagamento,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { NumeroEscuro, Rotulo, Situacao } from "./pecas";
import { brl, dia, nomeDoMes, numero } from "./formato";

/**
 * A carteira de contratos.
 *
 * Mostra as mesmas reservas da operação, lidas pelo lado do dinheiro. Não há
 * entidade "Venda" por trás: `Reservation + Order` é o contrato, e é ele que
 * as duas áreas leem. Foi ter dois registros da mesma festa — a reserva no
 * sistema e a linha na planilha — que fazia o painel antigo e a agenda
 * discordarem sem ninguém perceber.
 *
 * Por isso esta tela não cria venda. O botão de venda administrativa leva ao
 * mesmo `/reservas/nova` que a operação usa: um fluxo só, que já confere
 * agenda e estoque. Um segundo formulário aqui seria um segundo caminho para
 * criar contrato — e o segundo caminho é sempre o que esquece uma regra.
 */

type ContratoComercial = {
  id: string;
  numero: number;
  status: string;
  vigente: boolean;
  festaEm: string;
  fechadoEm: string;
  remarcadaDe: string | null;
  migrado: boolean;
  cliente: { nome: string; telefone: string | null; email: string | null };
  cidade: string;
  canal: SaleChannel;
  tipoDeFesta: string;
  convidados: number | null;
  tema: string | null;
  kit: string | null;
  entrega: boolean;
  montagem: boolean;
  valor: number;
  recebido: number;
  saldo: number;
  situacao: SituacaoDePagamento;
  venceEm: string;
  temRecebimentoSemData: boolean;
  pagamentos: { id: string; tipo: string; metodo: string; valor: number; recebidoEm: string | null }[];
};

type Carteira = {
  apuradoEm: string;
  resumo: {
    contratos: number;
    contratado: number;
    recebido: number;
    saldoEmAberto: number;
    vencido: number;
    contratosVencidos: number;
    ticketMedio: number | null;
    recebidoSemData: number;
  };
  contratos: ContratoComercial[];
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

/**
 * `mes` vem do filtro global da tela (`null` = todos os meses).
 *
 * A competência da venda é o mês da FESTA, não o da criação do contrato, e
 * quem aplica essa regra é o backend — a mesma função que a Visão Geral usa.
 * Filtrar aqui no navegador criaria uma segunda definição de competência, e
 * as duas telas passariam a somar conjuntos diferentes.
 */
export function Contratos({ mes }: { mes: string | null }) {
  const [situacao, setSituacao] = useState<"" | SituacaoDePagamento>("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  const parametros = new URLSearchParams();
  if (mes) parametros.set("mes", mes);
  if (situacao) parametros.set("situacao", situacao);
  if (busca.trim()) parametros.set("busca", busca.trim());

  const { data, isLoading, error } = useQuery<Carteira>({
    queryKey: ["financeiro", "contratos", mes, situacao, busca.trim()],
    queryFn: () => api(`/financeiro/contratos?${parametros.toString()}`),
  });

  const contratos = data?.contratos ?? [];
  const resumo = data?.resumo;
  const canceladas = contratos.filter((c) => !c.vigente).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            Vendas e contratos
          </h2>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--fin-muted)" }}>
            Cada linha é uma reserva lida pelo lado do dinheiro. Não existe cadastro de venda
            separado: o contrato é a própria reserva, e é por isso que estes números não podem
            divergir da agenda.
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link href="/reservas/nova">
            <Plus className="mr-1 h-4 w-4" />
            Nova venda
          </Link>
        </Button>
      </div>

      {resumo && (
        <div className="fin-bloco-escuro">
          <p className="fin-rotulo">
            Carteira {mes ? `· festas de ${nomeDoMes(mes)}` : "· todos os contratos"}
          </p>
          <div className="fin-grade mt-4">
            <NumeroEscuro
              rotulo="Contratado"
              valor={brl(resumo.contratado)}
              nota={`${resumo.contratos} contrato${resumo.contratos === 1 ? "" : "s"} vigente${resumo.contratos === 1 ? "" : "s"}`}
            />
            <NumeroEscuro
              rotulo="Recebido"
              valor={brl(resumo.recebido)}
              nota={
                resumo.contratado > 0
                  ? `${((resumo.recebido / resumo.contratado) * 100).toFixed(0)}% do contratado`
                  : "—"
              }
            />
            <NumeroEscuro
              rotulo="A receber"
              valor={brl(resumo.saldoEmAberto)}
              nota="saldo aberto dos vigentes"
            />
            <NumeroEscuro
              rotulo="Vencido"
              valor={brl(resumo.vencido)}
              nota={
                resumo.contratosVencidos > 0
                  ? `${resumo.contratosVencidos} contrato${resumo.contratosVencidos === 1 ? "" : "s"} · festa já passou`
                  : "nada vencido"
              }
              destaque={resumo.vencido > 0 ? "alerta" : "bom"}
            />
          </div>
          <p className="mt-4 text-xs text-white/60">
            Contratado − recebido = a receber. O vencido é um recorte do que está a receber, não
            uma parcela somada à parte: é a fatia cuja festa já aconteceu e cujo saldo continua
            aberto.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-1 items-center gap-2 text-sm" style={{ minWidth: "12rem" }}>
          <span className="sr-only">Buscar contrato</span>
          <span className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--fin-muted)" }}
              aria-hidden
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, cidade ou nº do contrato"
              className="h-11 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="fin-rotulo">Situação</span>
          <select
            value={situacao}
            onChange={(e) => setSituacao(e.target.value as "" | SituacaoDePagamento)}
            className="h-11 rounded-md border bg-background px-3 text-sm"
            aria-label="Filtrar por situação de pagamento"
          >
            <option value="">Todas</option>
            {SITUACOES_DE_PAGAMENTO.map((s) => (
              <option key={s} value={s}>
                {SITUACAO_DE_PAGAMENTO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Apurando a carteira…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível carregar os contratos.</p>}

      {!isLoading && contratos.length === 0 && (
        <div className="fin-cartao text-center">
          <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
            Nenhum contrato com esse filtro.
          </p>
        </div>
      )}

      {contratos.length > 0 && (
        <>
          {/* Desktop: tabela. É onde se compara valor com valor na vertical. */}
          <div className="fin-cartao hidden overflow-x-auto p-0 md:block">
            <table className="fin-tabela">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente</th>
                  <th>Festa</th>
                  <th>Situação</th>
                  <th className="num">Contratado</th>
                  <th className="num">Recebido</th>
                  <th className="num">Saldo</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => (
                  <Linha key={c.id} contrato={c} aberto={aberto === c.id} aoAbrir={setAberto} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: cartões. Dez colunas em 390px viram rolagem lateral, e
              ninguém confere dinheiro arrastando a tela de lado. */}
          <div className="md:hidden">
            {contratos.map((c) => (
              <Cartao key={c.id} contrato={c} />
            ))}
          </div>
        </>
      )}

      {canceladas > 0 && (
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          {canceladas} contrato{canceladas === 1 ? "" : "s"} cancelado{canceladas === 1 ? "" : "s"} na
          lista. Aparece{canceladas === 1 ? "" : "m"} porque a operação precisa ver o que caiu, e
          não entra{canceladas === 1 ? "" : "m"} em nenhum total acima.
        </p>
      )}

      {resumo && resumo.recebidoSemData > 0 && (
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          {brl(resumo.recebidoSemData)} foram recebidos sem data conhecida, herança do painel
          antigo, que guardava quanto foi pago e nunca quando. Contam no recebido e abatem o
          saldo, mas não entram no caixa de mês nenhum.
        </p>
      )}

      <div className="flex justify-end">
        <Rotulo>O contrato é a reserva — não há cadastro de venda em paralelo</Rotulo>
      </div>
    </div>
  );
}

function Linha({
  contrato: c,
  aberto,
  aoAbrir,
}: {
  contrato: ContratoComercial;
  aberto: boolean;
  aoAbrir: (id: string | null) => void;
}) {
  return (
    <>
      <tr className={c.vigente ? undefined : "riscado"}>
        <td>
          <button
            type="button"
            onClick={() => aoAbrir(aberto ? null : c.id)}
            aria-expanded={aberto}
            className="fin-numero text-left text-sm"
            style={{ fontSize: "0.9rem" }}
          >
            {String(c.numero).padStart(3, "0")}
          </button>
          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
            {STATUS_LABEL[c.status] ?? c.status}
          </span>
        </td>
        <td>
          <span style={{ color: "var(--fin-navy-ink)" }}>{c.cliente.nome}</span>
          {c.migrado && (
            <span
              className="ml-2 fin-rotulo"
              style={{ fontSize: "0.56rem", opacity: 0.6 }}
              title="Veio da migração do painel antigo: a integridade foi conferida, a política comercial não"
            >
              migrado
            </span>
          )}
          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
            {c.cidade} · {saleChannelLabel(c.canal)}
          </span>
        </td>
        <td>
          {dia(`${c.festaEm}T12:00:00Z`)}
          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
            fechado {dia(`${c.fechadoEm}T12:00:00Z`)}
          </span>
        </td>
        <td><Situacao valor={c.situacao} /></td>
        <td className="num">{numero(c.valor)}</td>
        <td className="num">{numero(c.recebido)}</td>
        <td
          className="num"
          style={{ color: c.situacao === "VENCIDO" ? "var(--fin-coral-dark)" : undefined }}
        >
          {numero(c.saldo)}
        </td>
        <td className="num">
          <Button asChild variant="ghost" size="icon" className="h-11 w-11">
            <Link href={`/reservas/${c.id}/editar`} aria-label={`Abrir contrato ${c.numero}`}>
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={8} style={{ background: "var(--fin-cream)" }}>
            <Detalhe contrato={c} />
          </td>
        </tr>
      )}
    </>
  );
}

/** O que está por trás do número: como a festa foi vendida e o que já entrou. */
function Detalhe({ contrato: c }: { contrato: ContratoComercial }) {
  return (
    <div className="grid gap-4 py-2 md:grid-cols-2">
      <div>
        <Rotulo>A festa</Rotulo>
        <ul className="mt-1 space-y-0.5 text-sm" style={{ color: "var(--fin-navy-ink)" }}>
          <li>{c.kit ?? "Sem kit"}{c.tema ? ` · ${c.tema}` : ""}</li>
          <li>
            {c.entrega ? "Entrega no local" : "Retirada na sede"}
            {c.montagem ? " · com montagem" : ""}
            {c.convidados ? ` · ${c.convidados} convidados` : ""}
          </li>
          <li>
            {c.cliente.telefone ?? "sem telefone"}
            {c.cliente.email ? ` · ${c.cliente.email}` : ""}
          </li>
          {c.remarcadaDe && (
            <li style={{ color: "var(--fin-coral-dark)" }}>
              remarcada de {dia(`${c.remarcadaDe}T12:00:00Z`)}
            </li>
          )}
        </ul>
      </div>
      <div>
        <Rotulo>Recebimentos</Rotulo>
        {c.pagamentos.length === 0 ? (
          <p className="mt-1 text-sm" style={{ color: "var(--fin-muted)" }}>
            Nada recebido. O saldo vence em {dia(`${c.venceEm}T12:00:00Z`)}, dia da festa.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.pagamentos.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span style={{ color: "var(--fin-muted)" }}>
                  {p.recebidoEm ? dia(p.recebidoEm) : "sem data"} · {p.metodo}
                  {p.tipo === "INDETERMINADO" ? " · sinal ou saldo, não se sabe" : ""}
                </span>
                <span className="fin-numero" style={{ fontSize: "0.85rem" }}>
                  {numero(p.valor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Cartao({ contrato: c }: { contrato: ContratoComercial }) {
  return (
    <div className={`fin-linha ${c.vigente ? "" : "riscado"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
            {c.cliente.nome}
          </p>
          <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
            nº {String(c.numero).padStart(3, "0")} · festa {dia(`${c.festaEm}T12:00:00Z`)} ·{" "}
            {c.cidade}
          </p>
        </div>
        <Situacao valor={c.situacao} />
      </div>
      <dl>
        <div>
          <dt>Contratado</dt>
          <dd>{numero(c.valor)}</dd>
        </div>
        <div>
          <dt>Recebido</dt>
          <dd>{numero(c.recebido)}</dd>
        </div>
        <div>
          <dt>Saldo</dt>
          <dd style={{ color: c.situacao === "VENCIDO" ? "var(--fin-coral-dark)" : undefined }}>
            {numero(c.saldo)}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--fin-muted)" }}>
          {saleChannelLabel(c.canal)}
          {c.migrado ? " · migrado" : ""}
        </span>
        <Button asChild variant="ghost" size="sm" className="min-h-11">
          <Link href={`/reservas/${c.id}/editar`}>Abrir contrato</Link>
        </Button>
      </div>
    </div>
  );
}
