import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { SectionHeader } from "@/components/SectionHeader";
import { api } from "@/lib/api";
import { useFavoritos } from "@/lib/favoritos";
import type { Kit, Product } from "@/lib/types";
import { colors } from "@/theme";

export default function Favoritos() {
  const { products: favoriteProducts, kits: favoriteKits } = useFavoritos();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });

  const kitEntries: CatalogEntry[] =
    kits
      ?.filter((kit) => favoriteKits.includes(kit.id))
      .map((kit) => ({
        id: kit.id,
        title: kit.name,
        imageUrl: kit.coverImageUrl,
        price: kit.basePrice,
        priceLabel: "a partir de",
        onPress: () => router.push(`/catalogo/kit/${kit.id}`),
      })) ?? [];

  const productEntries: CatalogEntry[] =
    products
      ?.filter((product) => favoriteProducts.includes(product.id))
      .map((product) => ({
        id: product.id,
        title: product.name,
        imageUrl: product.imageUrl,
        price: product.unitPrice,
        onPress: () => router.push(`/catalogo/produto/${product.id}`),
      })) ?? [];

  const isEmpty = kitEntries.length === 0 && productEntries.length === 0;

  return (
    <Screen contentClassName="gap-5">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Favoritos</Text>
        <Text className="text-navy/70">O que você separou para decidir depois.</Text>
      </View>

      {isEmpty && (
        <View className="items-center gap-3 rounded-2xl border border-sand bg-white px-6 py-10">
          <Ionicons name="heart-outline" size={36} color={colors.gold} />
          <Text className="text-center text-navy/70">
            Toque no coração de um item ou kit para guardar aqui.
          </Text>
          <Button variant="navy" className="mt-1" onPress={() => router.push("/(tabs)/categorias")}>
            Explorar o catálogo
          </Button>
        </View>
      )}

      {kitEntries.length > 0 && (
        <View className="gap-3">
          <SectionHeader title="Kits salvos" />
          <CatalogGrid entries={kitEntries} emptyMessage="" />
        </View>
      )}

      {productEntries.length > 0 && (
        <View className="gap-3">
          <SectionHeader title="Itens salvos" />
          <CatalogGrid entries={productEntries} emptyMessage="" />
        </View>
      )}
    </Screen>
  );
}
