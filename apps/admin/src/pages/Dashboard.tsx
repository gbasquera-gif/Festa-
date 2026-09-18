import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks, Wallet, Coins, ArrowRight } from "lucide-react";
import { formatarDataDaFesta } from "@festae/shared";
import { api } from "@/lib/api";
import { brl, nomeDoMes, pct } from "@/components/financeiro/formato";
import type { Panorama } from "@/components/financeiro/panorama";

/**
 * A Visão Geral — o cockpit da operação.
 *
 * O painel antigo abria contando cadastros: temas ativos, produtos ativos,
 * kits ativos. Nenhum deles muda de uma semana para outra, e nenhum responde
 * a pergunta de quem abre o sistema de manhã — o que acontece hoje, o que
 * está atrasado, quanto entrou e quanto falta entrar.
 *
 * É resumo, não relatório: cada bloco leva ao módulo que detalha.
 */

type ReservaResumo = {
  id: string;
  eventDate: string;
  status: string;
  order: {
    fulfillment: "PICKUP" | "DELIVERY";
    assembly: boolean;
    event: { user: { name: string }; theme: { name: string } | null; type: string };
  };
};

type Acoes = {
  hoje: AcaoResumo[];
  tresDias: AcaoResumo[];
  seteDias: AcaoResumo[];
  resumo: { atrasadas: number; comPendencia: number; devolucoesPendentes: number; hoje: number };
};
type AcaoResumo = {
  reservaId: string;
  data: string;
  dias: number;
  cliente: string;
  etapa: { titulo: string };
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Solicitação", CONFIRMED: "Confirmada", PREPARING: "Preparação",
  READY: "Pronta", COMPLETED: "Concluída", REJECTED: "Rejeitada", CANCELLED: "Cancelada",
};
const VIVAS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

/**
 * As janelas do filtro.
 *
 * `dias` governa os blocos operacionais; `financeiro` diz o que o resumo do
 * dinheiro mostra. São coisas diferentes de propósito: "faturamento dos
 * últimos 7 dias" por competência não é uma pergunta que a apuração responde,
 * e inventá-la no navegador criaria uma segunda regra financeira. Nessas
 * janelas o resumo continua sendo o do mês, e diz isso na cara.
 */
const JANELAS = [
  { chave: "hoje", rotulo: "Hoje", dias: 0, financeiro: "mes" },
  { chave: "7", rotulo: "7 dias", dias: 7, financeiro: "mes" },
  { chave: "30", rotulo: "30 dias", dias: 30, financeiro: "mes" },
  { chave: "mes", rotulo: "Mês", dias: null, financeiro: "mes" },
  { chave: "ano", rotulo: "Ano", dias: null, financeiro: "ano" },
] as const;

type Janela = (typeof JANELAS)[number]["chave"];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Os meses que o seletor oferece: do ano passado ao ano que vem.
 *
 * Derivados do relógio, nunca digitados — uma lista fixa passa a mentir na
 * virada do ano. A janela inclui o futuro porque festa é contratada com meses
 * de antecedência, e o gestor precisa olhar para frente.
 */
