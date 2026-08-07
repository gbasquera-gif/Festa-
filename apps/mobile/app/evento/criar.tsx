import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DELIVERY_CITY, EVENT_TYPES } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Card } from "@/components/Card";
import { ImageCover } from "@/components/ImageCover";
import { StepProgress } from "@/components/StepProgress";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { useOrcamento } from "@/lib/orcamento";
import { EVENT_TYPE_LABEL, type EventRecord, type Theme } from "@/lib/types";

export default function CriarEvento() {
  const queryClient = useQueryClient();
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });
  const { kitId: draftKitId, items: draftItems, clear: clearOrcamento } = useOrcamento();
  const hasDraft = Boolean(draftKitId) || draftItems.length > 0;

  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>("FESTA_INFANTIL");
  const [date, setDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [inDeliveryCity, setInDeliveryCity] = useState(true);
  const [otherCity, setOtherCity] = useState("");
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("INICIO_CRIACAO_FESTA");
  }, []);

  // A cidade é perguntada aqui, e não junto da entrega, porque é dado da
  // festa — e é ela que define se a entrega chega a ser oferecida depois.
  const city = inDeliveryCity ? DELIVERY_CITY : otherCity.trim();

  const mutation = useMutation({
    mutationFn: async () => {
      const event = await api<EventRecord>("/events", {
        method: "POST",
        body: JSON.stringify({
          type,
          date,
          guestCount: Number(guestCount),
          themeId,
          city,
        }),
      });

      // O orçamento montado no catálogo vive só no aparelho até aqui: agora
      // que existe um evento, ele vira o pedido de verdade no backend.
      if (draftKitId) {
        await api(`/events/${event.id}/order/kit`, {
          method: "POST",
          body: JSON.stringify({ kitId: draftKitId }),
        });
      }

      for (const item of draftItems) {
        await api(`/events/${event.id}/order/items`, {
          method: "POST",
          body: JSON.stringify({ productId: item.productId, quantity: item.quantity }),
        });
      }

      return event;
    },
    onSuccess: (event) => {
      clearOrcamento();
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      // Com kit já escolhido no catálogo, o passo de escolher kit não faz
      // mais sentido — vai direto para a entrega.
      router.push(draftKitId ? `/evento/${event.id}/logistica` : `/evento/${event.id}/kit`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível criar o evento."),
  });

  // Quem já escolheu o tema junto do kit no catálogo não precisa escolher de
  // novo: perguntar duas vezes a mesma coisa é o que faz o fluxo parecer longo.
  const relevantThemes = hasDraft ? [] : (themes?.filter((t) => t.active) ?? []);
  const missingCity = !inDeliveryCity && !otherCity.trim();

  return (
    <Screen>
      <StepProgress step={1} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Conte sobre sua festa</Text>
        <Text className="text-navy/70">
          {hasDraft
            ? "Falta só a data para fecharmos seu orçamento."
            : "Essas informações ajudam a gente a recomendar o kit ideal."}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-bold text-navy">Tipo de evento</Text>
        <View className="flex-row flex-wrap gap-2">
          {EVENT_TYPES.map((t) => (
            <Chip key={t} label={EVENT_TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-bold text-navy">Data da festa</Text>
        <AvailabilityCalendar value={date} onChange={setDate} />
      </View>

      <TextField
        label="Quantidade de convidados"
        placeholder="Ex: 30"
        value={guestCount}
        onChangeText={setGuestCount}
        keyboardType="number-pad"
      />

      <View className="gap-2">
        <Text className="text-sm font-bold text-navy">Onde vai ser a festa?</Text>
        <View className="flex-row gap-2">
          <Chip
            label={DELIVERY_CITY}
            selected={inDeliveryCity}
            onPress={() => setInDeliveryCity(true)}
          />
          <Chip
            label="Outra cidade"
            selected={!inDeliveryCity}
            onPress={() => setInDeliveryCity(false)}
          />
        </View>
        {!inDeliveryCity && (
          <>
            <TextField
              label="Cidade"
              placeholder="Ex: Xanxerê"
              value={otherCity}
              onChangeText={setOtherCity}
            />
            <Text className="text-xs leading-4 text-navy/60">
              Fora de {DELIVERY_CITY} a retirada é feita na Festaê — você combina o horário com a
              gente e leva tudo pronto.
            </Text>
          </>
        )}
      </View>

      {relevantThemes.length > 0 && (
        <View className="gap-2">
          <Text className="text-sm font-bold text-navy">Tema</Text>
          <View className="gap-3">
            {relevantThemes.map((theme) => (
              <Card
                key={theme.id}
                selected={themeId === theme.id}
                onPress={() => {
                  setThemeId(theme.id);
                  track("ESCOLHA_TEMA", { themeId: theme.id });
                }}
                className="overflow-hidden p-0"
              >
                <ImageCover uri={theme.coverImageUrl} className="h-28" />
                <View className="flex-row items-center gap-3 p-3">
                  <View className="flex-row">
                    {theme.colorPalette.slice(0, 3).map((color, i) => (
                      <View
                        key={i}
                        style={{ backgroundColor: color, marginLeft: i > 0 ? -8 : 0 }}
                        className="h-7 w-7 rounded-full border-2 border-white"
                      />
                    ))}
                  </View>
                  <View className="flex-1">
                    <Text className="font-bold text-navy">{theme.name}</Text>
                    {theme.description && (
                      <Text className="text-sm text-navy/60" numberOfLines={1}>
                        {theme.description}
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </View>
      )}

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <Button
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!date || !guestCount || missingCity}
      >
        {hasDraft ? "Continuar" : "Ver kits recomendados"}
      </Button>
    </Screen>
  );
}
