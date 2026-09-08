import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { MANUAL_SALE_CHANNELS, saleChannelLabel, totalDaVendaManual } from "@festae/shared";
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

  const [sinal, setSinal] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("PIX");
  const [statusPagamento, setStatusPagamento] = useState("PENDING");
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
  const saldo = Math.max(0, total - (Number(sinal) || 0));
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
        <PainelDeConflitos
          conflitos={conflitos}
          titulo="Não dá para registrar: falta material nesta data"
        />
      )}

      <div className="space-y-6">
        <BlocosDaReserva valor={dados} mudar={mudar} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sinal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
