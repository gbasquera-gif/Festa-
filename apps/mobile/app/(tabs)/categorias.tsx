import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Icon } from "@/components/Icon";
import { SearchField } from "@/components/SearchField";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import { colors } from "@/theme";

export default function Categorias() {
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });

  function countFor(category: string) {
    return products?.filter((product) => product.category === category).length;
  }

  return (
    <Screen contentClassName="gap-5">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Categorias</Text>
        <Text className="text-navy/70">Escolha por onde começar a montar sua festa.</Text>
      </View>

      <SearchField onPress={() => router.push("/catalogo/busca")} />

      <View className="flex-row flex-wrap gap-3">
        {CATEGORIES.map((category) => {
          const count = countFor(category.key);
          return (
            <Pressable
              key={category.key}
              onPress={() => router.push(`/catalogo/categoria/${category.key}`)}
              className="flex-1 basis-[47%] gap-2 rounded-2xl border border-sand bg-white p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-full bg-linen">
                <Icon name={category.icon} set={category.iconSet} size={24} color={colors.navy} />
              </View>
              <Text className="font-sans-bold text-navy">{category.label}</Text>
              <Text className="text-xs leading-4 text-navy/60" numberOfLines={3}>
                {category.description}
              </Text>
              {count !== undefined && (
                <Text className="text-xs font-sans-bold text-coral">
                  {count} {count === 1 ? "item" : "itens"}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
