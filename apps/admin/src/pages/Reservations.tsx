import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RESERVATION_STATUSES, splitPayment, type ReservationStatus } from "@festae/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";

interface ProductRef {
  id: string;
  name: string;
}

interface ReservationRow {
  id: string;
  eventDate: string;
  status: ReservationStatus;
  notes: string | null;
  order: {
    id: string;
    total: string;
    subtotalKit: string;
    subtotalExtras: string;
    deliveryFee: string;
    assemblyFee: string;
    fulfillment: "PICKUP" | "DELIVERY";
    assembly: boolean;
    kit: { name: string; products: { quantity: number; product: ProductRef }[] } | null;
    items: { id: string; quantity: number; product: ProductRef }[];
    payments: {
      id: string;
      type: "DEPOSIT" | "BALANCE";
      status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
      amount: string;
      paidAt: string | null;
    }[];
    event: {
      guestCount: number;
      address: string | null;
      neighborhood: string | null;
      city: string;
      state: string;
      user: { name: string; email: string; phone: string | null };
      theme: { name: string } | null;
    };
  };
}

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Solicitação",
  CONFIRMED: "Confirmada",
  PREPARING: "Preparação",
  READY: "Pronta para retirada/entrega",
  COMPLETED: "Concluída",
  REJECTED: "Rejeitada",
  CANCELLED: "Cancelada",
};


const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (value: string | number) => BRL.format(Number(value));

/** Só dígitos: o WhatsApp recusa o link se vier com parênteses e traço. */
function whatsappLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

/**
 * Situação do pagamento, derivada dos registros de Payment.
 *
 * Não é um campo guardado: pagamento e etapa operacional são coisas
 * diferentes, e juntar as duas num status só criaria estados impossíveis
 * ("Preparação" apagaria a informação de que o sinal caiu). Aqui elas
 * aparecem lado a lado, que é como a Maria Luiza precisa ler.
 */
function paymentSummary(row: ReservationRow) {
  const total = Number(row.order.total);
  const { deposit, balance } = splitPayment(total);
  const depositPaid = row.order.payments.some((p) => p.type === "DEPOSIT" && p.status === "PAID");
  const balancePaid = row.order.payments.some((p) => p.type === "BALANCE" && p.status === "PAID");

  const received = (depositPaid ? deposit : 0) + (balancePaid ? balance : 0);

  return {
    total,
    deposit,
    balance,
    depositPaid,
    balancePaid,
    received,
    pending: total - received,
    label: balancePaid
      ? "Pago integralmente"
      : depositPaid
        ? "Sinal recebido"
        : "Aguardando pagamento",
    tone: balancePaid || depositPaid ? "text-emerald-700" : "text-amber-700",
  };
}

/**
 * Lista de separação, agrupada por origem.
 *
 * Agrupar em vez de etiquetar cada linha é como se separa material de
 * verdade: pega-se o kit inteiro de um lugar e os adicionais de outro.
 * De quebra, o nome do produto fica com a linha toda para ele.
 */
function packingList(row: ReservationRow) {
  const grupos: { titulo: string; itens: { key: string; quantity: number; name: string }[] }[] = [];

  if (row.order.kit && row.order.kit.products.length > 0) {
    grupos.push({
      titulo: row.order.kit.name,
      itens: row.order.kit.products.map((link) => ({
        key: `kit-${link.product.id}`,
        quantity: link.quantity,
        name: link.product.name,
      })),
    });
  }

  if (row.order.items.length > 0) {
    grupos.push({
      titulo: "Adicionais",
      itens: row.order.items.map((item) => ({
        key: `extra-${item.id}`,
        quantity: item.quantity,
        name: item.product.name,
      })),
    });
  }

  return grupos;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}

