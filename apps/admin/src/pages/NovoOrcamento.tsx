import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  EVENT_TYPES,
  EVENT_TYPE_META,
  MAXIMO_DE_OPCOES,
  SALE_CHANNELS,
  SALE_CHANNEL_LABELS,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EditorDaOpcao,
  novaOpcao,
  opcaoDoServidor,
  opcaoParaEnvio,
  opcaoTemConteudo,
  problemaDaOpcao,
  totaisDaOpcaoEditada,
  type KitDoCatalogo,
  type OpcaoEditada,
  type ProdutoDoCatalogo,
} from "@/components/orcamento/EditorDaOpcao";
import { useVoltar } from "@/lib/voltar";
import { api, ApiError } from "@/lib/api";
import { brl } from "@/components/financeiro/formato";

/**
 * A montagem da proposta.
 *
 * Uma tela só, em blocos, e não um assistente de quatro passos: a Maria Luiza
 * monta orçamento com a cliente no telefone, e passo que obriga a voltar para
 * corrigir um valor é passo que faz perder a conversa.
 *
 * Em cima, o que é da festa e vale para a proposta inteira (cliente, data,
 * local, validade, sinal). Embaixo, as opções de festa — cada uma com kit,
 * itens, imagens e valores próprios. A cliente escolhe uma; só ela vira
 * reserva.
 */

type Cliente = { id: string; name: string; phone: string | null; email: string | null };
type Tema = { id: string; name: string; coverImageUrl: string | null };

const hoje = () => new Date().toISOString().slice(0, 10);

