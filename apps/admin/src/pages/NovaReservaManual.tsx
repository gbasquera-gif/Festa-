import { useEffect, useMemo, useState } from "react";
import { useVoltar } from "@/lib/voltar";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import {
  MANUAL_SALE_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  formatarReais,
  motivoDeRecusaDaAplicacao,
  saleChannelLabel,
  totalDaVendaManual,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BlocosDaReserva,
  Campo,
  PainelDeConflitos,
  brl,
  corpoDaReserva,
  hojeISO,
  reservaEmBranco,
  selectClass,
  type ConflitoDetalhado,
  type DadosDaReserva,
} from "@/components/FormularioDeReserva";
import { ApiError, api } from "@/lib/api";
import { novaChave } from "@/lib/chave";
import { useAuth } from "@/lib/auth";

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
  // Registrar recebimento é do ADMIN: OPS cria a venda com tudo a receber.
  const { user } = useAuth();
  const ehAdmin = user?.role === "ADMIN";
  const [, navegar] = useLocation();
  const { voltar } = useVoltar();

  const [dados, setDados] = useState<DadosDaReserva>(reservaEmBranco);
  const mudar = (parcial: Partial<DadosDaReserva>) =>
    setDados((atual) => ({ ...atual, ...parcial }));

  /**
   * Como esta venda foi paga. Sem valor inicial, de propósito.
   *
   * Antes o formulário nascia em "a receber" e chamava o campo de "sinal".
   * Uma venda paga 100% à vista precisava ser descrita como um sinal, e quem
   * não trocasse o seletor gravava uma cobrança pendente numa venda que já
   * tinha sido paga — foi assim que o contrato nº 8 ficou quitado com uma
   * pendência órfã pendurada. Padrão implícito em campo que decide dinheiro
   * é a mesma causa raiz que o campo de natureza teve na Sprint 2.
   */
  const [situacao, setSituacao] = useState<"" | "INTEGRAL" | "SINAL" | "NADA">("");
  // Para OPS só há uma opção: não é padrão implícito, é a única possível.
  useEffect(() => {
    if (user && !ehAdmin && situacao === "") setSituacao("NADA");
  }, [user, ehAdmin, situacao]);
  const [sinal, setSinal] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [origem, setOrigem] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoDetalhado[] | null>(null);

  /**
   * O crédito Festaê da ficha que esta venda vai usar.
   *
   * Perguntado pelo mesmo contato que, ao salvar, decide de quem é a venda
   * (e-mail; na falta, telefone). Espera a pessoa parar de digitar para não
   * consultar a cada tecla.
   */
  const [contato, setContato] = useState({ telefone: "", email: "" });
  useEffect(() => {
    const t = setTimeout(
      () => setContato({ telefone: dados.telefone.trim(), email: dados.email.trim() }),
      400,
    );
    return () => clearTimeout(t);
  }, [dados.telefone, dados.email]);
  const contatoCompleto = contato.telefone.replace(/\D/g, "").length >= 10 || /\S+@\S+\.\S+/.test(contato.email);
  const { data: consultaDaFicha, refetch: reconsultarFicha } = useQuery<ConsultaDaFicha>({
    queryKey: ["credito-por-contato", contato.telefone, contato.email],
    queryFn: () =>
      api(
        `/creditos/por-contato?telefone=${encodeURIComponent(contato.telefone)}` +
          (contato.email ? `&email=${encodeURIComponent(contato.email)}` : ""),
      ),
    enabled: contatoCompleto,
  });
  /**
   * A ficha escolhida quando o contato bate com mais de uma (ou "nova").
   * Contato novo desfaz a escolha: ela era sobre outras fichas.
   */
  const [fichaEscolhida, setFichaEscolhida] = useState<string | null>(null);
  useEffect(() => setFichaEscolhida(null), [contato.telefone, contato.email]);
  const ambigua = consultaDaFicha?.situacao === "AMBIGUA";
  const escolheuExistente = ambigua && Boolean(fichaEscolhida) && fichaEscolhida !== "nova";
  // A lista de opções não traz o crédito de cada ficha: ele é perguntado só
  // para a ficha escolhida, pela mesma regra que vai valer ao salvar.
  const { data: consultaDaEscolhida } = useQuery<ConsultaDaFicha>({
    queryKey: ["credito-por-contato", contato.telefone, contato.email, fichaEscolhida],
    queryFn: () =>
      api(
        `/creditos/por-contato?telefone=${encodeURIComponent(contato.telefone)}` +
          (contato.email ? `&email=${encodeURIComponent(contato.email)}` : "") +
          `&fichaId=${encodeURIComponent(fichaEscolhida ?? "")}`,
      ),
    enabled: escolheuExistente,
  });
  const ficha =
    consultaDaFicha?.situacao === "UNICA" && consultaDaFicha.cliente
      ? { ...consultaDaFicha.cliente, saldo: consultaDaFicha.saldo }
      : escolheuExistente && consultaDaEscolhida?.situacao === "UNICA" && consultaDaEscolhida.cliente?.id === fichaEscolhida
        ? { ...consultaDaEscolhida.cliente, saldo: consultaDaEscolhida.saldo }
        : null;
  // Sem escolha, a venda não pode ser salva: decidir de quem ela é não cabe
  // ao sistema quando o contato bate com mais de uma pessoa.
  const fichaPendente = ambigua && !fichaEscolhida;
  const saldoDeCredito = ficha ? ficha.saldo : 0;
  const fichaComCredito = saldoDeCredito > 0 ? ficha : null;
  // Uma chave por venda digitada, com ou sem crédito: o mesmo envio repetido
  // não cria outra festa nem gasta o crédito de novo, e o reenvio com dados
  // corrigidos é recusado pelo servidor em vez de sumir.
  const [chaveDaVenda] = useState(() => novaChave());

  /** Aplicar é escolha de quem vende: nunca automático, e pode ser parcial. */
  const [usarCredito, setUsarCredito] = useState(false);
  const [valorDoCredito, setValorDoCredito] = useState("");
  // Outra ficha na tela (telefone ou e-mail trocado) desfaz a escolha: o
  // crédito escolhido era de outra pessoa.
  useEffect(() => {
    setUsarCredito(false);
    setValorDoCredito("");
  }, [fichaComCredito?.id]);

  const total = useMemo(
    () =>
      totalDaVendaManual({
        valorProdutos: Number(dados.valorProdutos) || 0,
        entrega: Number(dados.entrega) || 0,
        montagem: Number(dados.montagem) || 0,
        desconto: Number(dados.desconto) || 0,
      }),
    [dados.valorProdutos, dados.entrega, dados.montagem, dados.desconto],
  );
  /**
   * O que a API recebe, derivado da escolha — nunca digitado em paralelo.
   *
   * "Pago integralmente" não pede valor: ele É o total. Deixar a pessoa
   * digitar o valor de novo abriria a porta para R$ 219,00 numa venda de
   * R$ 220,00, e o contrato nasceria com saldo de um real para sempre.
   */
  const creditoUsado = usarCredito && fichaComCredito ? Number(valorDoCredito) || 0 : 0;
  // Com crédito, "pago integralmente" é o que sobra depois dele: o crédito
  // cobre a sua parte, e a cliente pagou o resto.
  const recebido =
    situacao === "INTEGRAL"
      ? Math.max(0, Math.round((total - creditoUsado) * 100) / 100)
      : situacao === "SINAL"
        ? Number(sinal) || 0
        : 0;
  const statusPagamento = situacao === "NADA" || situacao === "" ? "PENDING" : "PAID";
  const saldo = Math.max(0, Math.round((total - creditoUsado - recebido) * 100) / 100);
  const recusaDoCredito =
    usarCredito && fichaComCredito
      ? motivoDeRecusaDaAplicacao({
          valor: creditoUsado,
          saldoDaCliente: saldoDeCredito,
          faltaPagar: total - (situacao === "SINAL" ? Number(sinal) || 0 : 0),
        })
      : null;

  // Sinal sem valor não é uma venda descrita: é a escolha pela metade.
  const faltaEscolher = situacao === "";
  const sinalSemValor = situacao === "SINAL" && recebido <= 0;
  const sinalMaiorQueTotal = situacao === "SINAL" && total > 0 && recebido + creditoUsado > total;
  // "Pago integralmente" com total zerado gravaria uma venda marcada como
  // paga sem pagamento nenhum: o valor recebido seria zero, e o servidor não
  // cria lançamento de R$ 0,00. A venda nasceria dizendo uma coisa e
  // registrando outra.
  const integralSemTotal = situacao === "INTEGRAL" && total <= 0;
  const pagamentoIncompleto =
    faltaEscolher || sinalSemValor || sinalMaiorQueTotal || integralSemTotal || Boolean(recusaDoCredito) || fichaPendente;

  const dataNoPassado = dados.data !== "" && dados.data < hojeISO();

  const salvar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/reservations/manual", {
        method: "POST",
        body: JSON.stringify({
          ...corpoDaReserva(dados),
          ...(ambigua && fichaEscolhida
            ? { cliente: { ...corpoDaReserva(dados).cliente, fichaId: fichaEscolhida } }
            : {}),
          financeiro: {
            valorProdutos: Number(dados.valorProdutos) || 0,
            entrega: Number(dados.entrega) || 0,
            montagem: Number(dados.montagem) || 0,
            desconto: Number(dados.desconto) || 0,
            sinal: recebido,
            formaPagamento,
            statusPagamento,
          },
          origem,
          chaveDeIdempotencia: chaveDaVenda,
          ...(creditoUsado > 0 && fichaComCredito ? { credito: { clienteId: fichaComCredito.id, valor: creditoUsado } } : {}),
        }),
      }),
    // Com o sinal já recebido, a cliente está esperando o comprovante do
    // outro lado — cair direto nele poupa a operação de procurar a reserva
    // que ela acabou de digitar. Sem sinal não há o que comprovar, e o
    // caminho segue para a lista de festas do dia.
    onSuccess: (reserva) => {
      const sinalRecebido = recebido > 0 || creditoUsado > 0;
      toast.success(
        sinalRecebido
          ? "Reserva registrada. Aqui está o comprovante para enviar à cliente."
          : "Reserva registrada. A data já está bloqueada na loja.",
      );
      navegar(sinalRecebido ? `/reservas/${reserva.id}/comprovante` : "/operacao");
    },
    onError: (erro) => {
      setConflitos(null);
      // A ficha mudou entre a consulta e o envio (outra venda criou uma
      // parecida): a tela pergunta de novo, com as opções atuais.
      if (erro instanceof ApiError && (erro.detalhes?.codigo === "FICHA_AMBIGUA" || erro.detalhes?.codigo === "FICHA_INVALIDA")) {
        setFichaEscolhida(null);
        void reconsultarFicha();
        toast.error(erro.message);
        return;
      }
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
        <PainelDeConflitos
          conflitos={conflitos}
          titulo="Não dá para registrar: falta material nesta data"
        />
      )}

      <div className="space-y-6">
        <BlocosDaReserva valor={dados} mudar={mudar} />

        {ambigua && (
          <EscolhaDaFicha
            candidatas={consultaDaFicha.candidatas}
            podeCriarNova={Boolean(consultaDaFicha.podeCriarNova)}
            escolhida={fichaEscolhida}
            escolher={setFichaEscolhida}
          />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pagamento *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* O aviso de crédito fica no topo do pagamento, onde a decisão
                de quanto cobrar é tomada — e com destaque, porque esquecer é
                cobrar da cliente um dinheiro que já é dela na Festaê. */}
            {fichaComCredito && (
              <div
                className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
                data-aviso-credito
              >
                <p className="flex items-start gap-2 font-medium">
                  <Ticket className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Esta cliente possui {formatarReais(saldoDeCredito)} em crédito Festaê disponível.
                </p>
                {!usarCredito ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-emerald-400 bg-white sm:h-9 sm:w-auto"
                    onClick={() => {
                      setUsarCredito(true);
                      setValorDoCredito(Math.min(saldoDeCredito, total || saldoDeCredito).toFixed(2));
                    }}
                  >
                    Aplicar crédito nesta festa
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <Campo label="Crédito a usar nesta festa">
                      <Input
                        id="credito-na-venda"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        max={saldoDeCredito}
                        value={valorDoCredito}
                        onChange={(e) => setValorDoCredito(e.target.value)}
                      />
                    </Campo>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 sm:h-9"
                      onClick={() => {
                        setUsarCredito(false);
                        setValorDoCredito("");
                      }}
                    >
                      Não aplicar
                    </Button>
                    <p className="w-full text-xs">
                      Pode ser parcial. O crédito abate o que a cliente tem a pagar; o valor da festa não muda.
                    </p>
                    {!recusaDoCredito && creditoUsado > 0 && (
                      <p className="w-full text-xs font-medium" data-credito-que-sobra>
                        Crédito que sobra para a cliente:{" "}
                        {formatarReais(Math.max(0, Math.round((saldoDeCredito - creditoUsado) * 100) / 100))}.
                      </p>
                    )}
                  </div>
                )}
                {recusaDoCredito && <p className="text-sm text-destructive">{recusaDoCredito}</p>}
              </div>
            )}

            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p>
                Total: <strong>{brl(total)}</strong>
                {creditoUsado > 0 && <> · Crédito Festaê: {brl(creditoUsado)}</>} · Recebido: {brl(recebido)} ·
                Saldo: <strong>{brl(saldo)}</strong>
              </p>
            </div>

            {/* Três botões sem pré-seleção, em vez de um seletor que já nasce
                respondido. Enquanto nenhum estiver marcado, não dá para
                salvar — a venda não foi descrita. */}
            <div
              role="radiogroup"
              aria-label="Situação do pagamento"
              className="grid gap-2 sm:grid-cols-3"
            >
              {[
                { chave: "INTEGRAL", titulo: "Pago integralmente", nota: "a cliente já pagou tudo" },
                { chave: "SINAL", titulo: "Sinal recebido", nota: "parte agora, saldo na festa" },
                { chave: "NADA", titulo: "A receber", nota: ehAdmin ? "nada recebido ainda" : "o ADMIN registra o recebimento depois" },
              ].filter(({ chave }) => ehAdmin || chave === "NADA").map(({ chave, titulo, nota }) => {
                const marcado = situacao === chave;
                return (
                  <button
                    key={chave}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => {
                      setSituacao(chave as typeof situacao);
                      // Trocar de opção não pode deixar para trás o valor
                      // digitado na anterior: ele viraria um recebimento que
                      // ninguém escolheu registrar.
                      if (chave !== "SINAL") setSinal("");
                    }}
                    className={`rounded-md border p-3 text-left transition ${
                      marcado
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-input hover:bg-muted/50"
                    }`}
                  >
                    <span className="block text-sm font-medium">{titulo}</span>
                    <span className="block text-xs text-muted-foreground">{nota}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {situacao === "SINAL" && (
                <Campo label="Valor recebido *">
                  <Input
                    id="valor-recebido"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={sinal}
                    onChange={(e) => setSinal(e.target.value)}
                    placeholder="0,00"
                    autoFocus
                  />
                </Campo>
              )}
              {situacao !== "" && situacao !== "NADA" && (
                <Campo label="Forma de pagamento">
                  <select
                    className={selectClass}
                    value={formaPagamento}
                    onChange={(e) => setFormaPagamento(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </Campo>
              )}
            </div>

            {integralSemTotal && (
              <p className="text-sm text-destructive">
                O total está zerado. Informe o valor dos produtos antes de marcar como pago.
              </p>
            )}
            {sinalSemValor && (
              <p className="text-sm text-destructive">
                Informe quanto foi recebido, ou marque &ldquo;A receber&rdquo;.
              </p>
            )}
            {sinalMaiorQueTotal && (
              <p className="text-sm text-destructive">
                O valor recebido é maior que o total da venda. Se ela foi paga inteira, marque
                &ldquo;Pago integralmente&rdquo;.
              </p>
            )}
            {faltaEscolher && (
              <p className="text-sm text-muted-foreground">
                Escolha uma situação para poder registrar a reserva.
              </p>
            )}
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
          onClick={voltar}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={salvar.isPending || pagamentoIncompleto}
          className="h-11 w-full sm:h-9 sm:w-auto"
        >
          {salvar.isPending ? "Salvando..." : "Registrar reserva"}
        </Button>
      </div>
    </form>
  );
}

type CandidataDeFicha = {
  id: string;
  nome: string;
  /** Mascarados pelo servidor: o final do telefone, o começo do e-mail. */
  telefone: string | null;
  email: string | null;
  porEmail: boolean;
  porTelefone: boolean;
  desde: string;
  festas: number;
};

type ConsultaDaFicha = {
  situacao: "UNICA" | "AMBIGUA" | "NOVA" | "ESCOLHA_INVALIDA";
  cliente: { id: string; nome: string } | null;
  saldo: number;
  podeCriarNova?: boolean;
  candidatas: CandidataDeFicha[];
};

/**
 * Qual ficha é esta cliente, quando o telefone ou o e-mail bate com mais de
 * uma. A venda só salva depois da escolha — e o crédito oferecido é o da
 * ficha escolhida, nunca o de outra pessoa com o mesmo telefone.
 */
function EscolhaDaFicha({
  candidatas,
  podeCriarNova,
  escolhida,
  escolher,
}: {
  candidatas: CandidataDeFicha[];
  podeCriarNova: boolean;
  escolhida: string | null;
  escolher: (id: string) => void;
}) {
  const opcoes = [
    ...candidatas.map((c) => ({
      id: c.id,
      titulo: c.nome,
      detalhe: [
        c.telefone && `tel. ${c.telefone}`,
        c.email,
        `${c.festas} festa${c.festas === 1 ? "" : "s"}`,
        `desde ${new Date(c.desde).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`,
      ]
        .filter(Boolean)
        .join(" · "),
      bate: [c.porTelefone && "telefone", c.porEmail && "e-mail"].filter(Boolean).join(" e "),
    })),
    ...(podeCriarNova ? [{ id: "nova", titulo: "Nenhuma destas: criar ficha nova", detalhe: "", bate: "" }] : []),
  ];
  return (
    <Card data-escolha-da-ficha>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Qual ficha é esta cliente? *</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          O telefone ou o e-mail digitado bate com mais de uma ficha. Escolha a certa: a venda e o crédito Festaê
          ficam nela.
        </p>
        <div role="radiogroup" aria-label="Ficha da cliente" className="grid gap-2">
          {opcoes.map((o) => {
            const marcada = escolhida === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => escolher(o.id)}
                className={`min-h-11 rounded-md border p-3 text-left text-sm transition-colors ${
                  marcada ? "border-navy bg-navy/5 ring-1 ring-navy" : "hover:bg-muted/50"
                }`}
              >
                <span className="block font-medium text-navy [overflow-wrap:anywhere]">{o.titulo}</span>
                {o.detalhe && <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{o.detalhe}</span>}
                {o.bate && <span className="block text-xs text-muted-foreground">bate pelo {o.bate}</span>}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
