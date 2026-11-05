import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileUp, X } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORIAS_DO_EXTRATO,
  FORMATOS_DO_EXTRATO,
  LIMITES_DO_EXTRATO,
  type AnaliseDeExtratos,
  type ArquivoAnalisado,
  type CategoriaDoExtrato,
  type GrupoDaCategoria,
  type MovimentacaoDoExtrato,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { enviarArquivos } from "@/lib/api";
import { centavosEmReais } from "@/lib/centavos";
import { useFormato } from "@/lib/privacidade";
import { Rotulo } from "./pecas";

type Filtro = "TODAS" | GrupoDaCategoria | "REPETIDAS";

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: "TODAS", rotulo: "Todas" },
  { id: "PENDENTE", rotulo: "Pendentes" },
  { id: "INTERNA", rotulo: "Conta ↔ cofrinho" },
  { id: "EXTERNA", rotulo: "Entradas e saídas" },
  { id: "REPETIDAS", rotulo: "Repetidas" },
];

const SITUACAO_DO_ARQUIVO: Record<ArquivoAnalisado["situacao"], { rotulo: string; classe: string }> = {
  ACEITO: { rotulo: "Aceito", classe: "quitado" },
  RECUSADO: { rotulo: "Recusado", classe: "vencido" },
  REPETIDO: { rotulo: "Repetido", classe: "aguardando" },
};

const GRUPO: Record<GrupoDaCategoria, { rotulo: string; classe: string }> = {
  EXTERNA: { rotulo: "Entrada/saída", classe: "aguardando" },
  INTERNA: { rotulo: "Interna", classe: "parcial" },
  PENDENTE: { rotulo: "Pendente", classe: "hoje" },
};

const PAGINA = 100;

