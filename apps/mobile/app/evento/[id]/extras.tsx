import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { StepProgress } from "@/components/StepProgress";
import { ImageCover } from "@/components/ImageCover";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { Order, Product } from "@/lib/types";

export default function Extras() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<Order>(`/events/${id}/order`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["order", id] });
    queryClient.invalidateQueries({ queryKey: ["my-events"] });
  };

  const addMutation = useMutation({
    mutationFn: (productId: string) =>
      api(`/events/${id}/order/items`, { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) }),
    onSuccess: (_data, productId) => {
      track("EXTRA_ADICIONADO", { productId, eventId: id });
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ productId, quantity }: { productId: string; quantity: number }) =>
      api(`/events/${id}/order/items/${productId}`, { method: "PATCH", body: JSON.stringify({ quantity }) }),
    onSuccess: invalidate,
  });

  function quantityFor(productId: string) {
    return order?.items.find((item) => item.productId === productId)?.quantity ?? 0;
  }

  return (
    <Screen>
      <StepProgress step={3} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Quer adicionar mais alguma coisa?</Text>
        <Text className="text-navy/70">Itens extras além do que já vem no seu kit.</Text>
      </View>

      {products?.map((product) => {
        const quantity = quantityFor(product.id);
        return (
          <Card key={product.id} className="flex-row items-center gap-3 overflow-hidden p-0 pr-4">
            <ImageCover uri={product.imageUrl} rounded="all" className="h-20 w-20" />
            <View className="flex-1 py-3">
              <Text className="font-bold text-navy">{product.name}</Text>
              <Text className="text-navy/70">R$ {Number(product.unitPrice).toFixed(2)}</Text>
            </View>

            {quantity === 0 ? (
              <Button
                variant="outline"
                onPress={() => addMutation.mutate(product.id)}
                loading={addMutation.isPending}
              >
                Adicionar
              </Button>
            ) : (
              <View className="flex-row items-center gap-3">
                <Button
                  variant="ghost"
                  className="px-3 py-2"
                  onPress={() => updateMutation.mutate({ productId: product.id, quantity: quantity - 1 })}
                >
                  −
                </Button>
                <Text className="w-6 text-center font-bold text-navy">{quantity}</Text>
                <Button
                  variant="ghost"
                  className="px-3 py-2"
                  onPress={() => updateMutation.mutate({ productId: product.id, quantity: quantity + 1 })}
                >
                  +
                </Button>
              </View>
            )}
          </Card>
        );
      })}

      <Button onPress={() => router.push(`/evento/${id}/resumo`)}>Ver resumo da festa</Button>
    </Screen>
  );
}
