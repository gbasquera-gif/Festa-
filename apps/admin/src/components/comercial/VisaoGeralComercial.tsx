import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { mesEmChapeco } from "@festae/shared";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Rotulo } from "@/components/financeiro/pecas";
import { MESES, anosDisponiveis, brl, dia, nomeDoMes, pct } from "@/components/financeiro/formato";
import { DetalhePainel, type Detalhamento } from "@/components/financeiro/DetalheDoIndicador";

/**
 * A Visão Geral Comercial: o que foi vendido, para quando, e como.
 *
 * Só mostra o que o sistema registra com confiança: contrato, data da festa,
 * pagamento confirmado, tipo, atendimento, canal e o primeiro envio das
 * propostas. Nada de margem, ranking ou recomendação — um número que o dado
 * não sustenta é pior do que um espaço vazio, porque parece certo.
 *
 * Um filtro só manda em tudo (menos na carteira futura, que é "de hoje em
 * diante", e na sazonalidade, que é sempre os últimos doze meses — as duas
 * dizem isso no próprio título). Toda conta é do servidor; aqui só se desenha.
 */

type Taxa = { numerador: number; denominador: number; percentual: number | null; baseSuficiente: boolean };
type Fatia = { chave: string; rotulo: string; quantidade: number; participacao: number; valor: number };

type Visao = {
  periodo: { rotulo: string; meses: string[] };
  hoje: string;
  contratado: { valor: number; festas: number; confere: boolean };
  ticketMedio: { valor: number | null; contratos: number };
  festas: { total: number; realizadas: number; futuras: number };
  funil: {
    criadas: number;
    enviadas: number;
    aprovadas: number;
    convertidas: number;
    perdidasDeclaradas: number;
    expiradas: number;
    emAberto: number;
    semPrimeiroEnvio: number;
    aprovacao: Taxa;
    conversao: Taxa;
  };
  carteiraFutura: {
    de: string;
    ate: string;
    dias: number;
    contratado: number;
    festas: number;
    recebido: number;
    aReceber: number;
  };
  tiposDeFesta: Fatia[];
  atendimento: Fatia[];
  diasDaSemana: Fatia[];
  canais: Fatia[];
  sazonalidade: { mes: string; festas: number; contratado: number }[];
  ajustes: { negociadas: number; base: number; paraBaixo: number; paraCima: number };
};

type DetalheAberto = "CONTRATADO" | "FESTAS" | "CARTEIRA" | "PROPOSTAS";

const TODOS = "todos";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "2026-09" -> "set/26": cabe na coluna estreita da sazonalidade em 390px. */
function mesCurto(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  const nome = new Date(Date.UTC(ano, numero - 1, 1))
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  return `${nome}/${String(ano).slice(2)}`;
}

