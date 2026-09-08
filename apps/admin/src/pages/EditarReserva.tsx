import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SALE_CHANNELS,
  descontoEmbutido,
  saleChannelLabel,
  totalDaVendaManual,
} from "@festae/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BlocosDaReserva,
  PainelDeConflitos,
  brl,
  corpoDaReserva,
  hojeISO,
  reservaEmBranco,
  type ConflitoDetalhado,
  type DadosDaReserva,
} from "@/components/FormularioDeReserva";
import { ApiError, api } from "@/lib/api";

interface ReservaCompleta {
  id: string;
  status: string;
  eventDate: string;
  order: {
    id: string;
    fulfillment: "PICKUP" | "DELIVERY";
    assembly: boolean;
    subtotalKit: string | number;
    deliveryFee: string | number;
    assemblyFee: string | number;
    total: string | number;
    notes: string | null;
    kitId: string | null;
    items: { productId: string; quantity: number; product: { name: string } }[];
    payments: { id: string; amount: string | number; status: string; method: string }[];
    event: {
      type: string;
      date: string;
      guestCount: number | null;
      themeId: string | null;
      address: string | null;
      neighborhood: string | null;
      city: string;
      saleChannel: string;
      user: { name: string; phone: string | null; email: string | null };
    };
  };
}

/** O que o servidor gravou, traduzido para os campos do formulário. */
function paraFormulario(r: ReservaCompleta): DadosDaReserva {
  // O desconto não tem coluna própria: é a diferença entre as parcelas e o
  // total gravado. Reconstituí-lo é o que faz a edição reabrir com o preço
  // que foi vendido, em vez de "corrigi-lo" para cima na primeira gravação.
  const desconto = descontoEmbutido({
    valorProdutos: Number(r.order.subtotalKit),
    entrega: Number(r.order.deliveryFee),
    montagem: Number(r.order.assemblyFee),
    total: Number(r.order.total),
  });

  return {
    ...reservaEmBranco,
    nome: r.order.event.user.name,
    telefone: r.order.event.user.phone ?? "",
    email: r.order.event.user.email ?? "",
    data: r.eventDate.slice(0, 10),
    tipo: r.order.event.type,
    themeId: r.order.event.themeId ?? "",
    convidados: r.order.event.guestCount ? String(r.order.event.guestCount) : "",
    observacoes: r.order.notes ?? "",
    kitId: r.order.kitId ?? "",
    extras: Object.fromEntries(r.order.items.map((i) => [i.productId, i.quantity])),
    fulfillment: r.order.fulfillment,
    assembly: r.order.assembly,
    endereco: r.order.event.address ?? "",
    bairro: r.order.event.neighborhood ?? "",
    cidade: r.order.event.city || "Chapecó",
    valorProdutos: String(Number(r.order.subtotalKit)),
    entrega: String(Number(r.order.deliveryFee)),
    montagem: String(Number(r.order.assemblyFee)),
    desconto: String(desconto),
  };
}

/**
 * Edição de uma reserva já existente.
 *
 * O caso que a criou é banal e caro: a cliente muda de ideia sobre a data, o
 * kit ou o valor depois de fechado. Sem esta tela, a operação só tinha o
 * caminho de cancelar e lançar de novo — o que jogava fora o sinal já
 * recebido, o checklist do dia e o histórico, e deixava duas reservas onde
 * houve uma festa só.
 *
 * O sinal recebido não aparece como campo, e sim como saldo: dinheiro que
 * entrou tem referência no Mercado Pago e não se reescreve num formulário.
 * O que muda aqui são os valores do pedido; o saldo se recalcula a partir do
 * que já foi pago.
 */
