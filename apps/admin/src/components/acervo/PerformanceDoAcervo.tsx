import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import {
  CONTEXTO_DO_CONFLITO_LABEL,
  JANELAS_DO_ACERVO,
  JANELA_PADRAO_DO_ACERVO,
  ORIGEM_NO_PEDIDO_LABEL,
  formatarDataDaFesta,
  type JanelaDoAcervo,
  type OrigemNoPedido,
} from "@festae/shared";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFiltroNaUrl } from "@/lib/filtro-na-url";
import { Rotulo } from "@/components/financeiro/pecas";
import { brl, pct } from "@/components/financeiro/formato";

/**
 * Acervo → Performance: das peças que a Festaê tem, quais estão trabalhando,
 * quais estão paradas e onde a capacidade está apertando.
 *
 * Toda conta é do servidor (`/acervo/performance`). A tela não decide o que
 * é uso de um produto, o que é contrato associado nem o que está
 * comprometido — só desenha e filtra a lista que recebeu.
 *
 * Valor é sempre o do contrato inteiro em que a peça esteve. Não é receita
 * da peça, e a tela nunca diz que é.
 */

type LinhaDoProduto = {
  productId: string;
  nome: string;
  ativo: boolean;
  estoque: number;
  festas: number;
  quantidade: number;
  contratos: number;
  ultimaUtilizacao: string | null;
  proximaUtilizacao: string | null;
  conflitos: number;
  semUsoRecente: boolean;
  nuncaUtilizado: boolean;
};

type RegistroDeConflito = {
  registradoEm: string;
  dataDaFesta: string | null;
  solicitado: number | null;
  disponivel: number | null;
  contexto: string | null;
};

type Performance = {
  hoje: string;
  periodo: { dias: number; de: string; ate: string };
  kpis: {
    produtosAtivos: number;
    produtosUtilizados: number;
    semUsoRecente: { total: number; nunca: number; dias: number; determinavel: boolean; festasSemComposicao: number };
    contratos: { valor: number; festas: number };
    conflitos: number;
  };
  produtos: LinhaDoProduto[];
  festasSemComposicaoHistorica: number;
  pressao: {
    de: string;
    ate: string;
    dias: number;
    produtos: {
      productId: string;
      nome: string;
      estoque: number;
      pico: number;
      dataDoPico: string;
      percentual: number | null;
      acimaDoEstoque: boolean;
      proximas: { data: string; quantidade: number }[];
    }[];
  };
  conflitos: {
    total: number;
    porProduto: { productId: string | null; nome: string; total: number; registros: RegistroDeConflito[] }[];
  };
  kits: { kitId: string; nome: string; festas: number; contratos: number }[];
  festasSemKit: number;
  temas: { temaId: string | null; nome: string; festas: number; contratos: number }[];
  cobertura: { festas: number; rastreaveis: number; kitSemSnapshot: number; semItensRegistrados: number };
};

type Detalhe = {
  produto: LinhaDoProduto;
  periodo: { dias: number; de: string; ate: string };
  festas: { reservaId: string; numero: number; data: string; cliente: string; quantidade: number; origem: OrigemNoPedido; valor: number }[];
  totais: { festas: number; quantidade: number; contratos: number };
  conflitos: RegistroDeConflito[];
  confere: boolean;
};

const FILTROS = ["TODOS", "UTILIZADOS", "SEM_USO", "NUNCA", "CONFLITO"] as const;
type Filtro = (typeof FILTROS)[number];

const ORDENS = ["MAIS_FESTAS", "MENOS_FESTAS", "MAIS_TEMPO_SEM_USO", "MAIS_CONFLITOS", "MAIOR_VALOR"] as const;
type Ordem = (typeof ORDENS)[number];
const ORDEM_LABEL: Record<Ordem, string> = {
  MAIS_FESTAS: "Mais festas",
  MENOS_FESTAS: "Menos festas",
  MAIS_TEMPO_SEM_USO: "Maior tempo sem uso",
  MAIS_CONFLITOS: "Mais conflitos",
  MAIOR_VALOR: "Maior valor de contratos",
};

