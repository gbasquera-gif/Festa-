import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  MANUAL_SALE_CHANNELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
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
  const [sinal, setSinal] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [origem, setOrigem] = useState("");
  const [conflitos, setConflitos] = useState<ConflitoDetalhado[] | null>(null);

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
  const recebido =
    situacao === "INTEGRAL" ? total : situacao === "SINAL" ? Number(sinal) || 0 : 0;
  const statusPagamento = situacao === "NADA" || situacao === "" ? "PENDING" : "PAID";
  const saldo = Math.max(0, total - recebido);

  // Sinal sem valor não é uma venda descrita: é a escolha pela metade.
  const faltaEscolher = situacao === "";
  const sinalSemValor = situacao === "SINAL" && recebido <= 0;
  const sinalMaiorQueTotal = situacao === "SINAL" && total > 0 && recebido > total;
  // "Pago integralmente" com total zerado gravaria uma venda marcada como
  // paga sem pagamento nenhum: o valor recebido seria zero, e o servidor não
  // cria lançamento de R$ 0,00. A venda nasceria dizendo uma coisa e
  // registrando outra.
  const integralSemTotal = situacao === "INTEGRAL" && total <= 0;
  const pagamentoIncompleto =
    faltaEscolher || sinalSemValor || sinalMaiorQueTotal || integralSemTotal;

  const dataNoPassado = dados.data !== "" && dados.data < hojeISO();

  const salvar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/reservations/manual", {
        method: "POST",
        body: JSON.stringify({
          ...corpoDaReserva(dados),
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
        }),
      }),
    // Com o sinal já recebido, a cliente está esperando o comprovante do
    // outro lado — cair direto nele poupa a operação de procurar a reserva
    // que ela acabou de digitar. Sem sinal não há o que comprovar, e o
    // caminho segue para a lista de festas do dia.
    onSuccess: (reserva) => {
      const sinalRecebido = recebido > 0;
      toast.success(
        sinalRecebido
          ? "Reserva registrada. Aqui está o comprovante para enviar à cliente."
          : "Reserva registrada. A data já está bloqueada na loja.",
      );
      navegar(sinalRecebido ? `/reservas/${reserva.id}/comprovante` : "/operacao");
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
        <PainelDeConflitos
          conflitos={conflitos}
          titulo="Não dá para registrar: falta material nesta data"
        />
      )}

      <div className="space-y-6">
        <BlocosDaReserva valor={dados} mudar={mudar} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pagamento *</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <p>
                Total: <strong>{brl(total)}</strong> · Recebido: {brl(recebido)} · Saldo:{" "}
                <strong>{brl(saldo)}</strong>
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
                { chave: "NADA", titulo: "A receber", nota: "nada recebido ainda" },
              ].map(({ chave, titulo, nota }) => {
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
          onClick={() => navegar("/reservas")}
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