function mesesDisponiveis(): string[] {
  const atual = new Date().getUTCFullYear();
  const meses: string[] = [];
  for (let ano = atual + 1; ano >= atual - 1; ano--) {
    for (let m = 12; m >= 1; m--) meses.push(`${ano}-${String(m).padStart(2, "0")}`);
  }
  return meses;
}

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function Dashboard() {
  const [janela, setJanela] = useState<Janela>("mes");
  const agora = new Date();
  const [mes, setMes] = useState(agora.toISOString().slice(0, 7));
  const ano = Number(mes.slice(0, 4));

  const reservas = useQuery<ReservaResumo[]>({ queryKey: ["reservations"], queryFn: () => api("/reservations") });
  const acoes = useQuery<Acoes>({ queryKey: ["proximas-acoes"], queryFn: () => api("/operacao/proximas-acoes") });
  const panorama = useQuery<Panorama>({
    queryKey: ["financeiro", "panorama", ano, mes],
    queryFn: () => api(`/financeiro/panorama?ano=${ano}&mes=${mes}`),
    retry: false, // OPS não vê financeiro; o resto da tela continua de pé.
  });

  const cfg = JANELAS.find((j) => j.chave === janela)!;
  const porAno = cfg.financeiro === "ano";

  /** As festas dentro da janela escolhida. Contagem operacional, não financeira. */
  const noPeriodo = useMemo(() => {
    const vivas = (reservas.data ?? []).filter((r) => VIVAS.includes(r.status));
    if (cfg.dias === null) {
      const alvo = porAno ? mes.slice(0, 4) : mes;
      return vivas.filter((r) => r.eventDate.slice(0, alvo.length) === alvo);
    }
    const inicio = hojeISO();
    const fim = new Date(Date.now() + cfg.dias * 86_400_000).toISOString().slice(0, 10);
    return vivas.filter((r) => r.eventDate.slice(0, 10) >= inicio && r.eventDate.slice(0, 10) <= fim);
  }, [reservas.data, cfg.dias, porAno, mes]);

  /** As próximas festas são sempre as próximas — o filtro do topo não as governa. */
  const proximas = useMemo(
    () =>
      (reservas.data ?? [])
        .filter((r) => VIVAS.includes(r.status) && r.eventDate.slice(0, 10) >= hojeISO())
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
        .slice(0, 5),
    [reservas.data],
  );

  const emDestaque = useMemo(() => {
    const a = acoes.data;
    if (!a) return [];
    return [...a.hoje, ...a.tresDias, ...a.seteDias].slice(0, 5);
  }, [acoes.data]);

  const fin = panorama.data;
  const rotuloPeriodo = porAno ? String(ano) : nomeDoMes(mes);

  return (
    <div className="space-y-5">
      {/* Cabeçalho e filtro temporal. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-navy)" }}>
            Visão Geral
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O resumo da operação da Festaê. O detalhe fica em cada módulo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="painel-segmentado" role="group" aria-label="Período">
            {JANELAS.map((j) => (
              <button
                key={j.chave}
                type="button"
                aria-pressed={janela === j.chave}
                onClick={() => setJanela(j.chave)}
              >
                {j.rotulo}
              </button>
            ))}
          </div>
          {/* Select em vez de <input type="month">: o campo nativo desenha o
              mês no idioma do navegador, e "September 2026" no meio de uma
              tela em português é o tipo de detalhe que faz o sistema parecer
              de outro lugar. */}
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            aria-label="Mês de referência"
            className="painel-cartao h-10 px-3 text-sm"
            style={{ color: "var(--color-navy)" }}
          >
            {mesesDisponiveis().map((m) => (
              <option key={m} value={m}>
                {nomeDoMes(m).replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Linha superior: quatro números compactos. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoTopo
          icone={<CalendarDays className="size-5" />}
          rotulo="Festas no período"
          valor={reservas.isLoading ? "…" : String(noPeriodo.length)}
          nota={cfg.dias === null ? rotuloPeriodo : cfg.dias === 0 ? "hoje" : `próximos ${cfg.dias} dias`}
          href="/reservas"
        />
        <CartaoTopo
          icone={<ListChecks className="size-5" />}
          rotulo="Próximas ações"
          valor={acoes.isLoading ? "…" : String(acoes.data?.resumo.comPendencia ?? 0)}
          nota={
            acoes.data
              ? `${acoes.data.resumo.atrasadas} atrasada${acoes.data.resumo.atrasadas === 1 ? "" : "s"} · ${acoes.data.resumo.hoje} hoje`
              : "carregando"
          }
          href="/operacao"
        />
        <CartaoTopo
          icone={<Coins className="size-5" />}
          rotulo={porAno ? "Faturamento no ano" : "Faturamento do mês"}
          valor={fin ? brl(porAno ? fin.ytd.faturamento : fin.operacional.faturamento) : "—"}
          nota={porAno ? `${ano} · competência` : "por competência"}
          href="/financeiro"
        />
        <CartaoTopo
          icone={<Wallet className="size-5" />}
          rotulo="A receber"
          valor={fin ? brl(fin.aReceber) : "—"}
          nota="saldo aberto dos contratos vigentes"
          href="/financeiro"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Próximas festas. */}
        <section className="painel-cartao p-4 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold" style={{ color: "var(--color-navy)" }}>Próximas festas</h2>
            <Link href="/reservas" className="text-xs font-medium" style={{ color: "var(--color-coral)" }}>
              Ver todas →
            </Link>
          </div>
          <p className="painel-periodo mt-0.5">a partir de hoje</p>
          {proximas.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nenhuma festa à frente.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {proximas.map((r) => (
                <li key={r.id} className="flex items-start gap-3">
                  <span className="shrink-0 text-center" style={{ minWidth: 34 }}>
                    <span className="block text-base font-semibold leading-none" style={{ color: "var(--color-navy)" }}>
                      {formatarDataDaFesta(r.eventDate).slice(0, 2)}
                    </span>
                    <span className="painel-periodo">
                      {ABREV[Number(formatarDataDaFesta(r.eventDate).slice(3, 5)) - 1]}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" style={{ color: "var(--color-navy)" }}>
                      {r.order.event.user.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}
                      {r.order.assembly ? " · com montagem" : ""}
                      {r.order.event.theme ? ` · ${r.order.event.theme.name}` : ""}
                    </span>
                  </span>
                  <span className="painel-periodo shrink-0">{STATUS_LABEL[r.status] ?? r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ações em destaque — os mesmos dados de Próximas ações, sem regra nova. */}
        <section className="painel-cartao p-4 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold" style={{ color: "var(--color-navy)" }}>Ações em destaque</h2>
            <Link href="/operacao" className="text-xs font-medium" style={{ color: "var(--color-coral)" }}>
              Ver todas →
            </Link>
          </div>
          <p className="painel-periodo mt-0.5">próximos 7 dias</p>
          {emDestaque.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nada pendente nos próximos dias.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {emDestaque.map((a) => (
                <li key={a.reservaId} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm" style={{ color: "var(--color-navy)" }}>
                      {a.etapa.titulo}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{a.cliente}</span>
                  </span>
                  <span
                    className="painel-periodo shrink-0 rounded px-1.5 py-0.5"
                    style={{
                      background: a.dias <= 0 ? "rgba(224,90,58,0.12)" : "rgba(27,46,75,0.06)",
                      color: a.dias <= 0 ? "#c4472a" : undefined,
                    }}
                  >
                    {a.dias <= 0 ? "hoje" : a.dias === 1 ? "amanhã" : `${a.dias} dias`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Identidade Festaê, em escala contida. */}
        <section
          className="flex flex-col justify-between rounded-xl p-5 lg:col-span-1"
          style={{ background: "var(--fin-navy, #1b2e4b)", color: "#eaf0f8" }}
        >
          <p className="painel-periodo" style={{ color: "var(--fin-gold, #c69654)" }}>
            Transformando momentos em grandes histórias
          </p>
          <p className="mt-3 text-xl font-semibold leading-snug">
            Cada festa<br />tem um propósito.
          </p>
          <p className="mt-2 text-sm text-white/70">
            Organização, criatividade e dados para o negócio crescer.
          </p>
          <span className="mt-4 h-0.5 w-12 rounded" style={{ background: "var(--fin-gold, #c69654)" }} />
        </section>
      </div>

      {/* Resumo financeiro. O detalhe continua no Financeiro. */}
      {fin && (
        <section className="painel-cartao p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold" style={{ color: "var(--color-navy)" }}>
              Resumo financeiro <span className="font-normal text-muted-foreground">— {rotuloPeriodo}</span>
            </h2>
            <Link href="/financeiro" className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: "var(--color-coral)" }}>
              Ver detalhes <ArrowRight className="size-3" />
            </Link>
          </div>
          {!porAno && cfg.dias !== null && (
            <p className="painel-periodo mt-0.5">
              o dinheiro é sempre apurado por mês — {rotuloPeriodo}
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Faturamento", porAno ? fin.ytd.faturamento : fin.operacional.faturamento],
              ["Despesas", porAno ? fin.ytd.despesas : fin.operacional.despesas],
              ["Resultado", porAno ? fin.ytd.resultado : fin.operacional.resultado],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string}>
                <p className="painel-periodo">{rotulo}</p>
                <p className="fin-numero mt-1 text-xl">{brl(valor as number)}</p>
              </div>
            ))}
            <div>
              <p className="painel-periodo">Margem</p>
              <p className="fin-numero mt-1 text-xl">
                {pct(porAno ? fin.ytd.margem : fin.operacional.margem)}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Resultado operacional: faturamento menos consumo e custeio. Acervo é investimento e não
            entra aqui.
          </p>
        </section>
      )}
    </div>
  );
}

function CartaoTopo({
  icone, rotulo, valor, nota, href,
}: {
  icone: React.ReactNode; rotulo: string; valor: string; nota: string; href: string;
}) {
  return (
    <Link href={href} className="painel-cartao flex items-center gap-3 p-4 transition-colors hover:bg-muted/30">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "rgba(224,90,58,0.09)", color: "var(--color-coral)" }}
      >
        {icone}
      </span>
      <span className="min-w-0">
        <span className="painel-periodo block">{rotulo}</span>
        <span
          className="block truncate text-xl font-semibold"
          style={{ color: "var(--color-navy)", fontVariantNumeric: "tabular-nums" }}
        >
          {valor}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{nota}</span>
      </span>
    </Link>
  );
}
