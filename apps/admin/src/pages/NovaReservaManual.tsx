import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  EVENT_TYPES,
  MANUAL_SALE_CHANNELS,
  eventTypeLabel,
  saleChannelLabel,
  totalDaVendaManual,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";

interface Kit {
  id: string;
  name: string;
  basePrice: string | number;
  products: { productId: string; quantity: number; product: { id: string; name: string } }[];
}
interface Tema {
  id: string;
  name: string;
}
interface Produto {
  id: string;
  name: string;
  unitPrice: string | number;
  stockQuantity: number;
}

interface ConflitoDetalhado {
  produto: string;
  estoqueTotal: number;
  jaComprometido: number;
  necessario: number;
  disponivel: number;
  reservasEmChoque: { id: string; cliente: string; status: string }[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeISO = () => new Date().toISOString().slice(0, 10);

function Campo({
  label,
  children,
  dica,
}: {
  label: string;
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs sm:h-9";

/**
 * Registro de uma venda fechada fora da loja.
 *
 * A maior parte das vendas da Festaê nasce numa conversa de WhatsApp. Sem
 * esta tela, essas reservas viviam só no caderno: o calendário da loja
 * continuava oferecendo datas já vendidas, e o mesmo painel saía duas vezes
 * no mesmo sábado.
 *
 * Uma tela só, dividida em blocos, em vez de um assistente de passos: quem
 * digita já está com a conversa inteira na frente e precisa poder voltar a
 * qualquer campo sem navegar.
 */
export default function NovaReservaManual() {
  const [, navegar] = useLocation();

  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const { data: temas } = useQuery({ queryKey: ["themes"], queryFn: () => api<Tema[]>("/themes") });
  const { data: produtos } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Produto[]>("/products"),
  });

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");

  const [data, setData] = useState("");
  const [tipo, setTipo] = useState<string>("ANIVERSARIO");
  const [themeId, setThemeId] = useState("");
  const [convidados, setConvidados] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [kitId, setKitId] = useState("");
  const [extras, setExtras] = useState<Record<string, number>>({});

  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [assembly, setAssembly] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Chapecó");

  const [valorProdutos, setValorProdutos] = useState("");
  const [entrega, setEntrega] = useState("0");
  const [montagem, setMontagem] = useState("0");
  const [desconto, setDesconto] = useState("0");
  const [sinal, setSinal] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [statusPagamento, setStatusPagamento] = useState("PENDING");

  const [origem, setOrigem] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoDetalhado[] | null>(null);

  const kitEscolhido = kits?.find((k) => k.id === kitId);

  const total = useMemo(
    () =>
      totalDaVendaManual({
        valorProdutos: Number(valorProdutos) || 0,
        entrega: Number(entrega) || 0,
        montagem: Number(montagem) || 0,
        desconto: Number(desconto) || 0,
      }),
    [valorProdutos, entrega, montagem, desconto],
  );
  const saldo = Math.max(0, total - (Number(sinal) || 0));

  const dataNoPassado = data !== "" && data < hojeISO();

  const salvar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/reservations/manual", {
        method: "POST",
        body: JSON.stringify({
          cliente: { nome, telefone, whatsapp: whatsapp || undefined, email: email || undefined },
          evento: {
            data,
            tipo,
            themeId: themeId || undefined,
            guestCount: convidados ? Number(convidados) : undefined,
            observacoes: observacoes || undefined,
          },
          produtos: {
            kitId: kitId || undefined,
            itens: Object.entries(extras)
              .filter(([, q]) => q > 0)
              .map(([productId, quantity]) => ({ productId, quantity })),
          },
          logistica: {
            fulfillment,
            assembly,
            endereco: endereco || undefined,
            bairro: bairro || undefined,
            cidade: cidade || undefined,
          },
          financeiro: {
            valorProdutos: Number(valorProdutos) || 0,
            entrega: Number(entrega) || 0,
            montagem: Number(montagem) || 0,
            desconto: Number(desconto) || 0,
            sinal: Number(sinal) || 0,
            formaPagamento,
            statusPagamento,
          },
          origem,
        }),
      }),
    onSuccess: () => {
      toast.success("Reserva registrada. A data já está bloqueada na loja.");
      navegar("/operacao");
    },
    onError: (erro) => {
      setConflitos(null);
      if (erro instanceof ApiError && erro.detalhes?.conflitos) {
        setConflitos(erro.detalhes.conflitos as ConflitoDetalhado[]);
        toast.error("Falta material para esta data.");
        return;
      }
      toast.error(erro instanceof Error ? erro.message : "Não foi possível salvar.");
    },
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setConflitos(null);

