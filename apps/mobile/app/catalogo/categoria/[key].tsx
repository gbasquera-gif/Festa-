import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { api } from "@/lib/api";
import { CATEGORY_BY_KEY, isProductCategory } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export default function CategoriaCatalogo() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const category = isProductCategory(key) ? CATEGORY_BY_KEY[key] : null;

  const { data: products, isLoading } = useQuery({
    queryKey: ["products", key],
    queryFn: () => api<Product[]>(`/products?category=${key}`),
    enabled: Boolean(category),
  });

  if (!category) {
    return (
      <Screen>
        <Text className="text-navy/70">Categoria não encontrada.</Text>
      </Screen>
    );
  }

  const entries: CatalogEntry[] =
    products?.map((product) => ({
      id: product.id,
      title: product.name,
      imageUrl: product.imageUrl,
      price: product.unitPrice,
      onPress: () => router.push(`/catalogo/produto/${product.id}`),
    })) ?? [];

  return (
    <Screen header={<DetailHeader title={category.label} />} contentClassName="gap-4">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">{category.label}</Text>
        <Text className="text-navy/70">{category.description}</Text>
      </View>

      {isLoading ? (
        <Text className="text-navy/60">Carregando...</Text>
      ) : (
        <CatalogGrid entries={entries} emptyMessage="Ainda não há itens publicados nesta categoria." />
      )}
    </Screen>
  );
}
