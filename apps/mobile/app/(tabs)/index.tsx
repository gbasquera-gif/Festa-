import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, type EventRecord } from "@/lib/types";

export default function Home() {
  const { user } = useAuth();
  const { data: events } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api<EventRecord[]>("/events"),
  });

  const ongoing = events?.find((e) => e.order.status === "CART");
  const firstName = user?.name.split(" ")[0];

  return (
    <Screen>
      <View>
        <Text className="text-base text-navy/70">Olá, {firstName} 👋</Text>
        <Text className="font-sans-extrabold text-2xl text-navy">
          Sua festa dos <Text className="text-coral">sonhos</Text>, pronta em minutos.
        </Text>
      </View>

      <Card className="items-center bg-navy py-8">
        <Text className="text-center text-xl font-extrabold text-white">Vamos montar sua festa?</Text>
        <Text className="mt-2 text-center text-white/70">
          Escolha tema, kit e itens extras. Em poucos passos você já solicita a reserva da data.
        </Text>
        <Button className="mt-5 w-full" onPress={() => router.push("/evento/criar")}>
          Quero criar minha festa
        </Button>
      </Card>

      {ongoing && (
        <Card
          onPress={() =>
            router.push(
              ongoing.order.kitId ? `/evento/${ongoing.id}/resumo` : `/evento/${ongoing.id}/kit`,
            )
          }
        >
          <Badge label="Continuar de onde parou" variant="coral" />
          <Text className="mt-2 text-lg font-bold text-navy">{EVENT_TYPE_LABEL[ongoing.type]}</Text>
          <Text className="text-navy/70">
            {ongoing.theme?.name ?? "Tema não escolhido"} · {ongoing.guestCount} convidados
          </Text>
        </Card>
      )}

      {events && events.length > 0 && (
        <View className="gap-3">
          <Text className="font-bold text-navy">Seus eventos recentes</Text>
          {events.slice(0, 3).map((event) => (
            <Card key={event.id} onPress={() => router.push(`/evento/${event.id}/resumo`)}>
              <View className="flex-row items-center justify-between">
                <Text className="font-bold text-navy">{EVENT_TYPE_LABEL[event.type]}</Text>
                <Badge label={ORDER_STATUS_LABEL[event.order.status]} variant="neutral" />
              </View>
              <Text className="text-navy/70">
                {new Date(event.date).toLocaleDateString("pt-BR")} · {event.guestCount} convidados
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
