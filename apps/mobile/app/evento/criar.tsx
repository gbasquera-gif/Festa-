import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EVENT_TYPES } from "@festae/shared";
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
import { EVENT_TYPE_LABEL, type EventRecord, type Theme } from "@/lib/types";

export default function CriarEvento() {
  const queryClient = useQueryClient();
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });

  const [type, setType] = useState<(typeof EVENT_TYPES)[number]>("FESTA_INFANTIL");
  const [date, setDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [budgetGoal, setBudgetGoal] = useState("");
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("INICIO_CRIACAO_FESTA");
  }, []);

  const mutation = useMutation({
    mutationFn: () =>
      api<EventRecord>("/events", {
        method: "POST",
        body: JSON.stringify({
          type,
          date,
          guestCount: Number(guestCount),
          budgetGoal: budgetGoal ? Number(budgetGoal) : undefined,
          themeId,
          address: address || undefined,
          neighborhood: neighborhood || undefined,
        }),
      }),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      router.push(`/evento/${event.id}/kit`);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Não foi possível criar o evento."),
  });

  const relevantThemes = themes?.filter((t) => t.active) ?? [];

  return (
    <Screen>
      <StepProgress step={1} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Conte sobre sua festa</Text>
        <Text className="text-navy/70">Essas informações ajudam a gente a recomendar o kit ideal.</Text>
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

      <TextField
        label="Orçamento desejado (opcional)"
        placeholder="Ex: 900"
        value={budgetGoal}
        onChangeText={setBudgetGoal}
        keyboardType="decimal-pad"
      />

      <TextField
        label="Endereço de entrega (opcional)"
        placeholder="Rua, número"
        value={address}
        onChangeText={setAddress}
      />

      <TextField
        label="Bairro (opcional)"
        placeholder="Ex: Centro"
        value={neighborhood}
        onChangeText={setNeighborhood}
      />

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

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <Button
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!date || !guestCount}
      >
        Ver kits recomendados
      </Button>
    </Screen>
  );
}
