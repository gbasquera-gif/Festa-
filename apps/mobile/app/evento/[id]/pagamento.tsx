import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { splitPayment } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { DetailHeader } from "@/components/DetailHeader";
import { api, ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";
import { type EventRecord, type PaymentRecord } from "@/lib/types";
import { colors } from "@/theme";

export default function Pagamento() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: event } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api<EventRecord>(`/events/${id}`),
  });

  /**
   * A confirmação do Pix chega ao servidor por webhook do Mercado Pago, não
   * ao aparelho. Enquanto o sinal estiver pendente, a tela reconsulta a cada
   * 5 segundos — é o que faz o "Pagamento confirmado" aparecer sozinho,
   * segundos depois de a pessoa pagar no app do banco.
   */
  const { data: payments, isLoading } = useQuery({
    queryKey: ["payments", id],
    queryFn: () => api<PaymentRecord[]>(`/events/${id}/order/payments`),
    refetchInterval: (query) => {
      const list = query.state.data as PaymentRecord[] | undefined;
      const deposit = list?.find((p) => p.type === "DEPOSIT");
      return deposit?.status === "PAID" ? false : 5000;
    },
  });

  const deposit = payments?.find((payment) => payment.type === "DEPOSIT");
  const paid = deposit?.status === "PAID";

  /**
   * Conta o tempo que resta do QR. O Pix vence, e sem mostrar isso a pessoa
   * ficaria tentando pagar um código morto sem entender por quê.
   */
  const [restante, setRestante] = useState<number | null>(null);
  useEffect(() => {
    if (!deposit?.expiresAt || paid) {
      setRestante(null);
      return;
    }
    const alvo = new Date(deposit.expiresAt).getTime();
    const tick = () => setRestante(Math.max(0, Math.round((alvo - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deposit?.expiresAt, paid]);

  const expirado = restante === 0 || (deposit != null && deposit.status === "FAILED");
  const pixAtivo = deposit != null && !expirado && Boolean(deposit.pixQrCode);
  const contagem =
    restante == null
      ? null
      : `${String(Math.floor(restante / 60)).padStart(2, "0")}:${String(restante % 60).padStart(2, "0")}`;

  const createPix = useMutation({
    mutationFn: () =>
      api<PaymentRecord>(`/events/${id}/order/payments`, {
        method: "POST",
        body: JSON.stringify({ type: "DEPOSIT", method: "PIX" }),
      }),
    onSuccess: () => {
      track("PAGAMENTO_INICIADO", { eventId: id });
      queryClient.invalidateQueries({ queryKey: ["payments", id] });
      setError(null);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível gerar o Pix agora."),
  });

  async function copyCode() {
    if (!deposit?.pixQrCode) return;
    await Clipboard.setStringAsync(deposit.pixQrCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const total = Number(event?.order.total ?? 0);
  const { deposit: depositAmount, balance } = splitPayment(total);

  if (paid) {
    return (
      <Screen header={<DetailHeader title="Pagamento" showShare={false} />} contentClassName="gap-5">
        <View className="items-center gap-3 pt-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <Ionicons name="checkmark-circle" size={64} color="#16A34A" />
          </View>
          <Text className="text-center font-sans-extrabold text-2xl text-navy">
            Pagamento confirmado!
          </Text>
          <Text className="text-center text-navy/70">
            Recebemos seu sinal de {formatBRL(depositAmount)}. Sua data está garantida — a Festaê
            vai confirmar os detalhes com você.
          </Text>
        </View>

        <Card>
          <View className="flex-row justify-between">
            <Text className="text-navy/70">Sinal pago</Text>
            <Text className="font-sans-bold text-navy">{formatBRL(depositAmount)}</Text>
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-navy/70">Restante na retirada/entrega</Text>
            <Text className="font-sans-bold text-navy">{formatBRL(balance)}</Text>
          </View>
        </Card>

        <Button onPress={() => router.replace("/(tabs)/pedidos")}>Ver meus pedidos</Button>
        <Button variant="outline" onPress={() => router.replace("/(tabs)")}>
          Voltar ao início
        </Button>
      </Screen>
    );
  }

  return (
    <Screen header={<DetailHeader title="Pagamento do sinal" showShare={false} />} contentClassName="gap-5">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Garanta sua data</Text>
        <Text className="text-navy/70">
          A data fica reservada quando o sinal de 50% é confirmado. O restante você paga na
          retirada ou na entrega.
        </Text>
      </View>

      <Card>
        <View className="flex-row items-baseline justify-between">
          <Text className="font-sans-bold text-navy">Sinal de 50%</Text>
          <Text className="font-sans-extrabold text-2xl text-coral">{formatBRL(depositAmount)}</Text>
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-sm text-navy/60">Total da festa</Text>
          <Text className="text-sm text-navy/60">{formatBRL(total)}</Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-navy/60">Restante na retirada/entrega</Text>
          <Text className="text-sm text-navy/60">{formatBRL(balance)}</Text>
        </View>
      </Card>

      {isLoading && <ActivityIndicator color={colors.coral} />}

      {!isLoading && (!deposit || expirado) && (
        <>
          {expirado && (
            <View className="flex-row gap-2 rounded-2xl bg-linen p-3.5">
              <Ionicons name="time-outline" size={18} color={colors.navy} />
              <Text className="flex-1 text-sm leading-5 text-navy/70">
                O código anterior venceu. Gere um novo — sua reserva continua guardada.
              </Text>
            </View>
          )}
          <Button onPress={() => createPix.mutate()} loading={createPix.isPending}>
            {expirado ? "Gerar novo Pix" : "Gerar Pix do sinal"}
          </Button>
          {error && (
            <Card className="gap-3">
              <Text className="text-sm leading-5 text-navy/70">{error}</Text>
              <Button
                variant="outline"
                onPress={() =>
                  openWhatsApp(
                    `Oi! Quero pagar o sinal da minha festa (pedido ${id}) e o Pix não gerou no app.`,
                  )
                }
              >
                Falar com a Festaê
              </Button>
            </Card>
          )}
        </>
      )}

      {pixAtivo && deposit && (
        <>
          {contagem && (
            <View className="items-center gap-1 rounded-2xl border border-sand bg-white p-3.5">
              <Text className="text-sm text-navy/60">Este código vale por</Text>
              <Text className="font-sans-extrabold text-2xl text-coral">{contagem}</Text>
            </View>
          )}

          {deposit.pixQrCodeBase64 && (
            <View className="items-center gap-2 rounded-2xl border border-sand bg-white p-4">
              <Text className="font-sans-bold text-navy">Aponte a câmera do seu banco</Text>
              <Image
                source={{ uri: `data:image/png;base64,${deposit.pixQrCodeBase64}` }}
                style={{ width: 220, height: 220 }}
                resizeMode="contain"
                accessibilityLabel="QR Code do Pix"
              />
            </View>
          )}

          {deposit.pixQrCode && (
            <View className="gap-2">
              <Text className="text-sm font-sans-bold text-navy">Ou use o Pix copia e cola</Text>
              <Pressable
                onPress={copyCode}
                className="flex-row items-center gap-3 rounded-2xl border border-sand bg-white p-4"
              >
                <Text className="flex-1 text-xs text-navy/60" numberOfLines={2}>
                  {deposit.pixQrCode}
                </Text>
                <Ionicons
                  name={copied ? "checkmark-circle" : "copy-outline"}
                  size={22}
                  color={copied ? "#16A34A" : colors.coral}
                />
              </Pressable>
              <Text className="text-center text-xs text-navy/50">
                {copied ? "Código copiado!" : "Toque para copiar o código"}
              </Text>
            </View>
          )}

          {/* Plano B: se o QR não renderizar no aparelho, a página oficial
              do Mercado Pago tem o mesmo código e as instruções. */}
          {deposit.checkoutUrl && (
            <Pressable
              onPress={() => Linking.openURL(deposit.checkoutUrl!).catch(() => {})}
              className="flex-row items-center justify-center gap-2 py-1"
            >
              <Ionicons name="open-outline" size={16} color={colors.navy} />
              <Text className="text-sm font-sans-bold text-navy/70">
                Abrir a página de pagamento
              </Text>
            </Pressable>
          )}

          <View className="flex-row items-center justify-center gap-2">
            <ActivityIndicator size="small" color={colors.muted} />
            <Text className="text-sm text-navy/60">Aguardando a confirmação do pagamento…</Text>
          </View>

          <Text className="text-center text-xs leading-4 text-navy/50">
            Assim que o banco confirmar, esta tela muda sozinha. Você pode fechar o app — a reserva
            continua salva em Pedidos.
          </Text>
        </>
      )}
    </Screen>
  );
}
