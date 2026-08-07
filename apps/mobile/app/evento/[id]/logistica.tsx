import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  ASSEMBLY_FEE,
  DELIVERY_CITY,
  DELIVERY_FEE,
  DELIVERY_UNAVAILABLE_MESSAGE,
  isDeliveryCity,
  type Fulfillment,
} from "@festae/shared";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { StepProgress } from "@/components/StepProgress";
import { HelpLink } from "@/components/WhatsAppButton";
import { api, ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/catalog";
import { type EventRecord } from "@/lib/types";
import { colors } from "@/theme";

/** Cartão de escolha: título, explicação, preço e marca de selecionado. */
function Option({
  icon,
  title,
  description,
  price,
  selected,
  disabled,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  price: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      className={`flex-row items-center gap-3 rounded-2xl border p-4 ${
        selected ? "border-coral bg-coral/5" : "border-sand bg-white"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View
        className={`h-11 w-11 items-center justify-center rounded-full ${
          selected ? "bg-coral" : "bg-linen"
        }`}
      >
        <Ionicons name={icon as never} size={21} color={selected ? colors.white : colors.navy} />
      </View>

      <View className="flex-1">
        <Text className="font-sans-bold text-navy">{title}</Text>
        <Text className="text-sm leading-5 text-navy/60">{description}</Text>
      </View>

      <View className="items-end">
        <Text className={`font-sans-extrabold ${selected ? "text-coral" : "text-navy"}`}>{price}</Text>
        {selected && <Ionicons name="checkmark-circle" size={18} color={colors.coral} />}
      </View>
    </Pressable>
  );
}

export default function Logistica() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
  const [assembly, setAssembly] = useState(false);
  const [address, setAddress] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reflete o que já estiver gravado, para quem volta para revisar.
  useEffect(() => {
    if (!event) return;
    setFulfillment(event.order.fulfillment ?? "PICKUP");
    setAssembly(event.order.assembly ?? false);
    setAddress(event.address ?? "");
    setNeighborhood(event.neighborhood ?? "");
  }, [event]);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/events/${id}/order/logistics`, {
        method: "PATCH",
        body: JSON.stringify({
          fulfillment,
          assembly,
          address: fulfillment === "DELIVERY" ? address : undefined,
          neighborhood: fulfillment === "DELIVERY" ? neighborhood : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      router.push(`/evento/${id}/resumo`);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar sua escolha."),
  });

  if (isLoading || !event) {
    return (
      <Screen>
        <Text className="text-navy/60">Carregando...</Text>
      </Screen>
    );
  }

  const canDeliver = isDeliveryCity(event.city);
  const missingAddress = fulfillment === "DELIVERY" && !address.trim();

  return (
    <Screen>
      <StepProgress step={4} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Como você prefere receber?</Text>
        <Text className="text-navy/70">Escolha a entrega e se quer a montagem por nossa conta.</Text>
      </View>

      <View className="gap-3">
        <Text className="text-sm font-sans-bold uppercase tracking-wide text-navy/50">Entrega</Text>

        <Option
          icon="business-outline"
          title="Retirar na Festaê"
          description="Você busca na nossa sede, no horário combinado."
          price="Grátis"
          selected={fulfillment === "PICKUP"}
          onPress={() => setFulfillment("PICKUP")}
        />

        <Option
          icon="car-outline"
          title={`Entrega em ${DELIVERY_CITY}`}
          description={
            canDeliver
              ? "A gente leva tudo até o endereço da festa."
              : `Disponível somente em ${DELIVERY_CITY}.`
          }
          price={`+ ${formatBRL(DELIVERY_FEE)}`}
          selected={fulfillment === "DELIVERY"}
          disabled={!canDeliver}
          onPress={() => setFulfillment("DELIVERY")}
        />

        {!canDeliver && (
          <View className="flex-row gap-2 rounded-2xl bg-linen p-3.5">
            <Ionicons name="information-circle-outline" size={18} color={colors.navy} />
            <Text className="flex-1 text-sm leading-5 text-navy/70">
              {DELIVERY_UNAVAILABLE_MESSAGE}
            </Text>
          </View>
        )}

        {fulfillment === "DELIVERY" && (
          <View className="gap-3">
            <TextField
              label="Endereço da festa"
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
          </View>
        )}
      </View>

      <View className="gap-3">
        <Text className="text-sm font-sans-bold uppercase tracking-wide text-navy/50">Montagem</Text>

        <Option
          icon="hand-left-outline"
          title="Não quero montagem"
          description="Você mesmo monta a decoração no local."
          price="Grátis"
          selected={!assembly}
          onPress={() => setAssembly(false)}
        />

        <Option
          icon="construct-outline"
          title="Quero montagem"
          description="Nossa equipe monta tudo no local da festa."
          price={`+ ${formatBRL(ASSEMBLY_FEE)}`}
          selected={assembly}
          onPress={() => setAssembly(true)}
        />
      </View>

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <Button onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={missingAddress}>
        Ver resumo da festa
      </Button>
      {missingAddress && (
        <Text className="text-center text-xs text-navy/50">
          Informe o endereço para seguir com a entrega.
        </Text>
      )}

      <HelpLink message="Oi! Tenho uma dúvida sobre entrega e montagem da minha festa." />
    </Screen>
  );
}
