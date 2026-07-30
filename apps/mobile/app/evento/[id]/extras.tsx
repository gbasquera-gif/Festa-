import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
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
    onSuccess: invalidate,
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
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Quer adicionar mais alguma coisa?</Text>
        <Text className="text-navy/70">Itens extras além do que já vem no seu kit.</Text>
      </View>

      {products?.map((product) => {
        const quantity = quantityFor(product.id);
        return (
          <Card key={product.id} className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
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
