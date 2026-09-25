import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  EVENT_TYPES,
  EVENT_TYPE_META,
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
  TIPOS_DA_LINHA,
  TIPO_DA_LINHA_LABEL,
  calcularOrcamento,
  toCentsInt,
  totalDaLinha,
  type TipoDaLinha,
  montarComposicaoDoKit,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { ComposicaoDoKit } from "@/components/orcamento/ComposicaoDoKit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVoltar } from "@/lib/voltar";
import { api, ApiError } from "@/lib/api";
import { GaleriaDeImagens } from "@/components/GaleriaDeImagens";
import { brl } from "@/components/financeiro/formato";

/**
 * A montagem da proposta.
 *
 * Uma tela só, em blocos, e não um assistente de quatro passos: a Maria Luiza
 * monta orçamento com a cliente no telefone, e passo que obriga a voltar para
 * corrigir um valor é passo que faz perder a conversa.
 *
 * O total é calculado pela mesma função de @festae/shared que o servidor usa
 * para gravar. A tela nunca mostra um número que o banco não vai confirmar.
 */

type Cliente = { id: string; name: string; phone: string | null; email: string | null };
type Tema = { id: string; name: string; coverImageUrl: string | null };
type Kit = {
  id: string; name: string; basePrice: string;
  coverImageUrl: string | null; images: string[]; themeId: string | null;
  products?: { quantity: number; product: { id: string; name: string; active: boolean } }[];
};
type Produto = { id: string; name: string; unitPrice: string; imageUrl: string | null; category: string };

type Linha = {
  tipo: TipoDaLinha;
  productId?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  imagemUrl?: string;
};

const hoje = () => new Date().toISOString().slice(0, 10);

