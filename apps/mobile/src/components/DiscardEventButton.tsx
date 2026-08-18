import { useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiError } from "@/lib/api";
import { colors } from "@/theme";

/**
 * Descarta uma festa em montagem e devolve o cliente ao ponto de partida.
 *
 * Existe porque, sem isso, quem escolhia data e convidados ficava preso: dava
 * para trocar kit e extras, nunca para jogar tudo fora e recomeçar. A saída
 * era criar uma segunda festa e deixar a primeira apodrecendo na lista.
 *
 * Pede confirmação porque a ação apaga de verdade. No navegador o Alert do
 * React Native não abre — usamos o confirm nativo, senão a confirmação
 * simplesmente não apareceria e o toque não faria nada.
 */
export function DiscardEventButton({
  eventId,
  label = "Descartar esta festa",
  onDiscarded,
}: {
  eventId: string;
  label?: string;
  onDiscarded: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api(`/events/${eventId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      queryClient.removeQueries({ queryKey: ["event", eventId] });
      onDiscarded();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível descartar agora."),
  });

  async function confirmar() {
    setError(null);
    const pergunta = "Descartar esta festa? Os itens e a data escolhida serão perdidos.";

    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(pergunta)) mutation.mutate();
      return;
    }

    Alert.alert("Descartar festa", pergunta, [
      { text: "Manter", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => mutation.mutate() },
    ]);
  }

  return (
    <View className="gap-1">
      <Pressable
        onPress={confirmar}
        disabled={mutation.isPending}
        hitSlop={8}
        className="flex-row items-center justify-center gap-2 py-2"
      >
        <Ionicons name="trash-outline" size={16} color={colors.muted} />
        <Text className="text-sm font-sans-bold text-navy/50">
          {mutation.isPending ? "Descartando..." : label}
        </Text>
      </Pressable>
      {error && <Text className="text-center text-sm text-red-500">{error}</Text>}
    </View>
  );
}