function Detail({ row }: { row: ReservationRow }) {
  const { event } = row.order;
  const payment = paymentSummary(row);
  const items = packingList(row);
  const isDelivery = row.order.fulfillment === "DELIVERY";
  const eventDate = new Date(row.eventDate).toLocaleDateString("pt-BR");

  const message =
    `Oi ${event.user.name.split(" ")[0]}! Aqui é da Festaê. ` +
    `Sobre sua festa do dia ${eventDate}: ` +
    (isDelivery
      ? `a entrega será em ${event.address ?? "endereço a confirmar"}.`
      : "a retirada é na Festaê, vamos combinar o horário?");

  return (
    <div className="grid gap-6 bg-muted/30 p-5 md:grid-cols-2 xl:grid-cols-4">
      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Cliente</h3>
        <dl className="space-y-2 text-sm">
          <Field label="Nome" value={event.user.name} />
          <Field label="Telefone" value={event.user.phone ?? "não informado"} />
          <Field label="E-mail" value={event.user.email} />
        </dl>
        {event.user.phone && (
          <Button asChild size="sm" variant="outline">
            <a href={whatsappLink(event.user.phone, message)} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          </Button>
        )}
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Evento e logística</h3>
        <dl className="space-y-2 text-sm">
          <Field label="Data" value={eventDate} />
          <Field label="Convidados" value={event.guestCount} />
          <Field label="Tema" value={event.theme?.name ?? "—"} />
          <Field
            label="Entrega"
            value={
              isDelivery ? (
                <span className="text-emerald-700">Entrega — {money(row.order.deliveryFee)}</span>
              ) : (
                "Retirada na Festaê"
              )
            }
          />
          {isDelivery && (
            <Field
              label="Endereço"
              value={
                [event.address, event.neighborhood].filter(Boolean).join(", ") ||
                "não informado"
              }
            />
          )}
          <Field label="Cidade" value={`${event.city}/${event.state}`} />
          <Field
            label="Montagem"
            value={
              row.order.assembly ? (
                <span className="font-bold text-emerald-700">
                  SIM — {money(row.order.assemblyFee)}
                </span>
              ) : (
                "Não"
              )
            }
          />
        </dl>
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Separar para esta festa</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item no pedido.</p>
        ) : (
          <div className="space-y-3">
            {items.map((grupo) => (
              <div key={grupo.titulo}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {grupo.titulo}
                </p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {grupo.itens.map((item) => (
                    <li key={item.key}>
                      <span className="font-bold text-navy">{item.quantity}x</span> {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {row.notes && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">
            <span className="font-bold">Observação: </span>
            {row.notes}
          </p>
        )}
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Financeiro</h3>
        <dl className="space-y-1.5 text-sm">
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="min-w-0 text-muted-foreground">Produtos</dt>
            <dd>{money(Number(row.order.subtotalKit) + Number(row.order.subtotalExtras))}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="min-w-0 text-muted-foreground">Taxa de entrega</dt>
            <dd>{money(row.order.deliveryFee)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="min-w-0 text-muted-foreground">Taxa de montagem</dt>
            <dd>{money(row.order.assemblyFee)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2 border-t pt-1.5 font-bold text-navy">
            <dt>Total</dt>
            <dd>{money(payment.total)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="text-muted-foreground">Sinal 50%</dt>
            <dd className={payment.depositPaid ? "text-emerald-700" : "text-amber-700"}>
              {money(payment.deposit)}
            </dd>
            <p className={`w-full text-xs ${payment.depositPaid ? "text-emerald-700" : "text-amber-700"}`}>
              {payment.depositPaid ? "recebido" : "aguardando o Pix"}
            </p>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="text-muted-foreground">Restante 50%</dt>
            <dd className={payment.balancePaid ? "text-emerald-700" : ""}>
              {money(payment.balance)}
            </dd>
            <p className="w-full text-xs text-muted-foreground">
              {payment.balancePaid ? "recebido" : "na retirada ou entrega"}
            </p>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2 border-t pt-1.5">
            <dt className="font-bold text-navy">Já recebido</dt>
            <dd className="font-bold text-navy">{money(payment.received)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-2">
            <dt className="font-bold text-navy">Falta receber</dt>
            <dd className="font-bold text-navy">{money(payment.pending)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export default function Reservations() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["reservations"],
    queryFn: () => api<ReservationRow[]>("/reservations"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReservationStatus }) =>
      api(`/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Status da reserva atualizado.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao atualizar reserva."),
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-navy">Reservas</h1>
      <p className="mb-6 text-muted-foreground">
        Clique numa reserva para ver o cliente, o que separar e o financeiro.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Data do evento</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Entrega</TableHead>
            <TableHead>Montagem</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Pagamento</TableHead>
            <TableHead>Etapa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8}>Carregando...</TableCell>
            </TableRow>
          )}
          {data?.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground">
                Nenhuma reserva ainda.
              </TableCell>
            </TableRow>
          )}

          {data?.map((row) => {
            const payment = paymentSummary(row);
            const isOpen = expanded === row.id;

            return (
              <Fragment key={row.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                >
                  <TableCell className="text-muted-foreground">{isOpen ? "▾" : "▸"}</TableCell>
                  <TableCell className="font-medium">
                    {new Date(row.eventDate).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.order.event.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.order.event.user.phone ?? row.order.event.user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.order.fulfillment === "DELIVERY" ? (
                      <Badge>Entrega</Badge>
                    ) : (
                      <Badge variant="secondary">Retirada</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.order.assembly ? (
                      <Badge>Com montagem</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{money(row.order.total)}</TableCell>
                  <TableCell className={`text-sm font-medium ${payment.tone}`}>
                    {payment.label}
                  </TableCell>
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <Select
                      value={row.status}
                      onValueChange={(status) =>
                        statusMutation.mutate({ id: row.id, status: status as ReservationStatus })
                      }
                    >
                      <SelectTrigger className="w-[210px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESERVATION_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>

                {isOpen && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <Detail row={row} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>

      <p className="mt-4 text-xs text-muted-foreground">
        A etapa muda o andamento da festa; o pagamento é atualizado sozinho quando o Pix é
        confirmado pelo Mercado Pago.
      </p>
    </div>
  );
}
