import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  TIPOS_DA_LINHA,
  TIPO_DA_LINHA_LABEL,
  calcularOrcamento,
  toCentsInt,
  totalDaLinha,
  montarComposicaoDoKit,
  type TipoDaLinha,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComposicaoDoKit } from "@/components/orcamento/ComposicaoDoKit";
import { GaleriaDeImagens } from "@/components/GaleriaDeImagens";
import { brl } from "@/components/financeiro/formato";

/**
 * Uma opção de festa dentro da proposta: kit, linhas, imagens e valores
 * próprios.
 *
 * O cálculo é o mesmo de @festae/shared que o servidor usa para gravar — a
 * tela nunca mostra um número que o banco não vai confirmar.
 */

export type KitDoCatalogo = {
  id: string; name: string; basePrice: string;
  coverImageUrl: string | null; images: string[]; themeId: string | null;
  products?: { quantity: number; product: { id: string; name: string; active: boolean } }[];
};
export type ProdutoDoCatalogo = { id: string; name: string; unitPrice: string; imageUrl: string | null; category: string };

export type Linha = {
  tipo: TipoDaLinha;
  productId?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  imagemUrl?: string;
};

export type OpcaoEditada = {
  /** Chave local da tela, só para o React e para os ids dos campos. */
  chave: string;
  nome: string;
  descricao: string;
  kitId: string;
  imagens: string[];
  linhas: Linha[];
  desconto: string;
  entrega: string;
  montagem: string;
  /**
   * O valor final negociado desta opção.
   *
   * Enquanto ninguém digita nada, ele não existe: o oficial é a soma da
   * composição, e acompanha qualquer mexida nos itens. Digitado, ele passa a
   * valer — e não é sobrescrito quando a composição muda, porque valor
   * combinado com a cliente não se atualiza sozinho.
   */
  valorFinal: string;
  valorFinalTocado: boolean;
  /** A composição de quando o valor final foi digitado, para saber se ela mudou depois. */
  baseDaComposicao: number | null;
};

let contador = 0;
const novaChave = () => `op${Date.now().toString(36)}${(contador++).toString(36)}`;

export function novaOpcao(numero: number): OpcaoEditada {
  return {
    chave: novaChave(),
    nome: `Opção ${numero}`,
    descricao: "",
    kitId: "",
    imagens: [],
    linhas: [],
    desconto: "0",
    entrega: "0",
    montagem: "0",
    valorFinal: "",
    valorFinalTocado: false,
    baseDaComposicao: null,
  };
}

/** Uma opção como o servidor devolve no detalhe da proposta. */
export function opcaoDoServidor(o: any): OpcaoEditada {
  return {
    chave: novaChave(),
    nome: o.nome,
    descricao: o.descricao ?? "",
    kitId: o.kitId ?? "",
    imagens: o.imagens ?? [],
    linhas: (o.linhas ?? []).map((l: any) => ({
      tipo: l.tipo,
      productId: l.productId ?? undefined,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valorUnitario: l.valorUnitario,
      imagemUrl: l.imagemUrl ?? undefined,
    })),
    desconto: String(o.valores.desconto),
    entrega: String(o.valores.entrega),
    montagem: String(o.valores.montagem),
    valorFinal: o.valores.valorFinalManual ? String(o.valores.total) : "",
    valorFinalTocado: Boolean(o.valores.valorFinalManual),
    baseDaComposicao: o.valores.valorFinalManual ? o.valores.totalCalculado : null,
  };
}

/** O corpo que a API recebe para esta opção. */
export function opcaoParaEnvio(o: OpcaoEditada) {
  return {
    nome: o.nome.trim(),
    descricao: o.descricao.trim() || undefined,
    kitId: o.kitId || undefined,
    imagens: o.imagens,
    itens: o.linhas.map((l) => ({
      tipo: l.tipo,
      productId: l.productId || undefined,
      descricao: l.descricao,
      quantidade: l.quantidade,
      valorUnitario: l.valorUnitario,
      imagemUrl: l.imagemUrl || undefined,
    })),
    valores: {
      desconto: Number(o.desconto) || 0,
      entrega: Number(o.entrega) || 0,
      montagem: Number(o.montagem) || 0,
      // Nulo quer dizer "acompanhe a composição". Mandar sempre o número
      // faria toda opção nascer com valor travado à mão.
      valorFinal: o.valorFinalTocado ? Number(o.valorFinal) || 0 : null,
    },
  };
}

