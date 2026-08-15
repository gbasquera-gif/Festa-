import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { StepProgress } from "@/components/StepProgress";
import { HelpLink } from "@/components/WhatsAppButton";
import {
  OpcoesLogistica,
  faltaEndereco,
  type EscolhaLogistica,
} from "@/components/OpcoesLogistica";
import { api, ApiError } from "@/lib/api";
import { type EventRecord } from "@/lib/types";

export default function Logistica() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: event, isLoading } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  const [escolha, setEscolha] = useState<EscolhaLogistica>({
    fulfillment: "PICKUP",
    assembly: false,
    address: "",
    neighborhood: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Reflete o que já estiver gravado, para quem volta para revisar.
  useEffect(() => {
    if (!event) return;
    setEscolha({
      fulfillment: event.order.fulfillment ?? "PICKUP",
      assembly: event.order.assembly ?? false,
      address: event.address ?? "",
      neighborhood: event.neighborhood ?? "",
    });
  }, [event]);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/events/${id}/order/logistics`, {
        method: "PATCH",
        body: JSON.stringify({
          fulfillment: escolha.fulfillment,
          assembly: escolha.assembly,
          address: escolha.fulfillment === "DELIVERY" ? escolha.address : undefined,
          neighborhood: escolha.fulfillment === "DELIVERY" ? escolha.neighborhood : undefined,
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

  return (
    <Screen>
      <StepProgress step={4} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Como você prefere receber?</Text>
        <Text className="text-navy/70">Escolha a entrega e se quer a montagem por nossa conta.</Text>
      </View>

      <OpcoesLogistica city={event.city} value={escolha} onChange={setEscolha} />

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      <Button onPress={() => mutation.mutate()} loading={mutation.isPending} disabled={faltaEndereco(escolha)}>
        Ver resumo da festa
      </Button>
      {faltaEndereco(escolha) && (
        <Text className="text-center text-xs text-navy/50">
          Informe o endereço para seguir com a entrega.
        </Text>
      )}

      <HelpLink message="Oi! Tenho uma dúvida sobre entrega e montagem da minha festa." />
    </Screen>
  );
}
