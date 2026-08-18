import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ImageCover } from "@/components/ImageCover";
import { QuantityStepper } from "@/components/QuantityStepper";
import { SectionHeader } from "@/components/SectionHeader";
import { api } from "@/lib/api";
import { formatBRL, sufixoConvidados } from "@/lib/catalog";
import { useOrcamento } from "@/lib/orcamento";
import { DiscardEventButton } from "@/components/DiscardEventButton";
import { useAuth } from "@/lib/auth";
import { goToLogin } from "@/lib/login-gate";
import { EVENT_TYPE_LABEL, ORDER_STATUS_LABEL, type EventRecord, type Kit, type Product } from "@/lib/types";
import { colors } from "@/theme";

const STATUS_VARIANT: Record<string, "neutral" | "coral" | "success" | "danger"> = {
  CART: "neutral",
  REQUESTED: "coral",
  CONFIRMED: "success",
  CANCELLED: "danger",
};

export default function Pedidos() {
  const { user } = useAuth();
  const { kitId, items, setProductQuantity, removeProduct, setKit, clear } = useOrcamento();

  const { data: events, isLoading } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api<EventRecord[]>("/events"),
    enabled: Boolean(user),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
    enabled: items.length > 0,
  });
  const { data: kits } = useQuery({
    queryKey: ["kits"],
    queryFn: () => api<Kit[]>("/kits"),
    enabled: Boolean(kitId),
  });

  const chosenKit = kits?.find((kit) => kit.id === kitId) ?? null;

  const lines = items
    .map((item) => ({ item, product: products?.find((p) => p.id === item.productId) }))
    .filter((line): line is { item: typeof line.item; product: Product } => Boolean(line.product));

  const itemsTotal = lines.reduce(
    (sum, line) => sum + Number(line.product.unitPrice) * line.item.quantity,
    0,
  );
  const total = itemsTotal + Number(chosenKit?.basePrice ?? 0);
  const hasDraft = Boolean(kitId) || items.length > 0;

  return (
    <Screen contentClassName="gap-5">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Pedidos</Text>
        <Text className="text-navy/70">Seu orçamento em aberto e as festas que você já pediu.</Text>
      </View>

      {hasDraft && (
        <View className="gap-3 rounded-2xl border border-sand bg-white p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-extrabold text-lg text-navy">Orçamento em aberto</Text>
            <Pressable onPress={clear} hitSlop={8}>
              <Text className="text-xs font-sans-bold text-navy/50">Limpar</Text>
            </Pressable>
          </View>

          {chosenKit && (
            <View className="flex-row items-center gap-3 rounded-2xl bg-linen p-2.5">
              <ImageCover uri={chosenKit.coverImageUrl} rounded="all" className="h-14 w-14" showPlaceholderLabel={false} />
              <View className="flex-1">
                <Badge label="Kit escolhido" variant="coral" />
                <Text className="mt-1 font-sans-bold text-navy" numberOfLines={1}>
                  {chosenKit.name}
                </Text>
                <Text className="text-sm text-navy/70">{formatBRL(chosenKit.basePrice)}</Text>
              </View>
              <Pressable onPress={() => setKit(null)} hitSlop={8} accessibilityLabel="Remover kit">
                <Ionicons name="close" size={20} color={colors.navy} />
              </Pressable>
            </View>
          )}

          {lines.map(({ item, product }) => (
            <View key={item.productId} className="flex-row items-center gap-3">
              <ImageCover uri={product.imageUrl} rounded="all" className="h-14 w-14" showPlaceholderLabel={false} />
              <View className="flex-1">
                <Text className="font-sans-bold text-navy" numberOfLines={1}>
                  {product.name}
                </Text>
                <Text className="text-sm text-navy/70">{formatBRL(product.unitPrice)}</Text>
              </View>
              <QuantityStepper
                value={item.quantity}
                min={0}
                onChange={(quantity) =>
                  quantity === 0 ? removeProduct(item.productId) : setProductQuantity(item.productId, quantity)
                }
              />
            </View>
          ))}

          <View className="flex-row items-center justify-between border-t border-sand pt-3">
            <Text className="font-sans-bold text-navy">Total estimado</Text>
            <Text className="font-sans-extrabold text-xl text-coral">{formatBRL(total)}</Text>
          </View>

          <Text className="text-xs leading-4 text-navy/60">
            O valor final sai depois de escolher a data, a retirada ou entrega e a montagem.
          </Text>

          {/* O orçamento fica guardado no aparelho: quem monta sem conta não
              perde nada ao criar uma na hora de fechar. */}
          {/* Montar a festa não pede conta: o cadastro vem no fim, quando
              a reserva é fechada. */}
          <Button onPress={() => router.push("/montar/data")}>
            {user ? "Fechar orçamento" : "Criar conta e fechar orçamento"}
          </Button>
          {!user && (
            <Text className="text-center text-xs text-navy/50">
              Seu orçamento continua salvo — a conta é só para reservar a data.
            </Text>
          )}
        </View>
      )}

      <View className="gap-3">
        <SectionHeader title="Suas festas" />

        {!user && (
          <View className="items-center gap-3 rounded-2xl border border-sand bg-white px-6 py-8">
            <Ionicons name="person-circle-outline" size={36} color={colors.gold} />
            <Text className="text-center text-navy/70">
              Entre na sua conta para acompanhar as festas que você já pediu.
            </Text>
            <Button variant="navy" className="mt-1" onPress={() => goToLogin("/(tabs)/pedidos")}>
              Entrar
            </Button>
          </View>
        )}

        {user && isLoading && <Text className="text-navy/60">Carregando...</Text>}

        {user && events?.length === 0 && !hasDraft && (
          <View className="items-center gap-3 rounded-2xl border border-sand bg-white px-6 py-10">
            <Ionicons name="bag-handle-outline" size={36} color={colors.gold} />
            <Text className="text-center text-navy/70">
              Você ainda não pediu nenhuma festa. Monte um orçamento pelo catálogo.
            </Text>
            <Button variant="navy" className="mt-1" onPress={() => router.push("/(tabs)/festas")}>
              Explorar o catálogo
            </Button>
          </View>
        )}

        {events?.map((event) => (
          <Card key={event.id} onPress={() => router.push(`/evento/${event.id}/resumo`)}>
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-sans-bold text-navy">{EVENT_TYPE_LABEL[event.type]}</Text>
              <Badge
                label={ORDER_STATUS_LABEL[event.order.status]}
                variant={STATUS_VARIANT[event.order.status]}
              />
            </View>
            <Text className="mt-1 text-navy/70">
              {new Date(event.date).toLocaleDateString("pt-BR")}
              {sufixoConvidados(event.guestCount)}
            </Text>
            <Text className="text-navy/70">{event.theme?.name ?? "Tema não escolhido"}</Text>
            <Text className="mt-2 font-sans-bold text-coral">{formatBRL(event.order.total)}</Text>

            {/* Só enquanto o pedido não foi enviado: depois de solicitado há
                reserva e possivelmente sinal, e aí cancelar é conversa com a
                Festaê, não um toque. */}
            {event.order.status === "CART" && (
              <View className="mt-2 border-t border-sand pt-1">
                <DiscardEventButton eventId={event.id} onDiscarded={() => {}} />
              </View>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
