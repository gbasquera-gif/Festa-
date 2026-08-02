import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { TextField } from "@/components/TextField";
import { StepProgress } from "@/components/StepProgress";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, type EventRecord } from "@/lib/types";

function splitAmount(total: number): { deposit: number; balance: number } {
  const deposit = Math.round(total * 50) / 100;
  const balance = Math.round((total - deposit) * 100) / 100;
  return { deposit, balance };
}

export default function Resumo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/events/${id}/reservation`, { method: "POST", body: JSON.stringify({ notes: notes || undefined }) }),
    onSuccess: () => {
      track("RESERVA_CRIADA", { eventId: id });
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      router.replace(`/evento/${id}/confirmacao`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível solicitar a reserva."),
  });

  const paymentMutation = useMutation({
    mutationFn: (type: "DEPOSIT" | "BALANCE") =>
      api(`/events/${id}/order/payments`, {
        method: "POST",
        body: JSON.stringify({ type, method: "PIX" }),
      }),
    onSuccess: () => setPaymentNotice(null),
    onError: (err) =>
      setPaymentNotice(err instanceof ApiError ? err.message : "Não foi possível iniciar o pagamento."),
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
  const { deposit, balance } = splitAmount(Number(order.total));
  const address = [event.address, event.neighborhood].filter(Boolean).join(", ");

  return (
    <Screen>
      <StepProgress step={4} />

      <View className="items-center">
        <Text className="text-center font-sans-extrabold text-2xl text-navy">Essa será sua</Text>
        <Text className="text-center font-sans-extrabold text-3xl text-coral">Festaê!</Text>
      </View>

      <Card>
        <Text className="font-bold text-navy">{EVENT_TYPE_LABEL[event.type]}</Text>
        <Text className="text-navy/70">{new Date(event.date).toLocaleDateString("pt-BR")}</Text>
        <Text className="text-navy/70">{event.guestCount} convidados</Text>
        <Text className="text-navy/70">{event.theme?.name ?? "Sem tema definido"}</Text>
        <Text className="mt-2 text-navy/70">
          🚚 Entrega: {address || `${event.city}/${event.state} — endereço a combinar`}
        </Text>
      </Card>

      <Card>
        <Text className="mb-2 font-bold text-navy">Kit escolhido</Text>
        <View className="flex-row justify-between">
          <Text className="text-navy/70">{order.kit?.name ?? "Nenhum kit selecionado"}</Text>
          <Text className="text-navy/70">R$ {Number(order.subtotalKit).toFixed(2)}</Text>
        </View>

        {order.items.length > 0 && (
          <>
            <Text className="mb-2 mt-4 font-bold text-navy">Extras</Text>
            {order.items.map((item) => (
              <View key={item.id} className="flex-row justify-between">
                <Text className="text-navy/70">
                  {item.quantity}x {item.product.name}
                </Text>
                <Text className="text-navy/70">
                  R$ {(Number(item.unitPriceSnapshot) * item.quantity).toFixed(2)}
                </Text>
              </View>
            ))}
          </>
        )}

        <View className="mt-4 flex-row justify-between border-t border-sand pt-3">
          <Text className="text-lg font-extrabold text-navy">Total</Text>
          <Text className="text-lg font-extrabold text-coral">R$ {Number(order.total).toFixed(2)}</Text>
        </View>
      </Card>

      <Card>
        <Text className="mb-2 font-bold text-navy">Pagamento em 2x — sem parcelamento</Text>
        <View className="flex-row justify-between">
          <Text className="text-navy/70">Sinal (50%) — na reserva</Text>
          <Text className="font-bold text-navy">R$ {deposit.toFixed(2)}</Text>
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-navy/70">Saldo (50%) — na retirada/entrega</Text>
          <Text className="font-bold text-navy">R$ {balance.toFixed(2)}</Text>
        </View>
        {alreadyRequested && (
          <View className="mt-3 gap-2">
            <Button
              variant="outline"
              onPress={() => paymentMutation.mutate("DEPOSIT")}
              loading={paymentMutation.isPending}
            >
              Pagar sinal via Pix
            </Button>
            {paymentNotice && <Text className="text-sm text-navy/60">{paymentNotice}</Text>}
          </View>
        )}
      </Card>

      {alreadyRequested ? (
        <Card className="items-center">
          <Badge label={ORDER_STATUS_LABEL[order.status]} variant={order.status === "CONFIRMED" ? "success" : "coral"} />
          <Text className="mt-2 text-center text-navy/70">
            {order.status === "CONFIRMED"
              ? "Sua data está confirmada! A Festaê já está se preparando."
              : "Recebemos sua solicitação. A equipe da Festaê vai confirmar a disponibilidade da data."}
          </Text>
        </Card>
      ) : (
        <>
          <TextField
            label="Alguma observação para a equipe? (opcional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: prefiro entrega pela manhã"
            multiline
          />
          {error && <Text className="text-sm text-red-500">{error}</Text>}
          <Button onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={!order.kitId}>
            Solicitar reserva da data
          </Button>
        </>
      )}
    </Screen>
  );
}