function dataBr(dia: string) {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function Categoria({ categoria }: { categoria: CategoriaDoExtrato }) {
  const c = CATEGORIAS_DO_EXTRATO[categoria];
  return (
    <span className={`fin-situacao ${GRUPO[c.grupo].classe}`} title={c.nota}>
      {c.rotulo}
    </span>
  );
}

/**
 * Importação de extratos do Mercado Pago — prévia (Entrega H1).
 *
 * O arquivo vai para a API, é conferido e descartado. Nada é gravado e nenhum
 * lançamento muda; a classificação é só para conferência. A conciliação com
 * as reservas, despesas e retiradas é uma etapa seguinte.
 */
export function ImportarExtrato() {
  const { brl } = useFormato();
  const reais = (centavos: number) => brl(centavosEmReais(centavos));
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");
  const [limite, setLimite] = useState(PAGINA);

  const analisar = useMutation({
    mutationFn: (fs: File[]) =>
      enviarArquivos<AnaliseDeExtratos>("/pagamentos/extratos-mercado-pago/analise", "arquivos", fs),
    onSuccess: () => {
      setFiltro("TODAS");
      setLimite(PAGINA);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const r = analisar.data;

  const escolher = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []);
    const grandes = novos.filter((f) => f.size > LIMITES_DO_EXTRATO.bytesPorArquivo);
    if (grandes.length) toast.error(`${grandes[0].name}: maior que 2 MB.`);
    const todos = [...arquivos, ...novos.filter((f) => f.size <= LIMITES_DO_EXTRATO.bytesPorArquivo)];
    if (todos.length > LIMITES_DO_EXTRATO.arquivos) toast.error(`No máximo ${LIMITES_DO_EXTRATO.arquivos} arquivos por vez.`);
    setArquivos(todos.slice(0, LIMITES_DO_EXTRATO.arquivos));
  };

  const limpar = () => {
    setArquivos([]);
    analisar.reset();
  };

  const visiveis = useMemo(() => {
    const todas = r?.movimentacoes ?? [];
    if (filtro === "TODAS") return todas;
    if (filtro === "REPETIDAS") return todas.filter((m) => m.repeticao);
    return todas.filter((m) => CATEGORIAS_DO_EXTRATO[m.categoria].grupo === filtro);
  }, [r, filtro]);

  const nomeDoArquivo = (i: number) => r?.arquivos[i]?.nome ?? `arquivo ${i + 1}`;

  return (
    <section className="space-y-5 border-t pt-6" style={{ borderColor: "var(--fin-line)" }} data-importar-extrato>
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold" style={{ color: "var(--fin-navy-ink)" }}>
          Extrato da conta Mercado Pago
        </h2>
        <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
          Prévia para conferência do dinheiro que de fato passou pela conta e pelo cofrinho Reserva Festaê. O arquivo é
          lido e descartado: nada é gravado e nenhum lançamento do Financeiro muda.
        </p>
      </div>

      <div className="fin-cartao space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="extrato-arquivos"
            className="inline-flex h-11 cursor-pointer items-center rounded-md border bg-background px-4 text-sm font-medium focus-within:ring-2"
          >
            <FileUp className="mr-2 h-4 w-4" aria-hidden />
            Escolher arquivos
            <input
              id="extrato-arquivos"
              type="file"
              accept=".csv,text/csv,.pdf,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                escolher(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <Button
            className="h-11"
            disabled={arquivos.length === 0 || analisar.isPending}
            onClick={() => analisar.mutate(arquivos)}
          >
            {analisar.isPending ? "Analisando..." : "Analisar"}
          </Button>
          {(arquivos.length > 0 || r) && (
            <Button variant="ghost" className="h-11" onClick={limpar} disabled={analisar.isPending}>
              Limpar
            </Button>
          )}
        </div>
        {arquivos.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Arquivos escolhidos">
            {arquivos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {f.name}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label={`Tirar ${f.name}`}
                  onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
          CSV do extrato da conta ou do relatório de liberações, baixado no Mercado Pago. Até{" "}
          {LIMITES_DO_EXTRATO.arquivos} arquivos de 2 MB, do mesmo formato. PDF ainda não é lido automaticamente.
        </p>
      </div>

      {r && (
        <>
          <div className="grid gap-3 md:grid-cols-2" aria-label="Arquivos analisados">
            {r.arquivos.map((a, i) => (
              <article key={`${a.hash}-${i}`} className="fin-cartao space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="break-all font-medium">{a.nome}</p>
                  <span className={`fin-situacao ${SITUACAO_DO_ARQUIVO[a.situacao].classe}`}>
                    {SITUACAO_DO_ARQUIVO[a.situacao].rotulo}
                  </span>
                </div>
                {a.formato && (
                  <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
                    {FORMATOS_DO_EXTRATO[a.formato].rotulo}
                    {a.periodo && ` · ${dataBr(a.periodo.de)} a ${dataBr(a.periodo.ate)}`}
                    {a.situacao === "ACEITO" && ` · ${a.linhas} linhas`}
                  </p>
                )}
                {a.situacao === "ACEITO" && (
                  <p className="text-sm">
                    {a.saldoInicial !== null && <>Saldo inicial {reais(a.saldoInicial)} · </>}
                    {a.saldoFinal !== null && <>saldo final {reais(a.saldoFinal)} · </>}
                    <span style={{ color: a.saldoConferido ? "var(--fin-good)" : "var(--fin-warn)" }}>
                      {a.saldoConferido ? "contas do arquivo conferidas" : "contas do arquivo não conferidas"}
                    </span>
                  </p>
                )}
                {a.erros.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--fin-bad)" }} role="alert">
                    {a.erros.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                {a.avisos.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs" style={{ color: "var(--fin-muted)" }}>
                    {a.avisos.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                <p className="font-mono text-[11px]" style={{ color: "var(--fin-muted)" }} title={`SHA-256 ${a.hash}`}>
                  impressão digital {a.hash.slice(0, 12)}
                </p>
              </article>
            ))}
          </div>

          {r.resumo.quantidade > 0 && (
            <>
              <div className="fin-cartao flex flex-wrap gap-x-8 gap-y-3" aria-live="polite">
                <div>
                  <Rotulo>Movimentações</Rotulo>
                  <p className="fin-numero">{r.resumo.quantidade}</p>
                </div>
                <div>
                  <Rotulo>Entradas</Rotulo>
                  <p className="fin-numero">{reais(r.resumo.entradas)}</p>
                </div>
                <div>
                  <Rotulo>Saídas</Rotulo>
                  <p className="fin-numero">{reais(r.resumo.saidas)}</p>
                </div>
                <div>
                  <Rotulo>Líquido na conta</Rotulo>
                  <p className="fin-numero">{reais(r.resumo.liquido)}</p>
                </div>
                <div>
                  <Rotulo>Pendentes</Rotulo>
                  <p className="fin-numero" style={r.resumo.pendentes > 0 ? { color: "var(--fin-coral)" } : undefined}>
                    {r.resumo.pendentes}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="fin-cartao space-y-2">
                  <Rotulo>Cofrinho Reserva Festaê no período</Rotulo>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt style={{ color: "var(--fin-muted)" }}>Enviado ao cofrinho</dt>
                    <dd className="text-right font-mono">{reais(r.resumo.cofrinho.enviado)}</dd>
                    <dt style={{ color: "var(--fin-muted)" }}>Retirado do cofrinho</dt>
                    <dd className="text-right font-mono">{reais(r.resumo.cofrinho.retirado)}</dd>
                    <dt className="font-medium">Líquido para o cofrinho</dt>
                    <dd className="text-right font-mono font-medium">{reais(r.resumo.cofrinho.liquido)}</dd>
                    <dt style={{ color: "var(--fin-muted)" }}>Rendimentos no arquivo</dt>
                    <dd className="text-right font-mono">{reais(r.resumo.cofrinho.rendimentos)}</dd>
                  </dl>
                  <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
                    Movimentação interna: não é receita nem despesa. É uma reconstrução a partir do arquivo, não o saldo
                    certificado do cofrinho.
                  </p>
                </div>
                <div className="fin-cartao space-y-2">
                  <Rotulo>Tarifas e repetições</Rotulo>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt style={{ color: "var(--fin-muted)" }}>Tarifas embutidas</dt>
                    <dd className="text-right font-mono">
                      {r.resumo.tarifasEmbutidas !== null ? reais(r.resumo.tarifasEmbutidas) : "não informado"}
                    </dd>
                    <dt style={{ color: "var(--fin-muted)" }}>Bruto − líquido</dt>
                    <dd className="text-right font-mono">
                      {r.resumo.diferencaBrutoLiquido !== null ? reais(r.resumo.diferencaBrutoLiquido) : "não informado"}
                    </dd>
                    <dt style={{ color: "var(--fin-muted)" }}>Repetidas, fora da soma</dt>
                    <dd className="text-right font-mono">{r.resumo.repeticoesIgnoradas}</dd>
                    <dt style={{ color: "var(--fin-muted)" }}>Possíveis repetições</dt>
                    <dd className="text-right font-mono">{r.resumo.possiveisRepeticoes}</dd>
                  </dl>
                </div>
              </div>

              <div className="fin-cartao overflow-x-auto p-0">
                <table className="fin-tabela">
                  <thead>
                    <tr>
                      <th>Classificação preliminar</th>
                      <th className="num">Qtd.</th>
                      <th className="num">Entradas</th>
                      <th className="num">Saídas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.resumo.porCategoria.map((c) => (
                      <tr key={c.categoria}>
                        <td>
                          <Categoria categoria={c.categoria} />
                          <span className="mt-1 block text-xs" style={{ color: "var(--fin-muted)" }}>
                            {CATEGORIAS_DO_EXTRATO[c.categoria].nota}
                          </span>
                        </td>
                        <td className="num">{c.quantidade}</td>
                        <td className="num">{c.entradas ? reais(c.entradas) : "—"}</td>
                        <td className="num">{c.saidas ? reais(c.saidas) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {r.resumo.porMes.length > 1 && (
                <div className="fin-cartao overflow-x-auto p-0">
                  <table className="fin-tabela">
                    <thead>
                      <tr>
                        <th>Mês (horário de Brasília)</th>
                        <th className="num">Entradas</th>
                        <th className="num">Saídas</th>
                        <th className="num">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.resumo.porMes.map((m) => (
                        <tr key={m.mes}>
                          <td>{`${m.mes.slice(5)}/${m.mes.slice(0, 4)}`}</td>
                          <td className="num">{reais(m.entradas)}</td>
                          <td className="num">{reais(m.saidas)}</td>
                          <td className="num">{reais(m.liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar movimentações">
                  {FILTROS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={filtro === f.id}
                      onClick={() => {
                        setFiltro(f.id);
                        setLimite(PAGINA);
                      }}
                      className={`h-9 rounded-full border px-3 text-sm ${
                        filtro === f.id ? "border-transparent bg-[var(--fin-navy)] text-white" : "bg-background"
                      }`}
                    >
                      {f.rotulo}
                    </button>
                  ))}
                </div>

                {visiveis.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--fin-muted)" }}>
                    Nenhuma movimentação neste filtro.
                  </p>
                ) : (
                  <>
                    <div className="fin-cartao hidden overflow-x-auto p-0 md:block">
                      <table className="fin-tabela">
                        <thead>
                          <tr>
                            <th>Data</th>
                            <th>Descrição no arquivo</th>
                            <th>Classificação</th>
                            <th className="num">Valor</th>
                            <th className="num">Saldo após</th>
                            <th>Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visiveis.slice(0, limite).map((m) => (
                            <LinhaDaTabela key={`${m.arquivo}-${m.linha}`} m={m} reais={reais} nomeDe={nomeDoArquivo} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden">
                      {visiveis.slice(0, limite).map((m) => (
                        <CartaoDaLinha key={`${m.arquivo}-${m.linha}`} m={m} reais={reais} nomeDe={nomeDoArquivo} />
                      ))}
                    </div>
                    {visiveis.length > limite && (
                      <Button variant="outline" onClick={() => setLimite(limite + PAGINA)}>
                        Mostrar mais ({visiveis.length - limite} restantes)
                      </Button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

type PropsDaLinha = { m: MovimentacaoDoExtrato; reais: (c: number) => string; nomeDe: (arquivo: number) => string };

function Repeticao({ m, nomeDe }: Pick<PropsDaLinha, "m" | "nomeDe">) {
  if (!m.repeticao) return null;
  const onde = `linha ${m.repeticao.linha} de ${nomeDe(m.repeticao.arquivo)}`;
  return (
    <span className="mt-1 block text-xs" style={{ color: "var(--fin-coral-dark)" }}>
      {m.repeticao.tipo === "MESMA_OPERACAO"
        ? `Mesma operação da ${onde}: fora da soma.`
        : `Parecida com a ${onde}, sem identificador para confirmar: confira.`}
    </span>
  );
}

function Data({ m }: { m: MovimentacaoDoExtrato }) {
  return (
    <span title={`No arquivo: ${m.dataOriginal}`}>
      {m.dataBrasilia ? `${dataBr(m.dataBrasilia.slice(0, 10))} ${m.dataBrasilia.slice(11)}` : dataBr(m.dia)}
    </span>
  );
}

function Valor({ m, reais }: Pick<PropsDaLinha, "m" | "reais">) {
  return (
    <>
      <span style={{ color: m.valor < 0 ? "var(--fin-coral-dark)" : "var(--fin-good)" }}>{reais(m.valor)}</span>
      {(m.valorBruto !== null || m.tarifa !== null) && (
        <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
          {m.valorBruto !== null && `bruto ${reais(m.valorBruto)}`}
          {m.tarifa ? ` · tarifa ${reais(m.tarifa)}` : ""}
        </span>
      )}
    </>
  );
}

function LinhaDaTabela({ m, reais, nomeDe }: PropsDaLinha) {
  const arquivo = nomeDe(m.arquivo);
  return (
    <tr className={m.repeticao?.tipo === "MESMA_OPERACAO" ? "riscado" : undefined}>
      <td className="whitespace-nowrap">
        <Data m={m} />
      </td>
      <td>
        {m.descricao || "—"}
        {(m.idDaOperacao || m.tipoNoArquivo) && (
          <span className="block text-xs" style={{ color: "var(--fin-muted)" }}>
            {[m.tipoNoArquivo, m.idDaOperacao && `id ${m.idDaOperacao}`].filter(Boolean).join(" · ")}
          </span>
        )}
      </td>
      <td>
        <Categoria categoria={m.categoria} />
        <span className="mt-1 block text-xs" style={{ color: "var(--fin-muted)" }}>
          {m.regra}
        </span>
        <Repeticao m={m} nomeDe={nomeDe} />
      </td>
      <td className="num">
        <Valor m={m} reais={reais} />
      </td>
      <td className="num">{m.saldoApos !== null ? reais(m.saldoApos) : "—"}</td>
      <td className="text-xs" style={{ color: "var(--fin-muted)" }}>
        {arquivo}
        <span className="block">linha {m.linha}</span>
      </td>
    </tr>
  );
}

function CartaoDaLinha({ m, reais, nomeDe }: PropsDaLinha) {
  const arquivo = nomeDe(m.arquivo);
  return (
    <div className={`fin-linha ${m.repeticao?.tipo === "MESMA_OPERACAO" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Categoria categoria={m.categoria} />
        <span className="text-right font-mono text-sm">
          <Valor m={m} reais={reais} />
        </span>
      </div>
      <p className="mt-2 text-sm">{m.descricao || "—"}</p>
      <p className="text-xs" style={{ color: "var(--fin-muted)" }}>
        <Data m={m} /> · {arquivo}, linha {m.linha}
        {m.saldoApos !== null && ` · saldo ${reais(m.saldoApos)}`}
      </p>
      <Repeticao m={m} nomeDe={nomeDe} />
    </div>
  );
}