const JANELAS_TEXTO = JANELAS_DO_ACERVO.map(String);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const data = (dia: string | null, vazio = "—") => (dia ? formatarDataDaFesta(dia) : vazio);
const dataCurta = (dia: string) => formatarDataDaFesta(dia).slice(0, 5);
const cinza = { color: "var(--fin-muted)" };

export function PerformanceDoAcervo() {
  const { user } = useAuth();
  // Valor de contrato é número do negócio: o servidor só entrega a ADMIN.
  if (user && user.role !== "ADMIN") {
    return (
      <p className="text-sm text-muted-foreground">
        A performance do acervo mostra valores de contrato e fica com a administração. Temas,
        Produtos e Kits seguem disponíveis nas abas ao lado.
      </p>
    );
  }
  return <Painel />;
}

function Painel() {
  const [janelaTexto, setJanela] = useFiltroNaUrl<string>("periodo", String(JANELA_PADRAO_DO_ACERVO), JANELAS_TEXTO);
  const janela = Number(janelaTexto) as JanelaDoAcervo;
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: dados, isLoading, error } = useQuery<Performance>({
    queryKey: ["acervo", "performance", janela],
    queryFn: () => api(`/acervo/performance?periodo=${janela}`),
  });

  return (
    <div className="financeiro comercial space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm" style={cinza}>
          Uso pelas festas que já aconteceram; compromisso pelas que vêm. Canceladas não entram.
        </p>
        <div className="flex items-center gap-2">
          <span className="fin-rotulo">Últimos</span>
          <div className="acv-segmento" role="group" aria-label="Período">
            {JANELAS_DO_ACERVO.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={janela === d}
                onClick={() => setJanela(String(d))}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm" style={cinza}>Apurando…</p>}
      {error && <p className="text-sm text-destructive">Não foi possível apurar a performance do acervo.</p>}

      {dados && (
        <>
          <Kpis dados={dados} />

          <Bloco
            titulo="Performance por produto"
            subtitulo={`festas de ${data(dados.periodo.de)} a ${data(dados.periodo.ate)}`}
          >
            {dados.festasSemComposicaoHistorica > 0 && (
              <p className="mb-3 text-xs" style={cinza}>
                {plural(dados.festasSemComposicaoHistorica, "festa antiga com kit não possui", "festas antigas com kit não possuem")}{" "}
                composição histórica congelada e não {dados.festasSemComposicaoHistorica === 1 ? "entra" : "entram"} na
                análise por produto.
              </p>
            )}
            <TabelaDeProdutos
              linhas={dados.produtos}
              determinavel={dados.kpis.semUsoRecente.determinavel}
              aoAbrir={setAberto}
            />
          </Bloco>

          <div className="grid gap-3 lg:grid-cols-2">
            <Bloco titulo="Pressão futura do acervo" subtitulo={`próximos ${dados.pressao.dias} dias · compromisso, não uso`}>
              <Pressao pressao={dados.pressao} />
            </Bloco>
            <Bloco titulo="Conflitos registrados" subtitulo={`últimos ${dados.periodo.dias} dias`}>
              <Conflitos conflitos={dados.conflitos} />
            </Bloco>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Bloco titulo="Kits mais utilizados" subtitulo={`n = ${dados.cobertura.festas}`}>
              <ListaComValor
                linhas={dados.kits.map((k) => ({ chave: k.kitId, nome: k.nome, festas: k.festas, contratos: k.contratos }))}
                vazio="Nenhuma festa com kit no período."
              />
              {dados.festasSemKit > 0 && dados.kits.length > 0 && (
                <p className="mt-3 text-xs" style={cinza}>
                  {plural(dados.festasSemKit, "festa sem kit", "festas sem kit")} no período.
                </p>
              )}
            </Bloco>
            <Bloco titulo="Temas utilizados" subtitulo={`n = ${dados.cobertura.festas}`}>
              <ListaComValor
                linhas={dados.temas.map((t) => ({ chave: t.temaId ?? "sem-tema", nome: t.nome, festas: t.festas, contratos: t.contratos }))}
                vazio="Nenhuma festa no período."
              />
            </Bloco>
          </div>

          <Cobertura cobertura={dados.cobertura} dias={dados.periodo.dias} />
        </>
      )}

      {aberto && <DetalheDoProduto productId={aberto} janela={janela} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- KPIs

function Kpis({ dados }: { dados: Performance }) {
  const { kpis, cobertura } = dados;
  const desconhecidas = cobertura.kitSemSnapshot + cobertura.semItensRegistrados;
  const semUso = kpis.semUsoRecente;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        rotulo="Produtos utilizados"
        valor={`${kpis.produtosUtilizados} de ${kpis.produtosAtivos}`}
        nota={
          <>
            {kpis.produtosAtivos > 0 ? `${pct(kpis.produtosUtilizados / kpis.produtosAtivos, 0)} do acervo ativo` : "nenhum produto ativo"}
            {desconhecidas > 0 && (
              <>
                <br />
                {plural(desconhecidas, "festa do período sem composição rastreável", "festas do período sem composição rastreável")}
              </>
            )}
          </>
        }
      />
      {semUso.determinavel ? (
        <Kpi
          rotulo={`Sem uso há ${semUso.dias}+ dias`}
          valor={String(semUso.total)}
          nota={`${plural(semUso.nunca, "nunca utilizado", "nunca utilizados")} · produtos ativos`}
        />
      ) : (
        // Cobertura insuficiente não é erro: é o dado ainda se formando. O
        // card volta a ser "Sem uso há 90+ dias" sozinho quando o servidor
        // disser que dá para afirmar.
        <Kpi
          rotulo="Uso recente ainda em consolidação"
          valor="—"
          nota={
            <>
              {semUso.festasSemComposicao === 1
                ? `1 festa dos últimos ${semUso.dias} dias não possui composição histórica rastreável.`
                : `${semUso.festasSemComposicao} festas dos últimos ${semUso.dias} dias não possuem composição histórica rastreável.`}
              <br />
              Enquanto houver festas desse período sem snapshot, o sistema não afirma quais peças ficaram sem uso.
            </>
          }
        />
      )}
      <Kpi
        rotulo="Contratos associados"
        valor={brl(kpis.contratos.valor)}
        nota={`em contratos com acervo rastreável · ${plural(kpis.contratos.festas, "festa", "festas")}`}
      />
      <Kpi
        rotulo="Conflitos registrados"
        valor={String(kpis.conflitos)}
        nota={
          <>
            {kpis.conflitos === 1 ? "conflito de disponibilidade" : "conflitos de disponibilidade"}
            <br />
            Considera apenas conflitos registrados desde que o monitoramento foi ativado.
          </>
        }
      />
    </div>
  );
}

function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: ReactNode }) {
  return (
    <div className="fin-cartao">
      <Rotulo>{rotulo}</Rotulo>
      <p className="fin-numero mt-1 text-[1.45rem] leading-tight">{valor}</p>
      <p className="mt-1 text-xs" style={cinza}>{nota}</p>
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

// ---------------------------------------------------------------- tabela

function TabelaDeProdutos({
  linhas,
  determinavel,
  aoAbrir,
}: {
  linhas: LinhaDoProduto[];
  determinavel: boolean;
  aoAbrir: (id: string) => void;
}) {
  const [busca, setBusca] = useFiltroNaUrl<string>("busca", "");
  const [filtro, setFiltro] = useFiltroNaUrl<Filtro>("filtro", "TODOS", FILTROS);
  const [ordem, setOrdem] = useFiltroNaUrl<Ordem>("ordem", "MAIS_FESTAS", ORDENS);

  // Sem cobertura completa, a tela diz "sem uso registrado", e não "sem uso".
  const rotuloDoFiltro: Record<Filtro, string> = {
    TODOS: "Todos",
    UTILIZADOS: "Utilizados",
    SEM_USO: determinavel ? "Sem uso há 90+ dias" : "Sem uso registrado há 90+ dias",
    NUNCA: determinavel ? "Nunca utilizados" : "Nunca registrados",
    CONFLITO: "Com conflito registrado",
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const filtradas = linhas.filter((l) => {
      if (termo && !l.nome.toLocaleLowerCase("pt-BR").includes(termo)) return false;
      if (filtro === "UTILIZADOS") return l.festas > 0;
      if (filtro === "SEM_USO") return l.semUsoRecente;
      if (filtro === "NUNCA") return l.nuncaUtilizado;
      if (filtro === "CONFLITO") return l.conflitos > 0;
      return true;
    });
    const nome = (a: LinhaDoProduto, b: LinhaDoProduto) => a.nome.localeCompare(b.nome, "pt-BR");
    const comparar: Record<Ordem, (a: LinhaDoProduto, b: LinhaDoProduto) => number> = {
      MAIS_FESTAS: (a, b) => b.festas - a.festas || nome(a, b),
      MENOS_FESTAS: (a, b) => a.festas - b.festas || nome(a, b),
      // Nunca registrado vem antes de qualquer data; depois, a data mais antiga.
      MAIS_TEMPO_SEM_USO: (a, b) => (a.ultimaUtilizacao ?? "").localeCompare(b.ultimaUtilizacao ?? "") || nome(a, b),
      MAIS_CONFLITOS: (a, b) => b.conflitos - a.conflitos || nome(a, b),
      MAIOR_VALOR: (a, b) => b.contratos - a.contratos || nome(a, b),
    };
    return [...filtradas].sort(comparar[ordem]);
  }, [linhas, busca, filtro, ordem]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={cinza} aria-hidden />
          <input
            id="acervo-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto"
            aria-label="Buscar produto"
            className="h-11 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
          />
        </label>
        <select
          id="acervo-ordem"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          aria-label="Ordenar por"
          className="h-11 min-w-0 rounded-md border bg-background px-3 text-sm"
        >
          {ORDENS.map((o) => (
            <option key={o} value={o}>{ORDEM_LABEL[o]}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar produtos">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filtro === f}
            onClick={() => setFiltro(f)}
            className="acv-filtro"
          >
            {rotuloDoFiltro[f]}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="py-4 text-sm" style={cinza}>
          {linhas.length === 0 ? "Nenhum produto ativo no acervo." : "Nenhum produto neste filtro."}
        </p>
      ) : (
        <>
          {/* Computador: tabela, onde número compara com número. */}
          <div className="hidden lg:block">
            <table className="fin-tabela acv-tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Estoque</th>
                  <th className="num">Festas</th>
                  <th className="num">Qtd. utilizada</th>
                  <th>Última utilização</th>
                  <th>Próxima utilização</th>
                  <th className="num">Contratos associados</th>
                  <th className="num">Conflitos</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.productId} onClick={() => aoAbrir(l.productId)} className="acv-linha">
                    <td>
                      <button type="button" className="acv-nome" onClick={(e) => { e.stopPropagation(); aoAbrir(l.productId); }}>
                        {l.nome}
                      </button>
                      {!l.ativo && <span className="acv-etiqueta">inativo</span>}
                    </td>
                    <td className="num">{l.estoque}</td>
                    <td className="num">{l.festas}</td>
                    <td className="num">{l.quantidade}</td>
                    <td style={l.ultimaUtilizacao ? undefined : cinza}>{data(l.ultimaUtilizacao, "Nunca registrado")}</td>
                    <td style={l.proximaUtilizacao ? undefined : cinza}>{data(l.proximaUtilizacao)}</td>
                    <td className="num">{l.festas > 0 ? brl(l.contratos) : "—"}</td>
                    <td className="num" style={l.conflitos > 0 ? { color: "var(--fin-coral-dark)" } : cinza}>{l.conflitos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular e tablet: uma linha por produto, sem tabela espremida. */}
          <ul className="divide-y lg:hidden" style={{ borderColor: "var(--fin-line)" }}>
            {visiveis.map((l) => (
              <li key={l.productId}>
                <button type="button" onClick={() => aoAbrir(l.productId)} className="acv-cartao">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm font-medium" style={{ color: "var(--fin-navy-ink)" }}>
                      {l.nome}
                      {!l.ativo && <span className="acv-etiqueta">inativo</span>}
                    </span>
                    <span className="fin-numero shrink-0 text-sm">{plural(l.festas, "festa", "festas")}</span>
                  </span>
                  <span className="mt-1 block text-xs" style={cinza}>
                    {l.festas > 0
                      ? `${l.quantidade} ${l.quantidade === 1 ? "peça" : "peças"} · ${brl(l.contratos)} em contratos associados`
                      : "Sem festa no período"}
                    {` · estoque ${l.estoque}`}
                  </span>
                  <span className="mt-0.5 block text-xs" style={cinza}>
                    Última: {data(l.ultimaUtilizacao, "nunca registrada")} · Próxima: {data(l.proximaUtilizacao)}
                    {l.conflitos > 0 && (
                      <span style={{ color: "var(--fin-coral-dark)" }}> · {plural(l.conflitos, "conflito", "conflitos")}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs" style={cinza}>
        {plural(visiveis.length, "produto", "produtos")} · festas, quantidade e contratos associados são do período;
        o valor é o do contrato inteiro em que a peça esteve, não receita da peça.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- pressão futura

function Pressao({ pressao }: { pressao: Performance["pressao"] }) {
  const [todos, setTodos] = useState(false);
  if (pressao.produtos.length === 0) {
    return <p className="text-sm" style={cinza}>Nenhuma peça comprometida nos próximos {pressao.dias} dias.</p>;
  }
  const lista = todos ? pressao.produtos : pressao.produtos.slice(0, 6);
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {lista.map((p) => {
          const largura = p.estoque > 0 ? Math.min(100, (p.pico / p.estoque) * 100) : 100;
          return (
            <li key={p.productId} className="min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 text-sm" style={{ color: "var(--fin-navy-ink)" }}>{p.nome}</span>
                <span className="fin-numero text-xs" style={p.acimaDoEstoque ? { color: "var(--fin-coral-dark)" } : cinza}>
                  {p.percentual === null ? "sem estoque" : pct(p.percentual, 0)} · pico em {dataCurta(p.dataDoPico)}
                </span>
              </div>
              <span className="com-barras-trilho mt-1.5" aria-hidden>
                <i style={{ width: `${largura}%`, background: p.acimaDoEstoque ? "var(--fin-coral)" : "var(--fin-navy)" }} />
              </span>
              <p className="mt-1 text-xs" style={cinza}>
                {p.pico} de {p.estoque} {p.estoque === 1 ? "peça" : "peças"} comprometida{p.pico === 1 ? "" : "s"}
                {" · "}próximas: {p.proximas.map((d) => `${dataCurta(d.data)} (${d.quantidade})`).join(", ")}
              </p>
              {p.acimaDoEstoque && (
                <p className="mt-1 text-xs" style={{ color: "var(--fin-coral-dark)" }}>
                  Inconsistência: {p.pico} comprometida{p.pico === 1 ? "" : "s"} para {p.estoque} em estoque em{" "}
                  {data(p.dataDoPico)}. Confira as reservas desse dia e o estoque cadastrado.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {pressao.produtos.length > 6 && (
        <button type="button" className="acv-mais" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Ver todos (${pressao.produtos.length})`}
        </button>
      )}
      <p className="text-xs" style={cinza}>
        Maior quantidade comprometida num mesmo dia, contra o estoque atual. Usa a mesma conta da
        disponibilidade da agenda.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- conflitos

function Conflitos({ conflitos }: { conflitos: Performance["conflitos"] }) {
  const [todos, setTodos] = useState(false);
  if (conflitos.total === 0) {
    return (
      <p className="text-sm" style={cinza}>
        Nenhum conflito registrado no período. Considera apenas conflitos registrados desde que o
        monitoramento foi ativado.
      </p>
    );
  }
  const lista = todos ? conflitos.porProduto : conflitos.porProduto.slice(0, 5);
  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {lista.map((c) => (
          <li key={c.productId ?? "sem-produto"} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm" style={{ color: "var(--fin-navy-ink)" }}>{c.nome}</span>
              <span className="fin-numero shrink-0 text-xs" style={{ color: "var(--fin-coral-dark)" }}>
                {plural(c.total, "conflito", "conflitos")}
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {c.registros.slice(0, 3).map((r, i) => (
                <li key={i} className="text-xs" style={cinza}>
                  <Registro registro={r} />
                </li>
              ))}
              {c.registros.length > 3 && (
                <li className="text-xs" style={cinza}>e mais {c.registros.length - 3}</li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      {conflitos.porProduto.length > 5 && (
        <button type="button" className="acv-mais" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Ver todos (${conflitos.porProduto.length})`}
        </button>
      )}
      <p className="text-xs" style={cinza}>
        Cada conflito é uma tentativa bloqueada por falta de peça — não quer dizer venda perdida.
        Considera apenas conflitos registrados desde que o monitoramento foi ativado.
      </p>
    </div>
  );
}

function Registro({ registro: r }: { registro: RegistroDeConflito }) {
  const partes = [
    r.solicitado !== null ? `pediu ${r.solicitado}` : null,
    r.disponivel !== null ? `havia ${r.disponivel}` : null,
    r.dataDaFesta ? `festa em ${data(r.dataDaFesta)}` : null,
    r.contexto ? (CONTEXTO_DO_CONFLITO_LABEL[r.contexto] ?? r.contexto) : null,
  ].filter(Boolean);
  return <>{partes.join(" · ")}</>;
}

// ---------------------------------------------------------------- kits e temas

function ListaComValor({
  linhas,
  vazio,
}: {
  linhas: { chave: string; nome: string; festas: number; contratos: number }[];
  vazio: string;
}) {
  const [todos, setTodos] = useState(false);
  if (linhas.length === 0) return <p className="text-sm" style={cinza}>{vazio}</p>;
  const maior = Math.max(...linhas.map((l) => l.festas), 1);
  const lista = todos ? linhas : linhas.slice(0, 5);
  return (
    <div className="space-y-3">
      <ul className="com-barras">
        {lista.map((l) => (
          <li key={l.chave}>
            <span className="com-barras-rotulo">{l.nome}</span>
            <span className="com-barras-trilho" aria-hidden>
              <i style={{ width: `${(l.festas / maior) * 100}%` }} />
            </span>
            <span className="com-barras-valor">
              {plural(l.festas, "festa", "festas")}
              <small>{brl(l.contratos)} em contratos</small>
            </span>
          </li>
        ))}
      </ul>
      {linhas.length > 5 && (
        <button type="button" className="acv-mais" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Ver todos (${linhas.length})`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cobertura

function Cobertura({ cobertura, dias }: { cobertura: Performance["cobertura"]; dias: number }) {
  return (
    <section className="acv-cobertura">
      <p className="fin-rotulo">Cobertura dos dados do acervo · últimos {dias} dias</p>
      {cobertura.festas === 0 ? (
        <p className="mt-1 text-xs" style={cinza}>Nenhuma festa no período.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs" style={cinza}>
          <li>
            {cobertura.rastreaveis} de {cobertura.festas} {cobertura.festas === 1 ? "festa do período possui" : "festas do período possuem"}{" "}
            composição rastreável · {pct(cobertura.rastreaveis / cobertura.festas, 0)} de cobertura
          </li>
          {cobertura.kitSemSnapshot > 0 && (
            <li>{plural(cobertura.kitSemSnapshot, "festa antiga com kit não possui", "festas antigas com kit não possuem")} snapshot histórico</li>
          )}
          {cobertura.semItensRegistrados > 0 && (
            <li>
              {plural(cobertura.semItensRegistrados, "festa não tem", "festas não têm")} nenhum item registrado (histórico
              trazido do painel antigo)
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- detalhe

function DetalheDoProduto({ productId, janela, aoFechar }: { productId: string; janela: number; aoFechar: () => void }) {
  const { data: d, isLoading, error } = useQuery<Detalhe>({
    queryKey: ["acervo", "performance", "produto", productId, janela],
    queryFn: () => api(`/acervo/performance/produtos/${productId}?periodo=${janela}`),
  });

  return (
    <Dialog open onOpenChange={(abertoAgora) => !abertoAgora && aoFechar()}>
      <DialogContent
        className="financeiro max-h-[92dvh] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5" style={{ borderColor: "var(--fin-line)" }}>
          <div className="min-w-0">
            <DialogTitle className="text-base font-medium" style={{ color: "var(--fin-navy-ink)" }}>
              {d?.produto.nome ?? "Produto"}{" "}
              <span className="font-normal" style={cinza}>— últimos {janela} dias</span>
            </DialogTitle>
            <p className="mt-1 max-w-xl text-xs" style={cinza}>
              As festas em que a peça esteve, pelo kit congelado ou como extra. O valor é o do contrato
              inteiro, não receita atribuída à peça.
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar detalhe" className="-m-1 shrink-0 rounded p-1" style={cinza}>
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {isLoading && <p className="p-5 text-sm" style={cinza}>Apurando…</p>}
          {error && <p className="p-5 text-sm text-destructive">Não foi possível abrir o detalhe.</p>}
          {d && (
            <>
              <dl className="com-pares acv-resumo p-4 sm:p-5">
                <div><dt>Estoque atual</dt><dd>{d.produto.estoque}</dd></div>
                <div><dt>Última utilização</dt><dd>{data(d.produto.ultimaUtilizacao, "Nunca registrada")}</dd></div>
                <div><dt>Próxima utilização</dt><dd>{data(d.produto.proximaUtilizacao)}</dd></div>
                <div><dt>Conflitos registrados</dt><dd>{d.produto.conflitos}</dd></div>
              </dl>

              {d.festas.length === 0 ? (
                <p className="px-4 pb-4 text-sm sm:px-5" style={cinza}>Nenhuma festa com esta peça no período.</p>
              ) : (
                <ul className="divide-y border-t" style={{ borderColor: "var(--fin-line)" }}>
                  {d.festas.map((f) => (
                    <li key={f.reservaId} className="flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5">
                      <span className="min-w-0">
                        <span className="block truncate text-sm" style={{ color: "var(--fin-navy-ink)" }}>{f.cliente}</span>
                        <span className="block text-xs" style={cinza}>
                          {data(f.data)}
                          {f.numero > 0 ? ` · contrato nº ${f.numero}` : ""} · {f.quantidade}{" "}
                          {f.quantidade === 1 ? "peça" : "peças"} · {ORIGEM_NO_PEDIDO_LABEL[f.origem]}
                        </span>
                      </span>
                      <span className="fin-numero shrink-0 text-sm" title="Valor total do contrato">{brl(f.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {d.conflitos.length > 0 && (
                <div className="border-t p-4 sm:p-5" style={{ borderColor: "var(--fin-line)" }}>
                  <p className="fin-rotulo">Conflitos registrados no período</p>
                  <ul className="mt-1 space-y-0.5">
                    {d.conflitos.map((r, i) => (
                      <li key={i} className="text-xs" style={cinza}><Registro registro={r} /></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {d && (
          <div className="border-t p-4 sm:p-5" style={{ borderColor: "var(--fin-line)", background: "var(--fin-cream)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <Total rotulo="Festas no período" valor={String(d.totais.festas)} />
              <Total rotulo="Qtd. utilizada" valor={String(d.totais.quantidade)} />
              <Total rotulo="Contratos associados" valor={brl(d.totais.contratos)} destaque />
            </div>
            {!d.confere && (
              <p className="mt-3 text-xs text-destructive">
                Atenção: a lista não fechou com a linha da tabela. Não use estes números até conferir.
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
      <span className="fin-numero" style={{ fontSize: destaque ? "1.2rem" : "1rem", color: destaque ? "var(--fin-navy-ink)" : "var(--fin-muted)" }}>
        {valor}
      </span>
    </span>
  );
}
