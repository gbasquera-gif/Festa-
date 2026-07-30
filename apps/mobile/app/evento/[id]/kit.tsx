import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { api, ApiError } from "@/lib/api";
import type { EventRecord, Kit } from "@/lib/types";

export default function EscolherKit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  const { data: kits, isLoading } = useQuery({
    queryKey: ["kits-recommend", event?.guestCount, event?.themeId],
    queryFn: () =>
      api<Kit[]>(
        `/kits/recommend?guestCount=${event?.guestCount ?? ""}&themeId=${event?.themeId ?? ""}`,
      ),
    enabled: !!event,
  });

  const mutation = useMutation({
    mutationFn: (kitId: string) =>
      api(`/events/${id}/order/kit`, { method: "POST", body: JSON.stringify({ kitId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      router.push(`/evento/${id}/extras`);
    },
  });

  return (
    <Screen>
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Kit ideal para sua festa</Text>
        <Text className="text-navy/70">
          Recomendado para {event?.guestCount ?? "—"} convidados{event?.theme ? ` · ${event.theme.name}` : ""}.
        </Text>
      </View>

      {isLoading && <Text className="text-navy/60">Buscando kits...</Text>}

      {kits?.length === 0 && (
        <Card>
          <Text className="text-navy/70">
            Não encontramos um kit que combine perfeitamente. Fale com a gente pelo WhatsApp que a
            Maria Luiza monta um sob medida para você.
          </Text>
        </Card>
      )}

      {kits?.map((kit) => (
        <Card key={kit.id}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-navy">{kit.name}</Text>
              {kit.description && <Text className="text-navy/70">{kit.description}</Text>}
            </View>
            <Badge label={`R$ ${Number(kit.basePrice).toFixed(2)}`} variant="coral" />
          </View>

          <View className="mt-3 gap-1">
            {kit.products.map((link) => (
              <Text key={link.productId} className="text-sm text-navy/70">
                • {link.quantity}x {link.product.name}
              </Text>
            ))}
          </View>

          <Button
            className="mt-4"
            onPress={() => mutation.mutate(kit.id)}
            loading={mutation.isPending}
          >
            Escolher este kit
          </Button>
        </Card>
      ))}
    </Screen>
  );
}