/** O dia anterior a um "AAAA-MM-DD" — a janela da carteira fecha antes de `ate`. */
function diaAnterior(d: string) {
  const data = new Date(`${d}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString();
}

/**
 * Uma taxa, do jeito honesto.
 *
 * Com menos de dez na base, 3 de 4 viraria "75%" — um número que parece
 * medir alguma coisa e só mede o acaso. Abaixo disso a tela diz a contagem.
 */
function textoDaTaxa(t: Taxa) {
  if (t.denominador === 0) return "sem base no período";
  if (t.percentual === null) return `${t.numerador} de ${t.denominador} · base ainda pequena`;
  return `${pct(t.percentual, 0)} · ${t.numerador} de ${t.denominador}`;
}

export function VisaoGeralComercial() {
  const { user } = useAuth();
  // Contratado e saldo são números do negócio: o servidor só os entrega a
  // ADMIN, como no Financeiro. OPS continua com Funil e Orçamentos.
  if (user && user.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        A visão geral comercial mostra valores do negócio e fica com a administração. Funil e
        Orçamentos seguem disponíveis nas abas ao lado.
      </p>
    );
  }
  return <Painel />;
}

function Painel() {
  const hojeEmChapeco = mesEmChapeco(new Date());
  const [ano, setAno] = useState(Number(hojeEmChapeco.slice(0, 4)));
  const [mesNumero, setMesNumero] = useState(hojeEmChapeco.slice(5, 7));
  const [detalhe, setDetalhe] = useState<DetalheAberto | null>(null);

  const mes = mesNumero === TODOS ? TODOS : `${ano}-${mesNumero}`;
  const rotuloDoPeriodo = mes === TODOS ? `${ano}, todos os meses` : nomeDoMes(mes);

  const { data, isLoading, error } = useQuery<Visao>({
    queryKey: ["comercial", "visao-geral", ano, mes],
    queryFn: () => api(`/comercial/visao-geral?ano=${ano}&mes=${mes}`),
  });

  return (
    <div className="financeiro comercial space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm" style={{ color: "var(--fin-muted)" }}>
          Festas pelo mês em que acontecem. Canceladas não entram em número nenhum.
        </p>
        <div className="flex items-center gap-2">
          <span className="fin-rotulo">Período</span>
          <select
            id="comercial-ano"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            aria-label="Ano"
            className="h-11 rounded-md border bg-background px-3 text-sm"
          >
            {anosDisponiveis().map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            id="comercial-mes"
            value={mesNumero}
            onChange={(e) => setMesNumero(e.target.value)}
            aria-label="Mês"
            className="h-11 rounded-md border bg-background px-3 text-sm"
          >
            <option value={TODOS}>Todos os meses</option>
            {MESES.map((m) => (
              <option key={m} value={m}>
                {nomeDoMes(`${ano}-${m}`).replace(` de ${ano}`, "")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Apurando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível apurar este período.</p>}

      {data && (
        <>
          {!data.contratado.confere && (
            <p className="rounded-md border p-3 text-sm text-destructive" style={{ borderColor: "var(--fin-coral)" }}>
              O contratado não fechou com a soma dos contratos. Não use estes números até conferir.
            </p>
          )}

          {/* Linha 1 — os quatro números. */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              rotulo="Contratado"
              valor={brl(data.contratado.valor)}
              nota={`${plural(data.contratado.festas, "festa", "festas")} · ${rotuloDoPeriodo}`}
              aoAbrir={() => setDetalhe("CONTRATADO")}
            />
            <Kpi
              rotulo="Ticket médio"
              valor={data.ticketMedio.valor === null ? "—" : brl(data.ticketMedio.valor)}
              nota={
                data.ticketMedio.contratos === 0
                  ? "nenhuma festa no período"
                  : `contratado ÷ ${plural(data.ticketMedio.contratos, "festa", "festas")}`
              }
            />
            <Kpi
              rotulo="Festas"
              valor={String(data.festas.total)}
              nota={`${plural(data.festas.realizadas, "realizada", "realizadas")} · ${plural(data.festas.futuras, "futura", "futuras")}`}
              aoAbrir={() => setDetalhe("FESTAS")}
            />
            <Kpi
              rotulo="Propostas"
              valor={`${data.funil.enviadas} → ${data.funil.aprovadas}`}
              nota={
                <>
                  {plural(data.funil.enviadas, "enviada", "enviadas")} →{" "}
                  {plural(data.funil.aprovadas, "aprovada", "aprovadas")}
                  <br />
                  {data.funil.convertidas} convertida{data.funil.convertidas === 1 ? "" : "s"} em reserva
                </>
              }
              aoAbrir={() => setDetalhe("PROPOSTAS")}
            />
          </div>

          {/* Linha 2 — funil e carteira futura. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Bloco titulo="Funil de propostas" subtitulo={`primeiro envio em ${rotuloDoPeriodo}`}>
              <Funil funil={data.funil} />
            </Bloco>
            <Bloco
              titulo="Carteira futura"
              subtitulo={`${dia(`${data.carteiraFutura.de}T12:00:00.000Z`)} a ${dia(diaAnterior(data.carteiraFutura.ate))} · não segue o filtro`}
            >
              <CarteiraFutura carteira={data.carteiraFutura} aoAbrir={() => setDetalhe("CARTEIRA")} />
            </Bloco>
          </div>

          {/* Linha 3 — o que se vende e como se entrega. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Bloco titulo="Tipos de festa" subtitulo={`n = ${data.festas.total}`}>
              <Barras fatias={data.tiposDeFesta} vazio="Nenhuma festa no período." />
            </Bloco>
            <Bloco titulo="Modelo de atendimento" subtitulo={`n = ${data.festas.total}`}>
              <Barras fatias={data.atendimento} vazio="Nenhuma festa no período." semBase={data.festas.total === 0} />
            </Bloco>
          </div>

          {/* Linha 4 — quando e por onde. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Bloco titulo="Dia da semana da festa" subtitulo={`n = ${data.festas.total}`}>
              <Barras fatias={data.diasDaSemana} vazio="Nenhuma festa no período." semBase={data.festas.total === 0} />
            </Bloco>
            <Bloco titulo="Canal de venda" subtitulo={`n = ${data.festas.total}`}>
              <Barras fatias={data.canais} comValor vazio="Nenhuma festa no período." />
              {data.canais.some((c) => c.chave === "HISTORICO_SEM_CANAL") && (
                <p className="mt-3 text-xs" style={{ color: "var(--fin-muted)" }}>
                  Histórico sem canal: contratos trazidos do painel antigo, que não registrava por
                  onde a venda entrou. Não são “Outros”.
                </p>
              )}
            </Bloco>
          </div>

          {/* Linha 5 — sazonalidade, sempre os últimos doze meses. */}
          <Bloco titulo="Sazonalidade" subtitulo="últimos 12 meses · não segue o filtro">
            <Sazonalidade meses={data.sazonalidade} />
          </Bloco>

          {/* Linha 6 — ajustes comerciais. */}
          <Bloco titulo="Ajustes comerciais" subtitulo={`propostas com primeiro envio em ${rotuloDoPeriodo}`}>
            <Ajustes ajustes={data.ajustes} />
          </Bloco>
        </>
      )}

      {detalhe && detalhe !== "PROPOSTAS" && (
        <DetalheDoKpi tipo={detalhe} ano={ano} mes={mes} rotuloDoPeriodo={rotuloDoPeriodo} aoFechar={() => setDetalhe(null)} />
      )}
      {detalhe === "PROPOSTAS" && (
        <DetalheDasPropostas ano={ano} mes={mes} rotuloDoPeriodo={rotuloDoPeriodo} aoFechar={() => setDetalhe(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- peças

function Kpi({
  rotulo,
  valor,
  nota,
  aoAbrir,
}: {
  rotulo: string;
  valor: string;
  nota: ReactNode;
  aoAbrir?: () => void;
}) {
  return (
    <div className="fin-cartao">
      <Rotulo>{rotulo}</Rotulo>
      {aoAbrir ? (
        <button
          type="button"
          onClick={aoAbrir}
          className="fin-numero fin-explicavel mt-1 block text-[1.45rem] leading-tight"
          title={`Ver de onde vem: ${rotulo}`}
        >
          {valor}
        </button>
      ) : (
        <p className="fin-numero mt-1 text-[1.45rem] leading-tight">{valor}</p>
      )}
      <p className="mt-1 text-xs" style={{ color: "var(--fin-muted)" }}>{nota}</p>
    </div>
  );
}

function Bloco({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <section className="fin-cartao min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h2 className="text-sm font-semibold" style={{ color: "var(--fin-navy-ink)" }}>{titulo}</h2>
        {subtitulo && <span className="fin-rotulo">{subtitulo}</span>}
      </div>
      {children}
    </section>
  );
}

/** Barras horizontais: rótulo, barra proporcional à maior fatia, contagem e participação. */
function Barras({
  fatias,
  comValor,
  vazio,
  semBase,
}: {
  fatias: Fatia[];
  comValor?: boolean;
  vazio: string;
  /** Distribuições com ordem fixa trazem as chaves com zero; sem festa, mostram o vazio. */
  semBase?: boolean;
}) {
  if (fatias.length === 0 || semBase) {
    return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>{vazio}</p>;
  }
  const maior = Math.max(...fatias.map((f) => f.quantidade), 1);
  return (
    <ul className="com-barras">
      {fatias.map((f) => (
        <li key={f.chave}>
          <span className="com-barras-rotulo">{f.rotulo}</span>
          <span className="com-barras-trilho" aria-hidden>
            <i style={{ width: `${(f.quantidade / maior) * 100}%` }} />
          </span>
          <span className="com-barras-valor">
            {f.quantidade} · {pct(f.participacao, 0)}
            {comValor && <small>{brl(f.valor)}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Funil({ funil }: { funil: Visao["funil"] }) {
  const passos = [
    { rotulo: "Criadas", valor: funil.criadas, nota: "no período" },
    { rotulo: "Enviadas", valor: funil.enviadas, nota: "primeiro envio" },
    { rotulo: "Aprovadas", valor: funil.aprovadas, nota: "da coorte" },
    { rotulo: "Convertidas", valor: funil.convertidas, nota: "em reserva" },
  ];
  const maior = Math.max(...passos.map((p) => p.valor), 1);

  return (
    <div className="space-y-4">
      <ul className="com-barras">
        {passos.map((p) => (
          <li key={p.rotulo}>
            <span className="com-barras-rotulo">
              {p.rotulo}
              <small>{p.nota}</small>
            </span>
            <span className="com-barras-trilho" aria-hidden>
              <i style={{ width: `${(p.valor / maior) * 100}%` }} />
            </span>
            <span className="com-barras-valor">{p.valor}</span>
          </li>
        ))}
      </ul>

      <dl className="com-pares">
        <div>
          <dt>Enviada → aprovada</dt>
          <dd>{textoDaTaxa(funil.aprovacao)}</dd>
        </div>
        <div>
          <dt>Aprovada → reserva</dt>
          <dd>{textoDaTaxa(funil.conversao)}</dd>
        </div>
      </dl>

      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        Das {plural(funil.enviadas, "enviada", "enviadas")}: {funil.aprovadas} aprovada
        {funil.aprovadas === 1 ? "" : "s"} · {funil.perdidasDeclaradas} perdida
        {funil.perdidasDeclaradas === 1 ? "" : "s"} (declarada{funil.perdidasDeclaradas === 1 ? "" : "s"}) ·{" "}
        {funil.expiradas} expirada{funil.expiradas === 1 ? "" : "s"} · {funil.emAberto} em aberto.
      </p>
      {funil.semPrimeiroEnvio > 0 && (
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          {plural(funil.semPrimeiroEnvio, "proposta antiga", "propostas antigas")} sem primeiro envio
          rastreável {funil.semPrimeiroEnvio === 1 ? "ficou excluída" : "ficaram excluídas"} da conversão.
        </p>
      )}
    </div>
  );
}

function CarteiraFutura({ carteira, aoAbrir }: { carteira: Visao["carteiraFutura"]; aoAbrir: () => void }) {
  if (carteira.festas === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
        Nenhuma festa contratada para os próximos {carteira.dias} dias.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <button type="button" onClick={aoAbrir} className="fin-numero fin-explicavel block text-[1.45rem] leading-tight"
        title="Ver os contratos da carteira futura">
        {brl(carteira.contratado)}
      </button>
      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        contratado em {plural(carteira.festas, "festa", "festas")} nos próximos {carteira.dias} dias
      </p>
      <dl className="com-pares">
        <div>
          <dt>Recebido</dt>
          <dd>{brl(carteira.recebido)}</dd>
        </div>
        <div>
          <dt>Saldo a receber</dt>
          <dd style={{ color: "var(--fin-coral-dark)" }}>{brl(carteira.aReceber)}</dd>
        </div>
      </dl>
      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        Recebido conta só pagamento confirmado. Não é previsão de caixa: é o que está contratado para
        festas dessas datas.
      </p>
    </div>
  );
}

/** Uma linha por mês. Barra = festas; o valor contratado vai escrito ao lado, sem segundo eixo. */
function Sazonalidade({ meses }: { meses: Visao["sazonalidade"] }) {
  if (meses.every((m) => m.festas === 0)) {
    return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Nenhuma festa nos últimos doze meses.</p>;
  }
  const maior = Math.max(...meses.map((m) => m.festas), 1);
  return (
    <ul className="com-barras com-sazonal">
      {meses.map((m) => (
        <li key={m.mes} title={`${nomeDoMes(m.mes)}: ${plural(m.festas, "festa", "festas")}, ${brl(m.contratado)} contratado`}>
          <span className="com-barras-rotulo">{mesCurto(m.mes)}</span>
          <span className="com-barras-trilho" aria-hidden>
            <i style={{ width: `${(m.festas / maior) * 100}%` }} />
          </span>
          <span className="com-barras-valor">
            {plural(m.festas, "festa", "festas")}
            <small>{brl(m.contratado)}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Ajustes({ ajustes }: { ajustes: Visao["ajustes"] }) {
  if (ajustes.base === 0) {
    return <p className="text-sm" style={{ color: "var(--fin-muted)" }}>Nenhuma proposta enviada no período.</p>;
  }
  return (
    <div className="space-y-3">
      <dl className="com-pares com-pares-3">
        <div>
          <dt>Com valor negociado</dt>
          <dd>{ajustes.negociadas} de {ajustes.base}</dd>
        </div>
        <div>
          <dt>Ajustes para baixo</dt>
          <dd>{brl(ajustes.paraBaixo)}</dd>
        </div>
        <div>
          <dt>Ajustes para cima</dt>
          <dd>{brl(ajustes.paraCima)}</dd>
        </div>
      </dl>
      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        Diferença entre a composição da proposta e o valor final combinado, somada separadamente
        para cada lado.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- drill-down

const TITULO_DO_DETALHE = {
  CONTRATADO: {
    tipo: "FATURAMENTO",
    titulo: "Contratado",
    explicacao:
      "As festas vigentes cuja data cai no período. Competência pela data da festa, não pela data em que o contrato foi fechado.",
    vazio: "Nenhuma festa neste período.",
  },
  FESTAS: {
    tipo: "FESTAS",
    titulo: "Festas",
    explicacao: "As festas vigentes cuja data cai no período. Canceladas não entram.",
    vazio: "Nenhuma festa neste período.",
  },
  CARTEIRA: {
    tipo: "A_RECEBER",
    titulo: "Carteira futura",
    explicacao:
      "Festas vigentes de hoje até 30 dias à frente, com o que já foi pago (só pagamento confirmado) e o saldo. Não segue o filtro de período.",
    vazio: "Nenhuma festa contratada para os próximos 30 dias.",
  },
} as const;

function DetalheDoKpi({
  tipo,
  ano,
  mes,
  rotuloDoPeriodo,
  aoFechar,
}: {
  tipo: Exclude<DetalheAberto, "PROPOSTAS">;
  ano: number;
  mes: string;
  rotuloDoPeriodo: string;
  aoFechar: () => void;
}) {
  const { data, isLoading, error } = useQuery<Detalhamento>({
    queryKey: ["comercial", "detalhe", tipo, ano, mes],
    queryFn: () => api(`/comercial/detalhe?tipo=${tipo}&ano=${ano}&mes=${mes}`),
  });
  const config = TITULO_DO_DETALHE[tipo];
  return (
    <DetalhePainel
      tipo={config.tipo}
      titulo={config.titulo}
      explicacao={config.explicacao}
      vazio={config.vazio}
      periodo={tipo === "CARTEIRA" ? "próximos 30 dias" : rotuloDoPeriodo}
      dados={data}
      carregando={isLoading}
      erro={Boolean(error)}
      aoFechar={aoFechar}
    />
  );
}

type PropostaDaCoorte = {
  id: string;
  numero: number;
  cliente: string;
  primeiroEnvioEm: string | null;
  situacao: string;
  total: number;
};

/** O envio é um instante, não um dia de festa: lê-se no relógio de Chapecó. */
const diaDoEnvio = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

const SITUACAO_DA_PROPOSTA: Record<string, string> = {
  ENVIADO: "Em aberto",
  APROVADO: "Aprovada",
  CONVERTIDA: "Convertida em reserva",
  RECUSADO: "Perdida",
  EXPIRADO: "Expirada",
  RASCUNHO: "Rascunho",
};

function DetalheDasPropostas({
  ano,
  mes,
  rotuloDoPeriodo,
  aoFechar,
}: {
  ano: number;
  mes: string;
  rotuloDoPeriodo: string;
  aoFechar: () => void;
}) {
  const { data, isLoading, error } = useQuery<{ propostas: PropostaDaCoorte[]; confere: boolean }>({
    queryKey: ["comercial", "detalhe", "PROPOSTAS", ano, mes],
    queryFn: () => api(`/comercial/detalhe?tipo=PROPOSTAS&ano=${ano}&mes=${mes}`),
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent
        className="financeiro max-h-[92dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--fin-line)" }}>
          <div className="min-w-0">
            <DialogTitle className="text-base font-medium" style={{ color: "var(--fin-navy-ink)" }}>
              Propostas <span className="font-normal" style={{ color: "var(--fin-muted)" }}>— {rotuloDoPeriodo}</span>
            </DialogTitle>
            <p className="mt-1 max-w-xl text-xs" style={{ color: "var(--fin-muted)" }}>
              As propostas cujo primeiro envio caiu no período, e onde cada uma está hoje. São a base
              do funil e dos ajustes comerciais.
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar detalhamento" className="-m-1 shrink-0 rounded p-1"
            style={{ color: "var(--fin-muted)" }}>
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {isLoading && <p className="p-5 text-sm" style={{ color: "var(--fin-muted)" }}>Apurando…</p>}
          {error && <p className="p-5 text-sm text-destructive">Não foi possível abrir o detalhamento.</p>}
          {data && data.propostas.length === 0 && (
            <p className="p-5 text-sm" style={{ color: "var(--fin-muted)" }}>Nenhuma proposta enviada neste período.</p>
          )}
          {data && data.propostas.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "var(--fin-line)" }}>
              {data.propostas.map((p) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm" style={{ color: "var(--fin-navy-ink)" }}>{p.cliente}</span>
                    <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
                      nº {p.numero} · enviada em {diaDoEnvio(p.primeiroEnvioEm)} · {SITUACAO_DA_PROPOSTA[p.situacao] ?? p.situacao}
                    </span>
                  </span>
                  <span className="fin-numero shrink-0 text-sm">{brl(p.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data && (
          <div className="border-t p-4 sm:p-5" style={{ borderColor: "var(--fin-line)", background: "var(--fin-cream)" }}>
            <span className="painel-periodo block">Propostas enviadas no período</span>
            <span className="fin-numero" style={{ fontSize: "1.25rem" }}>{data.propostas.length}</span>
            {!data.confere && (
              <p className="mt-3 text-xs text-destructive">
                Atenção: a lista não fechou com o indicador. Não use estes números até conferir.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
