import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { DELIVERY_CITY, splitPayment } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TextField } from "@/components/TextField";
import { StepProgress } from "@/components/StepProgress";
import { HelpLink } from "@/components/WhatsAppButton";
import { DiscardEventButton } from "@/components/DiscardEventButton";
import { api, ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, type EventRecord } from "@/lib/types";
import { colors } from "@/theme";

/** Linha de valor. `strong` destaca o total; `muted` suaviza os itens grátis. */
function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text className={strong ? "font-sans-extrabold text-lg text-navy" : "text-navy/70"}>
        {label}
      </Text>
      <Text
        className={
          strong
            ? "font-sans-extrabold text-lg text-coral"
            : muted
              ? "text-navy/50"
              : "font-sans-bold text-navy"
        }
      >
        {value}
      </Text>
    </View>
  );
}

export default function Resumo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/events/${id}/reservation`, {
        method: "POST",
        body: JSON.stringify({ notes: notes || undefined }),
      }),
    onSuccess: () => {
      track("RESERVA_CRIADA", { eventId: id });
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      // Direto para o pagamento: a reserva só vira data garantida com o
      // sinal pago, e adiar esse passo é onde se perde a venda.
      router.replace(`/evento/${id}/pagamento`);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível solicitar a reserva."),
  });

  if (isLoading || !event) {
    return (
      <Screen>
        <Text className="text-navy/60">Carregando...</Text>
      </Screen>
    );
  }

  const order = event.order;
  const alreadyRequested = order.status !== "CART";
  const total = Number(order.total);
  const { deposit, balance } = splitPayment(total);
  const deliveryFee = Number(order.deliveryFee);
  const assemblyFee = Number(order.assemblyFee);
  const subtotalProducts = Number(order.subtotalKit) + Number(order.subtotalExtras);
  const isDelivery = order.fulfillment === "DELIVERY";
  const address = [event.address, event.neighborhood].filter(Boolean).join(", ");

  return (
    <Screen>
      <StepProgress step={5} />

      <View className="items-center">
        <Text className="text-center font-sans-extrabold text-2xl text-navy">Essa será sua</Text>
        <Text className="text-center font-sans-extrabold text-3xl text-coral">Festaê!</Text>
      </View>

      <Card>
        <Text className="font-bold text-navy">{EVENT_TYPE_LABEL[event.type]}</Text>
        <Text className="text-navy/70">{new Date(event.date).toLocaleDateString("pt-BR")}</Text>
        <Text className="text-navy/70">{event.guestCount} convidados</Text>
        <Text className="text-navy/70">{event.theme?.name ?? "Sem tema definido"}</Text>
        <Text className="text-navy/70">
          {event.city}/{event.state}
        </Text>
      </Card>

      <Card>
        <Text className="mb-2 font-bold text-navy">Sua festa</Text>
        <Line
          label={order.kit?.name ?? "Nenhum kit selecionado"}
          value={formatBRL(order.subtotalKit)}
        />

        {order.items.length > 0 && (
          <>
            <Text className="mb-2 mt-4 font-bold text-navy">Produtos adicionais</Text>
            {order.items.map((item) => (
              <Line
                key={item.id}
                label={`${item.quantity}x ${item.product.name}`}
                value={formatBRL(Number(item.unitPriceSnapshot) * item.quantity)}
              />
            ))}
          </>
        )}

        <View className="mt-3 border-t border-sand pt-3">
          <Line label="Subtotal dos produtos" value={formatBRL(subtotalProducts)} />
        </View>
      </Card>

      {/* A logística fica em cartão próprio e editável: é a escolha que o
          cliente mais volta para revisar antes de confirmar. */}
      <Card>
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="font-bold text-navy">Serviços adicionais</Text>
          {!alreadyRequested && (
            <Pressable onPress={() => router.push(`/evento/${id}/logistica`)} hitSlop={8}>
              <Text className="text-sm font-sans-bold text-coral">Alterar</Text>
            </Pressable>
          )}
        </View>

        <Line
          label={isDelivery ? `Entrega em ${DELIVERY_CITY}` : "Retirada na Festaê"}
          value={deliveryFee > 0 ? formatBRL(deliveryFee) : "Grátis"}
          muted={deliveryFee === 0}
        />
        {isDelivery && address && (
          <Text className="mt-0.5 text-sm text-navy/50">{address}</Text>
        )}

        <View className="mt-1">
          <Line
            label={order.assembly ? "Montagem da festa" : "Sem montagem"}
            value={assemblyFee > 0 ? formatBRL(assemblyFee) : "Grátis"}
            muted={assemblyFee === 0}
          />
        </View>
      </Card>

      <Card>
        <Text className="mb-3 font-bold text-navy">Valores</Text>
        <Line label="Produtos" value={formatBRL(subtotalProducts)} />
        <Line
          label="Taxa de entrega"
          value={deliveryFee > 0 ? formatBRL(deliveryFee) : "R$ 0,00"}
          muted={deliveryFee === 0}
        />
        <Line
          label="Taxa de montagem"
          value={assemblyFee > 0 ? formatBRL(assemblyFee) : "R$ 0,00"}
          muted={assemblyFee === 0}
        />

        <View className="mt-3 border-t border-sand pt-3">
          <Line label="Total" value={formatBRL(total)} strong />
        </View>

        <View className="mt-4 gap-1 rounded-2xl bg-linen p-3.5">
          <Text className="font-sans-bold text-navy">Pagamento em duas partes</Text>
          <Line label="Sinal de 50% — agora, via Pix" value={formatBRL(deposit)} />
          <Line label="Restante de 50% — na retirada/entrega" value={formatBRL(balance)} />
        </View>
      </Card>

      {alreadyRequested ? (
        <>
          <Card className="items-center">
            <Badge
              label={ORDER_STATUS_LABEL[order.status]}
              variant={order.status === "CONFIRMED" ? "success" : "coral"}
            />
            <Text className="mt-2 text-center text-navy/70">
              {order.status === "CONFIRMED"
                ? "Sua data está confirmada! A Festaê já está se preparando."
                : "Recebemos sua solicitação. Pague o sinal para garantir a data."}
            </Text>
          </Card>
          <Button onPress={() => router.push(`/evento/${id}/pagamento`)}>
            Ver pagamento do sinal
          </Button>
        </>
      ) : (
        <>
          <TextField
            label="Alguma observação para a equipe? (opcional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: prefiro retirar pela manhã"
            multiline
          />
          {error && <Text className="text-sm text-red-500">{error}</Text>}
          <Button onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!order.kitId}>
            Solicitar reserva e pagar sinal
          </Button>
          <View className="flex-row items-center justify-center gap-1.5">
            <Ionicons name="lock-closed" size={12} color={colors.muted} />
            <Text className="text-center text-xs text-navy/50">
              Pagamento via Pix pelo Mercado Pago
            </Text>
          </View>
          <HelpLink message="Oi! Tenho uma dúvida sobre o orçamento da minha festa." />
          <DiscardEventButton
            eventId={id}
            label="Descartar e começar do zero"
            onDiscarded={() => router.replace("/(tabs)")}
          />
        </>
      )}
    </Screen>
  );
}