export function totaisDaOpcaoEditada(o: OpcaoEditada) {
  const totais = calcularOrcamento(o.linhas, Number(o.desconto) || 0, Number(o.entrega) || 0, Number(o.montagem) || 0);
  const oficial = o.valorFinalTocado ? Number(o.valorFinal) || 0 : totais.total;
  return { ...totais, oficial };
}

/** Tem algo que se perderia ao remover a opção? */
export function opcaoTemConteudo(o: OpcaoEditada) {
  return o.linhas.length > 0 || o.imagens.length > 0 || Boolean(o.kitId) || o.descricao.trim().length > 0;
}

/** O que falta para a opção poder ser salva, ou nulo. */
export function problemaDaOpcao(o: OpcaoEditada): string | null {
  if (!o.nome.trim()) return "Dê um nome à opção.";
  if (o.linhas.length === 0) return "Adicione ao menos um item.";
  if (o.linhas.some((l) => l.descricao.trim().length < 2)) return "Descreva todos os itens.";
  return null;
}

export function EditorDaOpcao({
  opcao,
  aoMudar,
  kits,
  produtos,
  capaDoTema,
  aoEscolherKit,
}: {
  opcao: OpcaoEditada;
  aoMudar: (mudanca: Partial<OpcaoEditada> | ((o: OpcaoEditada) => Partial<OpcaoEditada>)) => void;
  kits: KitDoCatalogo[];
  produtos: ProdutoDoCatalogo[];
  capaDoTema: string | null;
  /** Avisa a página, que decide o tema (só preenche se estiver vazio). */
  aoEscolherKit: (kit: KitDoCatalogo) => void;
}) {
  const id = (campo: string) => `${opcao.chave}-${campo}`;
  const totais = totaisDaOpcaoEditada(opcao);
  const negociado = opcao.valorFinalTocado && toCentsInt(totais.oficial) !== toCentsInt(totais.total);
  const composicaoMudou =
    opcao.valorFinalTocado &&
    opcao.baseDaComposicao !== null &&
    toCentsInt(opcao.baseDaComposicao) !== toCentsInt(totais.total);

  // A composição do kit escolhido, do catálogo — só para ver. Não vira linha
  // nem muda valor: o kit continua cobrado pela linha KIT.
  const kitDoCatalogo = kits.find((k) => k.id === opcao.kitId);
  const kitSelecionado = kitDoCatalogo
    ? montarComposicaoDoKit({ ...kitDoCatalogo, products: kitDoCatalogo.products ?? [] })
    : null;

  /** As imagens que esta opção pode mostrar, vindas do que foi escolhido nela. */
  const imagensDisponiveis = useMemo(() => {
    const dasLinhas = opcao.linhas.map((l) => l.imagemUrl).filter(Boolean) as string[];
    return Array.from(
      new Set(
        [kitDoCatalogo?.coverImageUrl, ...(kitDoCatalogo?.images ?? []), capaDoTema, ...dasLinhas].filter(Boolean) as string[],
      ),
    );
  }, [kitDoCatalogo, capaDoTema, opcao.linhas]);

  function escolherKit(valor: string) {
    const k = kits.find((x) => x.id === valor);
    aoMudar((o) => ({
      kitId: valor,
      linhas: k
        ? [
            ...o.linhas.filter((l) => l.tipo !== "KIT"),
            { tipo: "KIT", descricao: k.name, quantidade: 1, valorUnitario: Number(k.basePrice), imagemUrl: k.coverImageUrl ?? undefined },
          ]
        : o.linhas.filter((l) => l.tipo !== "KIT"),
    }));
    if (k) aoEscolherKit(k);
  }

  function adicionarProduto(produtoId: string) {
    const p = produtos.find((x) => x.id === produtoId);
    if (!p) return;
    aoMudar((o) => ({
      linhas: [
        ...o.linhas,
        {
          tipo: p.category === "BALAO" ? "BALOES" : "PRODUTO",
          productId: p.id,
          descricao: p.name,
          quantidade: 1,
          valorUnitario: Number(p.unitPrice),
          imagemUrl: p.imageUrl ?? undefined,
        },
      ],
    }));
  }

  function alterarLinha(i: number, campo: keyof Linha, valor: string | number) {
    aoMudar((o) => ({ linhas: o.linhas.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)) }));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={id("descricao")}>Descrição da opção (opcional)</Label>
        <Input
          id={id("descricao")}
          value={opcao.descricao}
          onChange={(e) => aoMudar({ descricao: e.target.value })}
          placeholder="O que diferencia esta opção: mais volume, painel maior, montagem inclusa…"
        />
      </div>

      {/* KIT E ITENS */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={id("kit")}>Kit</Label>
          <select
            id={id("kit")}
            value={opcao.kitId}
            onChange={(e) => escolherKit(e.target.value)}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Sem kit — montar peça a peça</option>
            {kits.map((k) => (
              <option key={k.id} value={k.id}>{k.name} — {brl(Number(k.basePrice))}</option>
            ))}
          </select>
        </div>
        {kitSelecionado && (
          <ComposicaoDoKit
            kitNome={kitSelecionado.kitNome}
            itens={kitSelecionado.itens}
            nota="Composição atual do catálogo. Ela fica registrada nesta opção quando a proposta for enviada e não muda depois, mesmo que o kit seja alterado."
          />
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56 space-y-1.5">
            <Label htmlFor={id("produto")}>Adicionar peça do catálogo</Label>
            <select
              id={id("produto")}
              value=""
              onChange={(e) => e.target.value && adicionarProduto(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Escolher…</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {brl(Number(p.unitPrice))}</option>
              ))}
            </select>
          </div>
          {/* A Festaê vende o que ainda não está cadastrado. A linha manual
              entra no valor e não vira item de acervo. */}
          <Button
            type="button" variant="outline" className="min-h-11"
            onClick={() => aoMudar((o) => ({ linhas: [...o.linhas, { tipo: "MANUAL", descricao: "", quantidade: 1, valorUnitario: 0 }] }))}
          >
            <Plus className="mr-1 size-4" />
            Item personalizado
          </Button>
        </div>

        {opcao.linhas.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground">
            Nenhum item nesta opção. Escolha um kit, some peças ou crie um item personalizado.
          </p>
        )}

        <div className="space-y-2">
          {opcao.linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="w-[9.5rem] space-y-1">
                <span className="painel-periodo">Tipo</span>
                <select
                  id={id(`tipo-${i}`)}
                  value={l.tipo}
                  onChange={(e) => alterarLinha(i, "tipo", e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  aria-label={`Tipo do item ${i + 1}`}
                >
                  {TIPOS_DA_LINHA.map((t) => (
                    <option key={t} value={t}>{TIPO_DA_LINHA_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 basis-48 space-y-1">
                <span className="painel-periodo">Descrição</span>
                <Input
                  id={id(`descricao-${i}`)}
                  value={l.descricao}
                  onChange={(e) => alterarLinha(i, "descricao", e.target.value)}
                  placeholder="Arco orgânico personalizado"
                  className="h-10"
                  aria-label={`Descrição do item ${i + 1}`}
                />
              </div>
              <div className="w-20 space-y-1">
                <span className="painel-periodo">Qtd</span>
                <Input
                  id={id(`qtd-${i}`)}
                  type="number" min={1} value={l.quantidade} className="h-10"
                  onChange={(e) => alterarLinha(i, "quantidade", Number(e.target.value) || 1)}
                  aria-label={`Quantidade do item ${i + 1}`}
                />
              </div>
              <div className="w-28 space-y-1">
                <span className="painel-periodo">Unitário</span>
                <Input
                  id={id(`unit-${i}`)}
                  type="number" min={0} step="0.01" value={l.valorUnitario} className="h-10"
                  onChange={(e) => alterarLinha(i, "valorUnitario", Number(e.target.value) || 0)}
                  aria-label={`Valor unitário do item ${i + 1}`}
                />
              </div>
              <div className="w-24 space-y-1 text-right">
                <span className="painel-periodo">Total</span>
                <p className="fin-numero pt-2 text-sm">{brl(totalDaLinha(l))}</p>
              </div>
              <Button
                type="button" variant="ghost" size="icon" className="h-10 w-10"
                aria-label={`Remover item ${i + 1}`}
                onClick={() => aoMudar((o) => ({ linhas: o.linhas.filter((_, k) => k !== i) }))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* IMAGENS DA OPÇÃO — a primeira é a capa dela. As mesmas URLs do
          storage: escolher do catálogo não duplica arquivo. */}
      <div className="space-y-3 border-t pt-4">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-navy)" }}>Imagens desta opção</p>
          <p className="text-xs text-muted-foreground">
            A primeira é a capa do card da opção. Pode ser inspiração, simulação ou a foto de uma festa parecida.
          </p>
        </div>
        <GaleriaDeImagens
          imagens={opcao.imagens}
          aoMudar={(imagens) => aoMudar({ imagens })}
          pasta="propostas"
          rotuloDeCapa="capa da opção"
          vazio="Nenhuma imagem nesta opção. Envie uma inspiração ou traga do catálogo abaixo."
        />
        {imagensDisponiveis.length > 0 && (
          <div>
            <p className="painel-periodo">Do catálogo</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {imagensDisponiveis.map((url) => {
                const escolhida = opcao.imagens.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() =>
                      aoMudar((o) => ({ imagens: escolhida ? o.imagens.filter((u) => u !== url) : [...o.imagens, url] }))
                    }
                    className="overflow-hidden rounded-md border-2"
                    style={{ borderColor: escolhida ? "var(--color-coral)" : "transparent" }}
                    aria-pressed={escolhida}
                    title={escolhida ? "Tirar desta opção" : "Usar nesta opção"}
                  >
                    <img src={url} alt="" className="h-20 w-28 object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* VALORES DA OPÇÃO */}
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium" style={{ color: "var(--color-navy)" }}>Investimento desta opção</p>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={id("entrega")}>Entrega</Label>
            <Input id={id("entrega")} type="number" min={0} step="0.01" value={opcao.entrega} onChange={(e) => aoMudar({ entrega: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("montagem")}>Montagem</Label>
            <Input id={id("montagem")} type="number" min={0} step="0.01" value={opcao.montagem} onChange={(e) => aoMudar({ montagem: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("desconto")}>Desconto</Label>
            <Input id={id("desconto")} type="number" min={0} step="0.01" value={opcao.desconto} onChange={(e) => aoMudar({ desconto: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-3">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={id("valorFinal")}>Valor final desta opção</Label>
              {opcao.valorFinalTocado && (
                <button
                  type="button"
                  className="text-xs underline"
                  style={{ color: "var(--color-coral-dark, #c4472a)" }}
                  onClick={() => aoMudar({ valorFinal: "", valorFinalTocado: false, baseDaComposicao: null })}
                >
                  Usar valor calculado
                </button>
              )}
            </div>
            <Input
              id={id("valorFinal")} type="number" min={0} step="0.01"
              value={opcao.valorFinalTocado ? opcao.valorFinal : String(totais.total)}
              onChange={(e) => aoMudar({ valorFinal: e.target.value, valorFinalTocado: true, baseDaComposicao: totais.total })}
            />
            <p className="text-xs text-muted-foreground">
              {opcao.valorFinalTocado
                ? `Valor negociado. A composição soma ${brl(totais.total)}.`
                : "Acompanha a composição. Digite para negociar outro valor, para baixo ou para cima."}
            </p>
            {composicaoMudou && (
              <p className="text-xs" style={{ color: "var(--color-coral-dark, #c4472a)" }}>
                A composição foi alterada. Revise o valor final desta opção.
              </p>
            )}
          </div>
        </div>

        <dl className="space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="fin-numero">{brl(totais.subtotal)}</dd></div>
          {totais.desconto > 0 && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Desconto</dt><dd className="fin-numero" style={{ color: "#c0614a" }}>− {brl(totais.desconto)}</dd></div>
          )}
          {totais.entrega > 0 && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Entrega</dt><dd className="fin-numero">{brl(totais.entrega)}</dd></div>
          )}
          {totais.montagem > 0 && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Montagem</dt><dd className="fin-numero">{brl(totais.montagem)}</dd></div>
          )}
          <div className="flex justify-between border-t pt-2">
            <dt className="text-muted-foreground">Valor calculado da composição</dt>
            <dd className="fin-numero">{brl(totais.total)}</dd>
          </div>
          <div className="flex items-baseline justify-between">
            <dt className="font-medium" style={{ color: "var(--color-navy)" }}>Valor final desta opção</dt>
            <dd className="fin-numero text-xl" style={{ color: "var(--color-navy)" }}>{brl(totais.oficial)}</dd>
          </div>
          {negociado && (
            <p className="pt-1 text-xs text-muted-foreground">
              Se a cliente escolher esta opção, é este valor que ela aprova e paga — e é dele que saem o
              sinal e o saldo. A composição fica registrada como foi montada.
            </p>
          )}
        </dl>
      </div>
    </div>
  );
}
