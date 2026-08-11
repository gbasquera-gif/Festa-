import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { StepProgress } from "@/components/StepProgress";
import { ImageCarousel } from "@/components/ImageCarousel";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
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
    onSuccess: (_data, kitId) => {
      track("ESCOLHA_KIT", { kitId, eventId: id });
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      router.push(`/evento/${id}/extras`);
    },
  });

  return (
    <Screen>
      <StepProgress step={2} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Kit ideal para sua festa</Text>
        {/* Sem número de convidados não há recomendação por tamanho — a
            lista sai completa, e a frase precisa dizer isso em vez de
            prometer um recorte que não aconteceu. */}
        <Text className="text-navy/70">
          {event?.guestCount
            ? `Recomendado para ${event.guestCount} convidados`
            : "Todos os kits disponíveis"}
          {event?.theme ? ` · ${event.theme.name}` : ""}.
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

      {kits?.map((kit, index) => (
        <Card key={kit.id} className="overflow-hidden p-0">
          <ImageCarousel images={kit.images.length > 0 ? kit.images : kit.coverImageUrl ? [kit.coverImageUrl] : []} />

          <View className="p-4">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-navy">{kit.name}</Text>
                {kit.description && <Text className="text-navy/70">{kit.description}</Text>}
              </View>
              <Badge label={`R$ ${Number(kit.basePrice).toFixed(2)}`} variant="coral" />
            </View>

            {index === 0 && <Badge label="✨ Mais escolhido" variant="success" />}

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
          </View>
        </Card>
      ))}
    </Screen>
  );
}