export default function NovoOrcamento({ id }: { id?: string }) {
  const [, navegar] = useLocation();
  const { voltar } = useVoltar();
  const queryClient = useQueryClient();
  const editando = Boolean(id);

  const clientes = useQuery<Cliente[]>({ queryKey: ["users"], queryFn: () => api("/users") });
  const temas = useQuery<Tema[]>({ queryKey: ["themes"], queryFn: () => api("/themes") });
  const kits = useQuery<KitDoCatalogo[]>({ queryKey: ["kits"], queryFn: () => api("/kits") });
  const produtos = useQuery<ProdutoDoCatalogo[]>({ queryKey: ["products"], queryFn: () => api("/products") });
  const existente = useQuery<any>({
    queryKey: ["orcamento", id],
    queryFn: () => api(`/orcamentos/${id}`),
    enabled: editando,
  });

  const [userId, setUserId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [festejado, setFestejado] = useState("");
  const [data, setData] = useState(hoje());
  const [tipo, setTipo] = useState<string>("ANIVERSARIO");
  const [cidade, setCidade] = useState("Chapecó");
  const [local, setLocal] = useState("");
  const [convidados, setConvidados] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [themeId, setThemeId] = useState("");
  const [validade, setValidade] = useState("15");
  const [percentualDoSinal, setPercentualDoSinal] = useState("");
  /** Vazio é "não informado" — melhor que um canal escolhido ao acaso. */
  const [canal, setCanal] = useState("");
  const [mostrarValores, setMostrarValores] = useState(false);
  const [opcoes, setOpcoes] = useState<OpcaoEditada[]>(() => [novaOpcao(1)]);
  /** Quais opções estão abertas. Uma nova nasce aberta. */
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  const [removendo, setRemovendo] = useState<OpcaoEditada | null>(null);

  // A primeira opção de uma proposta nova já nasce aberta.
  useEffect(() => {
    if (!editando && opcoes.length === 1 && abertas.size === 0) setAbertas(new Set([opcoes[0].chave]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Reabre a proposta existente sem reescrever nada que já foi digitado. */
  useEffect(() => {
    const o = existente.data;
    if (!o) return;
    setUserId(o.clienteId ?? "");
    setNome(o.cliente);
    setTelefone(o.telefone);
    setEmail(o.clienteEmail ?? "");
    setFestejado(o.nomeDoFestejado ?? "");
    setData(o.festaEm);
    setTipo(o.tipoDeFesta);
    setCidade(o.cidade);
    setLocal(o.local ?? "");
    setConvidados(o.convidados ? String(o.convidados) : "");
    setObservacoes(o.observacoes ?? "");
    setThemeId(o.themeId ?? "");
    setPercentualDoSinal(o.percentualDoSinal === null || o.percentualDoSinal === undefined ? "" : String(o.percentualDoSinal));
    setCanal(o.canal ?? "");
    setMostrarValores(Boolean(o.mostrarValoresIndividuais));
    const carregadas = (o.opcoes ?? []).map(opcaoDoServidor);
    if (carregadas.length > 0) {
      setOpcoes(carregadas);
      setAbertas(new Set([carregadas[0].chave]));
    }
  }, [existente.data]);

  function escolherCliente(valor: string) {
    setUserId(valor);
    const c = clientes.data?.find((x) => x.id === valor);
    if (c) {
      setNome(c.name);
      setTelefone(c.phone ?? "");
      setEmail(c.email ?? "");
    }
  }

  function mudarOpcao(chave: string, mudanca: Partial<OpcaoEditada> | ((o: OpcaoEditada) => Partial<OpcaoEditada>)) {
    setOpcoes((atual) =>
      atual.map((o) => (o.chave === chave ? { ...o, ...(typeof mudanca === "function" ? mudanca(o) : mudanca) } : o)),
    );
  }

  function alternar(chave: string) {
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(chave)) nova.delete(chave);
      else nova.add(chave);
      return nova;
    });
  }

  function adicionarOpcao() {
    const nova = novaOpcao(opcoes.length + 1);
    setOpcoes((atual) => [...atual, nova]);
    setAbertas((atual) => new Set(atual).add(nova.chave));
    // O card novo aparece abaixo; leva a tela até ele.
    setTimeout(() => document.getElementById(`${nova.chave}-nome`)?.focus(), 50);
  }

  function mover(indice: number, delta: -1 | 1) {
    setOpcoes((atual) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atual.length) return atual;
      const nova = [...atual];
      [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
      return nova;
    });
  }

  function pedirRemocao(o: OpcaoEditada) {
    if (opcaoTemConteudo(o)) setRemovendo(o);
    else setOpcoes((atual) => atual.filter((x) => x.chave !== o.chave));
  }

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        cliente: { userId: userId || undefined, nome, telefone, email: email || undefined },
        festa: {
          data,
          tipo,
          nomeDoFestejado: festejado.trim() || undefined,
          cidade,
          local: local || undefined,
          convidados: convidados ? Number(convidados) : undefined,
          observacoes: observacoes || undefined,
        },
        proposta: {
          themeId: themeId || undefined,
          validadeEmDias: Number(validade) || 15,
          // Vazio deixa a proposta seguir o padrão do painel. Gravar a taxa
          // em toda proposta faria a mudança do padrão não alcançar nenhuma.
          percentualDoSinal: percentualDoSinal.trim() ? Number(percentualDoSinal) : undefined,
          mostrarValoresIndividuais: mostrarValores,
          canal: canal || null,
        },
        opcoes: opcoes.map(opcaoParaEnvio),
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

  const problemas = opcoes
    .map((o) => ({ o, problema: problemaDaOpcao(o) }))
    .filter((x) => x.problema !== null);
  const podeSalvar = nome.trim().length >= 2 && telefone.trim().length >= 8 && opcoes.length > 0 && problemas.length === 0;
  const capaDoTema = temas.data?.find((t) => t.id === themeId)?.coverImageUrl ?? null;

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
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>Cliente responsável</h2>
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
            <Label htmlFor="nome">Nome da cliente responsável</Label>
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
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="festejado">Nome de quem será a festa</Label>
            <Input id="festejado" value={festejado} onChange={(e) => setFestejado(e.target.value)} maxLength={120} />
            <p className="text-xs text-muted-foreground">
              Ex.: nome da criança, aniversariante ou pessoa homenageada.
            </p>
          </div>
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

      {/* O QUE VALE PARA A PROPOSTA INTEIRA */}
      <section className="painel-cartao space-y-3 p-4">
        <h2 className="text-[0.95rem] font-medium" style={{ color: "var(--color-navy)" }}>Condições da proposta</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tema">Tema</Label>
            <select id="tema" value={themeId} onChange={(e) => setThemeId(e.target.value)}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Sem tema definido</option>
              {temas.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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
              Calculado sobre a opção que a cliente escolher. Em branco usa o padrão de Conteúdo da proposta.
            </p>
          </div>
        </div>

        {/* O preço por linha é escolha comercial, não detalhe de tela: com
            ele ligado a cliente compara peça por peça com quem não monta nem
            entrega. Por isso nasce desligado. */}
        <label className="flex items-start gap-3 rounded-md border p-3">
          <input
            id="mostrarValores"
            type="checkbox"
            checked={mostrarValores}
            onChange={(e) => setMostrarValores(e.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            <span style={{ color: "var(--color-navy)" }}>Mostrar o valor de cada item na proposta</span>
            <span className="block text-xs text-muted-foreground">
              Desligado, a cliente vê o que está incluído e o investimento de cada opção. Ligado, vê o
              preço de cada linha. Aqui no painel os valores aparecem sempre.
            </span>
          </span>
        </label>
      </section>

      {/* OPÇÕES DA PROPOSTA */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[1.05rem] font-semibold" style={{ color: "var(--color-navy)" }}>Opções da proposta</h2>
          <p className="text-xs text-muted-foreground">
            Cada opção é uma festa completa, com kit, itens, imagens e valor próprios. A cliente escolhe
            uma — só ela vira reserva, pedido e sinal.
          </p>
        </div>

        {opcoes.map((o, i) => {
          const aberta = abertas.has(o.chave);
          const totais = totaisDaOpcaoEditada(o);
          const kitNome = kits.data?.find((k) => k.id === o.kitId)?.name;
          const problema = problemaDaOpcao(o);
          return (
            <article key={o.chave} className="painel-cartao overflow-hidden" data-opcao={i + 1}>
              <header className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
                <button
                  type="button"
                  onClick={() => alternar(o.chave)}
                  aria-expanded={aberta}
                  aria-controls={`${o.chave}-corpo`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                >
                  {o.imagens[0] ? (
                    <img src={o.imagens[0]} alt="" className="size-11 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-md text-sm font-semibold tabular-nums"
                      style={{ background: "#f6efe7", color: "var(--color-navy)" }}
                    >
                      {i + 1}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium" style={{ color: "var(--color-navy)" }}>
                      {o.nome.trim() || `Opção ${i + 1}`}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[kitNome ?? "Sem kit", `${o.linhas.length} ${o.linhas.length === 1 ? "item" : "itens"}`, `${o.imagens.length} ${o.imagens.length === 1 ? "imagem" : "imagens"}`].join(" · ")}
                      {problema && <span style={{ color: "var(--color-coral-dark, #c4472a)" }}> · {problema}</span>}
                    </span>
                  </span>
                </button>
                <span className="fin-numero shrink-0 text-base" style={{ color: "var(--color-navy)" }}>{brl(totais.oficial)}</span>
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon" className="size-10" disabled={i === 0}
                    aria-label={`Subir ${o.nome || `opção ${i + 1}`}`} onClick={() => mover(i, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-10" disabled={i === opcoes.length - 1}
                    aria-label={`Descer ${o.nome || `opção ${i + 1}`}`} onClick={() => mover(i, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-10" disabled={opcoes.length === 1}
                    title={opcoes.length === 1 ? "A proposta precisa de ao menos uma opção." : undefined}
                    aria-label={`Remover ${o.nome || `opção ${i + 1}`}`} onClick={() => pedirRemocao(o)}>
                    <Trash2 className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-10"
                    aria-label={aberta ? "Recolher opção" : "Abrir opção"} onClick={() => alternar(o.chave)}>
                    {aberta ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </Button>
                </div>
              </header>
              {aberta && (
                <div id={`${o.chave}-corpo`} className="space-y-5 border-t p-3 sm:p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${o.chave}-nome`}>Nome da opção</Label>
                    <Input
                      id={`${o.chave}-nome`}
                      value={o.nome}
                      maxLength={80}
                      onChange={(e) => mudarOpcao(o.chave, { nome: e.target.value })}
                      placeholder="Essencial, Completa, Premium…"
                    />
                  </div>
                  <EditorDaOpcao
                    opcao={o}
                    aoMudar={(m) => mudarOpcao(o.chave, m)}
                    kits={kits.data ?? []}
                    produtos={produtos.data ?? []}
                    capaDoTema={capaDoTema}
                    // O tema é da proposta. Um kit só o sugere quando ainda
                    // não há tema — trocar o kit de uma opção não pode mudar
                    // o tema das outras.
                    aoEscolherKit={(k) => { if (k.themeId && !themeId) setThemeId(k.themeId); }}
                  />
                </div>
              )}
            </article>
          );
        })}

        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full border-dashed"
          disabled={opcoes.length >= MAXIMO_DE_OPCOES}
          onClick={adicionarOpcao}
        >
          <Plus className="mr-1 size-4" />
          Adicionar opção de festa
        </Button>
      </section>

      {problemas.length > 0 && (
        <p className="text-right text-xs" style={{ color: "var(--color-coral-dark, #c4472a)" }}>
          Para salvar: {problemas.map(({ o, problema }) => `${o.nome.trim() || "opção sem nome"} — ${problema}`).join(" · ")}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 pb-4">
        <Button variant="outline" className="min-h-11" onClick={voltar}>
          Cancelar
        </Button>
        <Button className="min-h-11" disabled={!podeSalvar || salvar.isPending} onClick={() => salvar.mutate()}>
          {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Criar proposta"}
        </Button>
      </div>

      <AlertDialog open={removendo !== null} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{removendo?.nome.trim() || "esta opção"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `Saem da proposta ${removendo.linhas.length} ${removendo.linhas.length === 1 ? "item" : "itens"}, ${removendo.imagens.length} ${removendo.imagens.length === 1 ? "imagem" : "imagens"} e o valor desta opção (${brl(totaisDaOpcaoEditada(removendo).oficial)}). As fotos continuam no armazenamento. Nada é gravado até você salvar a proposta.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter opção</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removendo) setOpcoes((atual) => atual.filter((x) => x.chave !== removendo.chave));
                setRemovendo(null);
              }}
            >
              Remover opção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
