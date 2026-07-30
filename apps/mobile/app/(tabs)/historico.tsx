import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { api } from "@/lib/api";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, type EventRecord } from "@/lib/types";

const STATUS_VARIANT: Record<string, "neutral" | "coral" | "success" | "danger"> = {
  CART: "neutral",
  REQUESTED: "coral",
  CONFIRMED: "success",
  CANCELLED: "danger",
};

export default function Historico() {
  const { data: events, isLoading } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api<EventRecord[]>("/events"),
  });

  return (
    <Screen>
      <Text className="font-sans-extrabold text-2xl text-navy">Histórico</Text>
      <Text className="-mt-3 text-navy/70">Todas as festas que você já começou a montar.</Text>

      {isLoading && <Text className="text-navy/60">Carregando...</Text>}

      {events?.length === 0 && (
        <Card>
          <Text className="text-navy/70">Você ainda não criou nenhuma festa.</Text>
        </Card>
      )}

      {events?.map((event) => (
        <Card key={event.id} onPress={() => router.push(`/evento/${event.id}/resumo`)}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-navy">{EVENT_TYPE_LABEL[event.type]}</Text>
            <Badge label={ORDER_STATUS_LABEL[event.order.status]} variant={STATUS_VARIANT[event.order.status]} />
          </View>
          <Text className="mt-1 text-navy/70">
            {new Date(event.date).toLocaleDateString("pt-BR")} · {event.guestCount} convidados
          </Text>
          <Text className="text-navy/70">{event.theme?.name ?? "Tema não escolhido"}</Text>
          <Text className="mt-2 font-bold text-coral">R$ {Number(event.order.total).toFixed(2)}</Text>
        </Card>
      ))}
    </Screen>
  );
}