export default function NovoOrcamento({ id }: { id?: string }) {
  const [, navegar] = useLocation();
  const { voltar } = useVoltar();
  const queryClient = useQueryClient();
  const editando = Boolean(id);

  const clientes = useQuery<Cliente[]>({ queryKey: ["users"], queryFn: () => api("/users") });
  const temas = useQuery<Tema[]>({ queryKey: ["themes"], queryFn: () => api("/themes") });
  const kits = useQuery<Kit[]>({ queryKey: ["kits"], queryFn: () => api("/kits") });
  const produtos = useQuery<Produto[]>({ queryKey: ["products"], queryFn: () => api("/products") });
  const existente = useQuery<any>({
    queryKey: ["orcamento", id],
    queryFn: () => api(`/orcamentos/${id}`),
    enabled: editando,
  });

  const [userId, setUserId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [data, setData] = useState(hoje());
  const [tipo, setTipo] = useState<string>("ANIVERSARIO");
  const [cidade, setCidade] = useState("Chapecó");
  const [local, setLocal] = useState("");
  const [convidados, setConvidados] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [themeId, setThemeId] = useState("");
  const [kitId, setKitId] = useState("");
  const [validade, setValidade] = useState("15");
  const [percentualDoSinal, setPercentualDoSinal] = useState("");
  /** Vazio é "não informado" — melhor que um canal escolhido ao acaso. */
  const [canal, setCanal] = useState("");
  const [mostrarValores, setMostrarValores] = useState(false);
  const [imagens, setImagens] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [desconto, setDesconto] = useState("0");
  const [entrega, setEntrega] = useState("0");
  const [montagem, setMontagem] = useState("0");
  /**
   * O valor final negociado.
   *
   * Enquanto ninguém digita nada, ele não existe: o oficial é a soma da
   * composição, e acompanha qualquer mexida nos itens. Digitado, ele passa a
   * valer — e não é sobrescrito quando a composição muda, porque valor
   * combinado com a cliente não se atualiza sozinho.
   */
  const [valorFinal, setValorFinal] = useState("");
  const [valorFinalTocado, setValorFinalTocado] = useState(false);
  /** A composição de quando o valor final foi digitado, para saber se ela mudou depois. */
  const [baseDaComposicao, setBaseDaComposicao] = useState<number | null>(null);

  /** Reabre a proposta existente sem reescrever nada que já foi digitado. */
  useEffect(() => {
    const o = existente.data;
    if (!o) return;
    setUserId(o.clienteId ?? "");
    setNome(o.cliente);
    setTelefone(o.telefone);
    setEmail(o.clienteEmail ?? "");
    setData(o.festaEm);
    setTipo(o.tipoDeFesta);
    setCidade(o.cidade);
    setLocal(o.local ?? "");
    setConvidados(o.convidados ? String(o.convidados) : "");
    setObservacoes(o.observacoes ?? "");
    setThemeId(o.themeId ?? "");
    setKitId(o.kitId ?? "");
    setImagens(o.imagens ?? []);
    setPercentualDoSinal(o.percentualDoSinal === null || o.percentualDoSinal === undefined ? "" : String(o.percentualDoSinal));
    setCanal(o.canal ?? "");
    setMostrarValores(Boolean(o.mostrarValoresIndividuais));
    setDesconto(String(o.valores.desconto));
    setEntrega(String(o.valores.entrega));
    setMontagem(String(o.valores.montagem));
    if (o.valores.valorFinalManual) {
      setValorFinal(String(o.valores.total));
      setValorFinalTocado(true);
      setBaseDaComposicao(o.valores.totalCalculado);
    }
    setLinhas(
      o.linhas.map((l: any) => ({
        tipo: l.tipo,
        productId: l.productId ?? undefined,
        descricao: l.descricao,
        quantidade: l.quantidade,
        valorUnitario: l.valorUnitario,
        imagemUrl: l.imagemUrl ?? undefined,
      })),
    );
  }, [existente.data]);

  const totais = useMemo(
    () => calcularOrcamento(linhas, Number(desconto) || 0, Number(entrega) || 0, Number(montagem) || 0),
    [linhas, desconto, entrega, montagem],
  );

  const valorOficial = valorFinalTocado ? Number(valorFinal) || 0 : totais.total;
  const negociado = valorFinalTocado && toCentsInt(valorOficial) !== toCentsInt(totais.total);
  /** A composição mudou depois de o valor final ter sido combinado. */
  const composicaoMudou =
    valorFinalTocado &&
    baseDaComposicao !== null &&
    toCentsInt(baseDaComposicao) !== toCentsInt(totais.total);

  const digitarValorFinal = (v: string) => {
    setValorFinal(v);
    setValorFinalTocado(true);
    setBaseDaComposicao(totais.total);
  };
  const usarValorCalculado = () => {
    setValorFinal("");
    setValorFinalTocado(false);
    setBaseDaComposicao(null);
  };

  /** As imagens que a proposta pode mostrar, vindas do que foi escolhido. */
  const imagensDisponiveis = useMemo(() => {
    const doKit = kits.data?.find((k) => k.id === kitId);
    const doTema = temas.data?.find((t) => t.id === themeId);
    const daslinhas = linhas.map((l) => l.imagemUrl).filter(Boolean) as string[];
    return Array.from(
      new Set(
        [
          doKit?.coverImageUrl,
          ...(doKit?.images ?? []),
          doTema?.coverImageUrl,
          ...daslinhas,
        ].filter(Boolean) as string[],
      ),
    );
  }, [kitId, themeId, kits.data, temas.data, linhas]);

  function escolherCliente(valor: string) {
    setUserId(valor);
    const c = clientes.data?.find((x) => x.id === valor);
    if (c) {
      setNome(c.name);
      setTelefone(c.phone ?? "");
      setEmail(c.email ?? "");
    }
  }

  // A composição do kit escolhido, do catálogo — só para ver. Não vira linha
  // nem muda valor: o kit continua cobrado pela linha KIT.
  const kitDoCatalogo = kits.data?.find((k) => k.id === kitId);
  const kitSelecionado = kitDoCatalogo ? montarComposicaoDoKit({ ...kitDoCatalogo, products: kitDoCatalogo.products ?? [] }) : null;

  function adicionarKit(valor: string) {
    setKitId(valor);
    const k = kits.data?.find((x) => x.id === valor);
    if (!k) return;
    if (k.themeId) setThemeId(k.themeId);
    setLinhas((atual) => [
      ...atual.filter((l) => l.tipo !== "KIT"),
      {
        tipo: "KIT",
        descricao: k.name,
        quantidade: 1,
        valorUnitario: Number(k.basePrice),
        imagemUrl: k.coverImageUrl ?? undefined,
      },
    ]);
  }

  function adicionarProduto(produtoId: string) {
    const p = produtos.data?.find((x) => x.id === produtoId);
    if (!p) return;
    setLinhas((atual) => [
      ...atual,
      {
        tipo: p.category === "BALAO" ? "BALOES" : "PRODUTO",
        productId: p.id,
        descricao: p.name,
        quantidade: 1,
        valorUnitario: Number(p.unitPrice),
        imagemUrl: p.imageUrl ?? undefined,
      },
    ]);
  }

  function adicionarManual() {
    setLinhas((atual) => [
      ...atual,
      { tipo: "MANUAL", descricao: "", quantidade: 1, valorUnitario: 0 },
    ]);
  }

  function alterarLinha(i: number, campo: keyof Linha, valor: string | number) {
    setLinhas((atual) => atual.map((l, k) => (k === i ? { ...l, [campo]: valor } : l)));
  }

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        cliente: { userId: userId || undefined, nome, telefone, email: email || undefined },
        festa: {
          data,
          tipo,
          cidade,
          local: local || undefined,
          convidados: convidados ? Number(convidados) : undefined,
          observacoes: observacoes || undefined,
        },
        proposta: {
          themeId: themeId || undefined,
          kitId: kitId || undefined,
          imagens,
          validadeEmDias: Number(validade) || 15,
          // Vazio deixa a proposta seguir o padrão do painel. Gravar a taxa
          // em toda proposta faria a mudança do padrão não alcançar nenhuma.
          percentualDoSinal: percentualDoSinal.trim() ? Number(percentualDoSinal) : undefined,
          mostrarValoresIndividuais: mostrarValores,
          canal: canal || null,
        },
        itens: linhas.map((l) => ({
          tipo: l.tipo,
          productId: l.productId || undefined,
          descricao: l.descricao,
          quantidade: l.quantidade,
          valorUnitario: l.valorUnitario,
          imagemUrl: l.imagemUrl || undefined,
        })),
        valores: {
          desconto: Number(desconto) || 0,
          entrega: Number(entrega) || 0,
          montagem: Number(montagem) || 0,
          // Nulo quer dizer "acompanhe a composição". Mandar sempre o número
          // faria toda proposta nascer com valor travado à mão.
          valorFinal: valorFinalTocado ? Number(valorFinal) || 0 : null,
        },
      };
      return editando
        ? api<{ versionada: boolean }>(`/orcamentos/${id}`, { method: "PUT", body: JSON.stringify(corpo) })
        : api<{ id: string }>("/orcamentos", { method: "POST", body: JSON.stringify(corpo) });
    },
    onSuccess: (r: any) => {
      queryClient.invalidateQueries({ queryKey: ["orcamentos"] });
      queryClient.invalidateQueries({ queryKey: ["orcamento", id] });
      if (editando) {
        toast.success(r?.versionada ? "Nova versão criada. A anterior ficou no histórico." : "Proposta atualizada.");
        navegar(`/comercial/orcamentos/${id}`);
      } else {
        toast.success("Proposta criada.");
        navegar(`/comercial/orcamentos/${r.id}`);
      }
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Não foi possível salvar a proposta."),
  });

  const podeSalvar = nome.trim().length >= 2 && telefone.trim().length >= 8 && linhas.length > 0 &&
    linhas.every((l) => l.descricao.trim().length >= 2);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[1.65rem] font-semibold" style={{ color: "var(--color-navy)" }}>
          {editando ? "Editar proposta" : "Novo orçamento"}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {editando
            ? "Proposta já enviada gera uma versão nova — a que a cliente recebeu fica no histórico."
            : "Monte a proposta e envie o link. Nada aqui reserva data nem peça."}
        </p>
      </div>

      {/* CLIENTE */}
      <section className="painel-cartao space-y-3 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>Cliente</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cliente">Cliente já cadastrado</Label>
            <select
              id="cliente"
              value={userId}
              onChange={(e) => escolherCliente(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Novo cliente — digitar abaixo</option>
              {clientes.data
                ?.filter((c) => !c.name.startsWith("Cliente removido"))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone / WhatsApp</Label>
            <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail (opcional)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="canal">Como chegou até a Festaê</Label>
            <select
              id="canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Não informado</option>
              {SALE_CHANNELS.map((c) => (
                <option key={c} value={c}>{SALE_CHANNEL_LABELS[c]}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Se ficar em branco, o canal é pedido na hora de virar reserva.
            </p>
          </div>
        </div>
      </section>

      {/* FESTA */}
      <section className="painel-cartao space-y-3 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>A festa</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="data">Data</Label>
            <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_META[t].label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="convidados">Convidados</Label>
            <Input id="convidados" type="number" min={1} value={convidados}
              onChange={(e) => setConvidados(e.target.value)} placeholder="a combinar" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="local">Local (opcional)</Label>
            <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)}
              placeholder="Salão, casa, chácara…" />
          </div>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="obs">Observações</Label>
            <Input id="obs" value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              placeholder="O que a cliente pediu, cores, detalhes" />
          </div>
        </div>
      </section>

      {/* SOLUÇÃO */}
      <section className="painel-cartao space-y-3 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>A solução</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tema">Tema</Label>
            <select id="tema" value={themeId} onChange={(e) => setThemeId(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Sem tema definido</option>
              {temas.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit">Kit</Label>
            <select id="kit" value={kitId} onChange={(e) => adicionarKit(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Sem kit — montar peça a peça</option>
              {kits.data?.map((k) => (
                <option key={k.id} value={k.id}>{k.name} — {brl(Number(k.basePrice))}</option>
              ))}
            </select>
          </div>
          {kitSelecionado && (
            <div className="sm:col-span-2">
              <ComposicaoDoKit
                kitNome={kitSelecionado.kitNome}
                itens={kitSelecionado.itens}
                nota="Composição atual do catálogo. Ela fica registrada na proposta quando for enviada e não muda depois, mesmo que o kit seja alterado."
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="min-w-[14rem] flex-1 space-y-1.5">
            <Label htmlFor="produto">Adicionar peça do catálogo</Label>
            <select
              id="produto"
              value=""
              onChange={(e) => e.target.value && adicionarProduto(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Escolher…</option>
              {produtos.data?.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {brl(Number(p.unitPrice))}</option>
              ))}
            </select>
          </div>
          {/* A Festaê vende o que ainda não está cadastrado. A linha manual
              entra no valor e não vira item de acervo — virar produto é
              decisão de catálogo, não efeito colateral de uma proposta. */}
          <Button type="button" variant="outline" className="min-h-11" onClick={adicionarManual}>
            <Plus className="mr-1 size-4" />
            Item personalizado
          </Button>
        </div>

        {linhas.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum item ainda. Escolha um kit, some peças ou crie um item personalizado.
          </p>
        )}

        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="w-[9.5rem] space-y-1">
                <span className="painel-periodo">Tipo</span>
                <select
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
              <div className="min-w-[12rem] flex-1 space-y-1">
                <span className="painel-periodo">Descrição</span>
                <Input
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
                  type="number" min={1} value={l.quantidade} className="h-10"
                  onChange={(e) => alterarLinha(i, "quantidade", Number(e.target.value) || 1)}
                  aria-label={`Quantidade do item ${i + 1}`}
                />
              </div>
              <div className="w-28 space-y-1">
                <span className="painel-periodo">Unitário</span>
                <Input
                  type="number" min={0} step="0.01" value={l.valorUnitario} className="h-10"
                  onChange={(e) => alterarLinha(i, "valorUnitario", Number(e.target.value) || 0)}
                  aria-label={`Valor unitário do item ${i + 1}`}
                />
              </div>
              <div className="w-28 space-y-1 text-right">
                <span className="painel-periodo">Total</span>
                <p className="fin-numero pt-2 text-sm">{brl(totalDaLinha(l))}</p>
              </div>
              <Button
                type="button" variant="ghost" size="icon" className="h-10 w-10"
                aria-label={`Remover item ${i + 1}`}
                onClick={() => setLinhas((atual) => atual.filter((_, k) => k !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* IMAGENS
        *
        * Uma lista só, em ordem, com a primeira valendo como capa. As fotos
        * podem vir de dois lugares — upload feito para esta cliente e
        * catálogo —, mas para a proposta elas são a mesma coisa: o que a
        * pessoa vai ver, nesta ordem. Duas listas separadas obrigariam a
        * decidir qual aparece primeiro, que é justamente o que a ordem já
        * responde. */}
      <section className="painel-cartao space-y-4 p-4">
        <div>
          <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>
            Como imaginamos a festa
          </h2>
          <p className="text-xs text-muted-foreground">
            As imagens que abrem a proposta, antes da lista de itens. Podem ser uma inspiração, uma
            simulação ou a foto de uma festa parecida.
          </p>
        </div>

        <GaleriaDeImagens
          imagens={imagens}
          aoMudar={setImagens}
          pasta="propostas"
          vazio="Nenhuma imagem escolhida. Envie uma inspiração ou traga do catálogo abaixo."
        />

        {imagensDisponiveis.length > 0 && (
          <div className="border-t pt-4">
            <p className="painel-periodo">Do catálogo</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Fotos do tema, do kit e das peças escolhidas. Nenhuma entra sozinha — nem toda foto
              do catálogo serve para toda festa.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {imagensDisponiveis.map((url) => {
                const escolhida = imagens.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() =>
                      setImagens((atual) =>
                        escolhida ? atual.filter((u) => u !== url) : [...atual, url],
                      )
                    }
                    className="overflow-hidden rounded-md border-2"
                    style={{ borderColor: escolhida ? "var(--color-coral)" : "transparent" }}
                    aria-pressed={escolhida}
                    title={escolhida ? "Tirar da proposta" : "Usar nesta proposta"}
                  >
                    <img src={url} alt="" className="h-20 w-28 object-cover" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* VALORES */}
      <section className="painel-cartao space-y-3 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>Investimento</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="entrega">Entrega</Label>
            <Input id="entrega" type="number" min={0} step="0.01" value={entrega} onChange={(e) => setEntrega(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="montagem">Montagem</Label>
            <Input id="montagem" type="number" min={0} step="0.01" value={montagem} onChange={(e) => setMontagem(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desconto">Desconto</Label>
            <Input id="desconto" type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="valorFinal">Valor final da proposta</Label>
              {valorFinalTocado && (
                <button
                  type="button"
                  className="text-xs underline"
                  style={{ color: "var(--color-coral-dark, #c4472a)" }}
                  onClick={usarValorCalculado}
                >
                  Usar valor calculado
                </button>
              )}
            </div>
            <Input
              id="valorFinal" type="number" min={0} step="0.01"
              value={valorFinalTocado ? valorFinal : String(totais.total)}
              onChange={(e) => digitarValorFinal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {valorFinalTocado
                ? `Valor negociado. A composição soma ${brl(totais.total)}.`
                : "Acompanha a composição. Digite para negociar outro valor, para baixo ou para cima."}
            </p>
            {composicaoMudou && (
              <p className="text-xs" style={{ color: "var(--color-coral-dark, #c4472a)" }}>
                A composição foi alterada. Revise o valor final da proposta.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="validade">Validade (dias)</Label>
            <Input id="validade" type="number" min={1} value={validade} onChange={(e) => setValidade(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sinal">Sinal (%)</Label>
            <Input
              id="sinal" type="number" min={0} max={100} value={percentualDoSinal}
              onChange={(e) => setPercentualDoSinal(e.target.value)}
              placeholder="padrão do painel"
            />
            <p className="text-xs text-muted-foreground">
              Em branco usa o percentual configurado em Conteúdo da proposta.
            </p>
          </div>
        </div>

        {/* O preço por linha é escolha comercial, não detalhe de tela: com
            ele ligado a cliente compara peça por peça com quem não monta nem
            entrega. Por isso nasce desligado. */}
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            type="checkbox"
            checked={mostrarValores}
            onChange={(e) => setMostrarValores(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            <span style={{ color: "var(--color-navy)" }}>Mostrar o valor de cada item na proposta</span>
            <span className="block text-xs text-muted-foreground">
              Desligado, a cliente vê o que está incluído e o investimento total. Ligado, vê o
              preço de cada linha. Aqui no painel os valores aparecem sempre.
            </span>
          </span>
        </label>

        <dl className="mt-2 space-y-1 border-t pt-3 text-sm">
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
            <dt className="font-medium" style={{ color: "var(--color-navy)" }}>Valor final da proposta</dt>
            <dd className="fin-numero text-xl" style={{ color: "var(--color-navy)" }}>{brl(valorOficial)}</dd>
          </div>
          {negociado && (
            <p className="pt-1 text-xs text-muted-foreground">
              É este valor que a cliente vê, aprova e paga — e é dele que saem o sinal e o saldo. A
              composição fica registrada como foi montada, sem redistribuir a diferença entre os
              itens.
            </p>
          )}
        </dl>
      </section>

      <div className="flex flex-wrap justify-end gap-2 pb-4">
        <Button variant="outline" className="min-h-11" onClick={voltar}>
          Cancelar
        </Button>
        <Button className="min-h-11" disabled={!podeSalvar || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Criar proposta"}
        </Button>
      </div>
    </div>
  );
}