export default function EditarReserva() {
  const [, params] = useRoute("/reservas/:id/editar");
  const [, navegar] = useLocation();
  const queryClient = useQueryClient();
  const id = params?.id ?? "";

  const { data: reserva, isLoading, error } = useQuery({
    queryKey: ["reserva", id],
    queryFn: () => api<ReservaCompleta>(`/reservations/${id}`),
    enabled: Boolean(id),
  });

  const [dados, setDados] = useState<DadosDaReserva>(reservaEmBranco);
  const [origem, setOrigem] = useState("");
  const [carregado, setCarregado] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoDetalhado[] | null>(null);

  const mudar = (parcial: Partial<DadosDaReserva>) =>
    setDados((atual) => ({ ...atual, ...parcial }));

  // Preenche uma vez só. Um refetch em segundo plano não pode sobrescrever o
  // que a pessoa já está digitando.
  useEffect(() => {
    if (reserva && !carregado) {
      setDados(paraFormulario(reserva));
      setOrigem(reserva.order.event.saleChannel);
      setCarregado(true);
    }
  }, [reserva, carregado]);

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

  const pago =
    reserva?.order.payments
      .filter((p) => p.status === "PAID")
      .reduce((soma, p) => soma + Number(p.amount), 0) ?? 0;
  const saldo = Math.max(0, total - pago);

  const dataOriginal = reserva?.eventDate.slice(0, 10) ?? "";
  const mudouDeDia = carregado && dados.data !== dataOriginal;
  const dataNoPassado = dados.data !== "" && dados.data < hojeISO();

  const salvar = useMutation({
    mutationFn: () =>
      api(`/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...corpoDaReserva(dados),
          financeiro: {
            valorProdutos: Number(dados.valorProdutos) || 0,
            entrega: Number(dados.entrega) || 0,
            montagem: Number(dados.montagem) || 0,
            desconto: Number(dados.desconto) || 0,
          },
          origem: origem || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reserva", id] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["proximas-acoes"] });
      queryClient.invalidateQueries({ queryKey: ["funil"] });
      toast.success(
        mudouDeDia
          ? "Reserva atualizada. A data nova já está bloqueada na loja."
          : "Reserva atualizada.",
      );
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

    if (dataNoPassado && !confirm("Essa data já passou. Salvar mesmo assim?")) return;
    if (
      mudouDeDia &&
      !confirm(
        `A festa vai sair de ${dataOriginal.split("-").reverse().join("/")} para ` +
          `${dados.data.split("-").reverse().join("/")}. Avise a cliente. Confirmar?`,
      )
    ) {
      return;
    }
    salvar.mutate();
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Carregando reserva...</p>;
  }
  if (error || !reserva) {
    return <p className="text-destructive">Não foi possível carregar esta reserva.</p>;
  }
  if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-navy">Reserva cancelada</h1>
        <p className="text-muted-foreground">
          Esta reserva está cancelada e não pode ser editada — ela não segura mais data nem
          material. Registre uma nova reserva para a festa que voltou.
        </p>
        <Button onClick={() => navegar("/operacao")}>Voltar para a operação</Button>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-bold text-navy">Editar reserva</h1>
      <p className="mb-6 text-muted-foreground">
        Festa de {reserva.order.event.user.name}, marcada para{" "}
        {dataOriginal.split("-").reverse().join("/")}. Mudar data, kit ou itens reconfere agenda e
        estoque, como numa reserva nova.
      </p>

      {conflitos && (
        <PainelDeConflitos
          conflitos={conflitos}
          titulo="Não dá para salvar: falta material nesta data"
        />
      )}

      <div className="space-y-6">
        <BlocosDaReserva valor={dados} mudar={mudar} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md bg-muted/50 p-3">
              <p>
                Total: <strong>{brl(total)}</strong> · Já recebido: {brl(pago)} · Saldo:{" "}
                <strong>{brl(saldo)}</strong>
              </p>
            </div>
            {reserva.order.payments.length > 0 ? (
              <ul className="space-y-1 text-muted-foreground">
                {reserva.order.payments.map((p) => (
                  <li key={p.id}>
                    {brl(Number(p.amount))} · {p.method} ·{" "}
                    {p.status === "PAID" ? "recebido" : "a receber"}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Nenhum pagamento registrado.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Pagamentos não se editam por aqui: sinal recebido é dinheiro que entrou, com
              referência no Mercado Pago. Mude os valores acima e o saldo se ajusta sozinho.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Origem da venda</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {SALE_CHANNELS.map((canal) => (
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
          </CardContent>
        </Card>
      </div>

      {mudouDeDia && (
        <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          A data vai mudar de {dataOriginal.split("-").reverse().join("/")} para{" "}
          {dados.data.split("-").reverse().join("/")}. A data antiga volta a ficar livre na loja.
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          className="h-11 w-full sm:h-9 sm:w-auto"
          onClick={() => navegar("/operacao")}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending} className="h-11 w-full sm:h-9 sm:w-auto">
          {salvar.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