    if (!origem) return toast.error("Diga por onde esta venda foi fechada.");
    // Data no passado é digitação legítima (venda antiga sendo lançada) e
    // também o erro de digitação mais comum. Confirmar resolve os dois.
    if (dataNoPassado && !confirm("Essa data já passou. Registrar mesmo assim?")) return;

    salvar.mutate();
  }

  return (
    <form onSubmit={enviar} className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-navy">Nova reserva manual</h1>
      <p className="mb-6 text-muted-foreground">
        Venda fechada por WhatsApp, Instagram, telefone ou no balcão. Passa pelas mesmas conferências
        de agenda e de estoque da loja.
      </p>

      {conflitos && (
        <Card className="mb-6 border-red-300 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-red-800">
              Não dá para registrar: falta material nesta data
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {conflitos.map((c) => (
              <div key={c.produto}>
                <p className="font-semibold text-red-900">{c.produto}</p>
                <p className="text-red-800">
                  Acervo {c.estoqueTotal} · já comprometido {c.jaComprometido} · disponível{" "}
                  {c.disponivel} · esta reserva precisa de {c.necessario}
                </p>
                {c.reservasEmChoque.length > 0 && (
                  <p className="text-red-700">
                    Em choque com: {c.reservasEmChoque.map((r) => r.cliente).join(", ")}
                  </p>
                )}
              </div>
            ))}
            <p className="text-red-800">
              Escolha outra data, reduza a quantidade ou remarque a outra festa.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Campo label="Nome *">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </Campo>
            <Campo label="Telefone *" dica="É por ele que a operação confirma a festa no dia.">
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} required />
            </Campo>
            <Campo label="WhatsApp">
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="se for diferente do telefone"
              />
            </Campo>
            <Campo label="E-mail" dica="Opcional. Quem fecha por WhatsApp costuma não passar.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Festa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Campo
              label="Data *"
              dica={dataNoPassado ? "Atenção: essa data já passou." : undefined}
            >
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
                className={dataNoPassado ? "border-amber-500" : undefined}
              />
            </Campo>
            <Campo label="Tipo *">
              <select
                className={selectClass}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {eventTypeLabel(t)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Tema">
              <select
                className={selectClass}
                value={themeId}
                onChange={(e) => setThemeId(e.target.value)}
              >
                <option value="">Sem tema</option>
                {temas?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Convidados">
              <Input
                type="number"
                min={1}
                value={convidados}
                onChange={(e) => setConvidados(e.target.value)}
                placeholder="a combinar"
              />
            </Campo>
            <div className="md:col-span-2">
              <Campo label="Observações" dica="O que a equipe precisa saber no dia.">
                <Textarea
                  rows={3}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex.: bolo chega às 14h; portão azul; subir pelo elevador de serviço."
                />
              </Campo>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Produtos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Campo label="Kit">
              <select
                className={selectClass}
                value={kitId}
                onChange={(e) => setKitId(e.target.value)}
              >
                <option value="">Sem kit (só itens avulsos)</option>
                {kits?.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} — {brl(Number(k.basePrice))}
                  </option>
                ))}
              </select>
            </Campo>

            {kitEscolhido && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="mb-1 font-medium">Já vem no kit:</p>
                <p className="text-muted-foreground">
                  {kitEscolhido.products
                    .map((p) => `${p.quantity}× ${p.product.name}`)
                    .join(" · ")}
                </p>
              </div>
            )}

            <div>
              <Label className="mb-2 block">Itens adicionais</Label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-3">
                {produtos?.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {brl(Number(p.unitPrice))} · acervo {p.stockQuantity}
                      </span>
                    </span>
                    {/* inputMode numérico abre o teclado de números no iPhone;
                        sem isso a pessoa digita quantidade num teclado de letras. */}
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="h-11 w-20 shrink-0 text-center sm:h-9"
                      value={extras[p.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setExtras((atual) => ({ ...atual, [p.id]: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Logística</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={fulfillment === "PICKUP"}
                  onChange={() => setFulfillment("PICKUP")}
                />
                Retirada na sede
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={fulfillment === "DELIVERY"}
                  onChange={() => setFulfillment("DELIVERY")}
                />
                Entrega no local
              </label>
              <label className="flex items-center gap-2 text-sm">
                {/* Montagem é escolha independente da logística: a equipe
                    monta no local mesmo quando a cliente buscou os itens. */}
                <Checkbox checked={assembly} onCheckedChange={(v) => setAssembly(v === true)} />
                Com montagem
              </label>
            </div>
            {fulfillment === "DELIVERY" && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="md:col-span-2">
                  <Campo label="Endereço">
                    <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
                  </Campo>
                </div>
                <Campo label="Bairro">
                  <Input value={bairro} onChange={(e) => setBairro(e.target.value)} />
                </Campo>
                <Campo label="Cidade">
                  <Input value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </Campo>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo label="Valor dos produtos *">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={valorProdutos}
                  onChange={(e) => setValorProdutos(e.target.value)}
                  required
                />
              </Campo>
              <Campo label="Entrega">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={entrega}
                  onChange={(e) => setEntrega(e.target.value)}
                />
              </Campo>
              <Campo label="Montagem">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={montagem}
                  onChange={(e) => setMontagem(e.target.value)}
                />
              </Campo>
              <Campo label="Desconto">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={desconto}
                  onChange={(e) => setDesconto(e.target.value)}
                />
              </Campo>
            </div>

            {/* O valor é o que foi combinado com a cliente, não o da tabela:
                na venda por WhatsApp há negociação, e recalcular por cima
                faria o sistema discordar do que ela já ouviu. */}
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p>
                Total: <strong>{brl(total)}</strong> · Sinal: {brl(Number(sinal) || 0)} · Saldo:{" "}
                <strong>{brl(saldo)}</strong>
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo label="Sinal recebido">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0}
                  value={sinal}
                  onChange={(e) => setSinal(e.target.value)}
                  placeholder="0,00"
                />
              </Campo>
              <Campo label="Forma de pagamento">
                <select
                  className={selectClass}
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                >
                  <option value="PIX">Pix</option>
                  <option value="CARTAO">Cartão</option>
                  <option value="BOLETO">Boleto</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </Campo>
              <Campo label="Situação do sinal">
                <select
                  className={selectClass}
                  value={statusPagamento}
                  onChange={(e) => setStatusPagamento(e.target.value)}
                >
                  <option value="PENDING">A receber</option>
                  <option value="PAID">Recebido</option>
                </select>
              </Campo>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Origem da venda *</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {MANUAL_SALE_CHANNELS.map((canal) => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => setOrigem(canal)}
                  className={`min-h-11 rounded-full border px-4 py-2 text-sm transition ${
                    origem === canal
                      ? "border-navy bg-navy text-white"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  {saleChannelLabel(canal)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              É a única chance de saber por onde esta venda entrou — a loja deduz do link, aqui não
              tem como deduzir.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* No celular os botões empilham e ocupam a largura: são a última ação
          da tela e precisam ser acertados com o polegar, sem mira. */}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full sm:h-9 sm:w-auto"
          onClick={() => navegar("/reservas")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending} className="h-11 w-full sm:h-9 sm:w-auto">
          {salvar.isPending ? "Salvando..." : "Registrar reserva"}
        </Button>
      </div>
    </form>
  );
}
