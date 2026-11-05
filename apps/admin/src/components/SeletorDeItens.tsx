import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ImageOff, ListPlus, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  alternar,
  categoriasDoCatalogo,
  definirQuantidade,
  filtrarCatalogo,
  resumoDaSelecao,
  rotuloDaCategoria,
  selecionadosEmOrdem,
  type ProdutoDoSeletor,
  type Selecao,
} from "@/lib/selecao-de-itens";

/**
 * Escolher várias peças do catálogo de uma vez.
 *
 * Substitui o "abrir a lista, achar a peça, escolher, repetir" por uma janela
 * com o catálogo inteiro à vista: busca, categoria, marcar quantas quiser e
 * incluir tudo num clique. É só interface — o que entra na composição é o que
 * a tela já fazia ao escolher uma peça; preço, acervo e disponibilidade seguem
 * as regras de sempre, conferidas ao salvar.
 *
 * Fechar a janela sem confirmar não perde nada: a seleção continua guardada e
 * volta ao reabrir. Só o "Adicionar selecionados" a esvazia.
 *
 * O preço chega já formatado por quem usa (`formatarPreco`): o componente não
 * decide como dinheiro aparece na tela.
 */
export function SeletorDeItens({
  produtos,
  formatarPreco,
  jaIncluidos = {},
  permitirRepetidos,
  aoConfirmar,
  rotuloDoBotao = "Adicionar itens",
  textoDoRepetido,
}: {
  produtos: readonly ProdutoDoSeletor[];
  formatarPreco: (valor: number) => string;
  /** Produto → quantidade que já está na composição. */
  jaIncluidos?: Record<string, number>;
  /**
   * Proposta: escolher de novo uma peça que já está na composição cria outra
   * linha (como sempre foi). Reserva: cada peça aparece uma vez — a já
   * incluída fica travada aqui e a quantidade se ajusta na lista.
   */
  permitirRepetidos: boolean;
  aoConfirmar: (itens: { produto: ProdutoDoSeletor; quantidade: number }[]) => void;
  rotuloDoBotao?: string;
  /** Texto do selo de peça já incluída. */
  textoDoRepetido?: (quantidade: number) => string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [somenteSelecionados, setSomenteSelecionados] = useState(false);
  const [selecao, setSelecao] = useState<Selecao>({});

  const categorias = useMemo(() => categoriasDoCatalogo(produtos), [produtos]);
  const visiveis = useMemo(
    () => filtrarCatalogo(produtos, { busca, categoria, somenteSelecionados, selecao }),
    [produtos, busca, categoria, somenteSelecionados, selecao],
  );
  const resumo = resumoDaSelecao(selecao);
  const selo = textoDoRepetido ?? ((q: number) => `Já incluído · ${q} un.`);

  function confirmar() {
    const itens = selecionadosEmOrdem(produtos, selecao);
    if (itens.length === 0) return;
    aoConfirmar(itens);
    setSelecao({});
    setSomenteSelecionados(false);
    setAberto(false);
  }

  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setAberto(true)}>
        <ListPlus className="mr-1.5 size-4" aria-hidden />
        {rotuloDoBotao}
        {resumo.itens > 0 && (
          <span className="ml-1.5 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {resumo.itens} pendente{resumo.itens === 1 ? "" : "s"}
          </span>
        )}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b p-4 pr-12 text-left">
            <DialogTitle>Adicionar itens do catálogo</DialogTitle>
            <DialogDescription>
              Marque quantas peças quiser. Buscar ou trocar de categoria não desmarca nada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 border-b p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="seletor-busca"
                type="search"
                autoComplete="off"
                className="h-11 pl-9"
                placeholder="Buscar pelo nome da peça"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar pelo nome da peça"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por categoria">
              <Filtro ativo={categoria === "" && !somenteSelecionados} onClick={() => { setCategoria(""); setSomenteSelecionados(false); }}>
                Todas
              </Filtro>
              {categorias.map((c) => (
                <Filtro key={c.valor} ativo={categoria === c.valor} onClick={() => setCategoria(categoria === c.valor ? "" : c.valor)}>
                  {c.rotulo}
                </Filtro>
              ))}
              <Filtro ativo={somenteSelecionados} onClick={() => setSomenteSelecionados((v) => !v)} disabled={resumo.itens === 0 && !somenteSelecionados}>
                Selecionados ({resumo.itens})
              </Filtro>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {visiveis.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {produtos.length === 0 ? "Nenhuma peça ativa no catálogo." : "Nenhuma peça encontrada com esta busca e categoria."}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {visiveis.map((p) => {
                  const marcado = p.id in selecao;
                  const incluido = jaIncluidos[p.id] ?? 0;
                  const travado = !permitirRepetidos && incluido > 0;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "flex gap-3 rounded-md border p-2.5 transition-colors",
                        marcado && "border-primary bg-primary/5",
                        travado && "opacity-60",
                      )}
                    >
                      <label className={cn("flex min-w-0 flex-1 gap-3", travado ? "cursor-not-allowed" : "cursor-pointer")}>
                        <Checkbox
                          className="mt-1 size-5"
                          checked={marcado}
                          disabled={travado}
                          onCheckedChange={() => setSelecao((s) => alternar(s, p.id))}
                          aria-label={`Selecionar ${p.name}`}
                        />
                        <Miniatura url={p.imageUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-snug font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p.category ? rotuloDaCategoria(p.category) : "Sem categoria"} · {formatarPreco(Number(p.unitPrice))}
                          </span>
                          {p.stockQuantity !== undefined && (
                            <span className={cn("block text-xs", p.stockQuantity > 0 ? "text-muted-foreground" : "font-medium text-amber-700")}>
                              {p.stockQuantity > 0 ? `${p.stockQuantity} no acervo` : "Sem unidades no acervo"}
                            </span>
                          )}
                          {incluido > 0 && (
                            <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {selo(incluido)}
                            </span>
                          )}
                        </span>
                      </label>
                      {marcado && (
                        <Quantidade
                          nome={p.name}
                          valor={selecao[p.id]}
                          aoMudar={(q) => setSelecao((s) => definirQuantidade(s, p.id, q))}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm" aria-live="polite">
              {resumo.itens === 0
                ? "Nenhuma peça selecionada."
                : `${resumo.itens} peça${resumo.itens === 1 ? "" : "s"} selecionada${resumo.itens === 1 ? "" : "s"} · ${resumo.unidades} unidade${resumo.unidades === 1 ? "" : "s"}`}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {resumo.itens > 0 && (
                <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setSelecao({}); setSomenteSelecionados(false); }}>
                  <X className="mr-1 size-4" aria-hidden /> Limpar seleção
                </Button>
              )}
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setAberto(false)}>
                Fechar
              </Button>
              <Button type="button" className="min-h-11" disabled={resumo.itens === 0} onClick={confirmar}>
                Adicionar selecionados{resumo.itens > 0 ? ` (${resumo.itens})` : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Filtro({
  ativo,
  children,
  ...props
}: { ativo: boolean; children: ReactNode } & Omit<ComponentProps<"button">, "type" | "className">) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      className={cn(
        "min-h-9 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors disabled:opacity-40",
        ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Miniatura({ url }: { url?: string | null }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground" aria-hidden>
        <ImageOff className="size-4" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="size-14 shrink-0 rounded object-cover"
      onError={() => setFalhou(true)}
    />
  );
}

function Quantidade({ nome, valor, aoMudar }: { nome: string; valor: number; aoMudar: (q: number | string) => void }) {
  // O texto do campo é local: apagar para digitar outro número não pode virar
  // "1" no meio da digitação. A quantidade só muda com um número válido, e o
  // campo volta ao valor guardado ao sair dele.
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1">
      <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => aoMudar(valor + 1)} aria-label={`Mais uma unidade de ${nome}`}>
        <Plus className="size-4" />
      </Button>
      <Input
        type="number"
        inputMode="numeric"
        min={1}
        className="h-9 w-14 px-1 text-center"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          if (Number(e.target.value) >= 1) aoMudar(e.target.value);
        }}
        onBlur={() => setTexto(String(valor))}
        aria-label={`Quantidade de ${nome}`}
      />
      <Button type="button" variant="outline" size="icon" className="size-8" disabled={valor <= 1} onClick={() => aoMudar(valor - 1)} aria-label={`Uma unidade a menos de ${nome}`}>
        <Minus className="size-4" />
      </Button>
    </div>
  );
}
