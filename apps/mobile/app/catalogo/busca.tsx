import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { SearchField } from "@/components/SearchField";
import { CategoryCircle } from "@/components/CategoryCircle";
import { SectionHeader } from "@/components/SectionHeader";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/catalog";
import type { Kit, Product } from "@/lib/types";

/** Remove acentos e caixa para "louça" casar com "louca". */
function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function Busca() {
  const [term, setTerm] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });

  const query = normalize(term);

  const matchedKits = useMemo(() => {
    if (query.length < 2) return [];
    return (kits ?? []).filter((kit) =>
      normalize(`${kit.name} ${kit.description ?? ""} ${kit.theme?.name ?? ""}`).includes(query),
    );
  }, [kits, query]);

  const matchedProducts = useMemo(() => {
    if (query.length < 2) return [];
    return (products ?? []).filter((product) =>
      normalize(`${product.name} ${product.description ?? ""}`).includes(query),
    );
  }, [products, query]);

  const kitEntries: CatalogEntry[] = matchedKits.map((kit) => ({
    id: kit.id,
    title: kit.name,
    imageUrl: kit.coverImageUrl,
    price: kit.basePrice,
    priceLabel: "a partir de",
    onPress: () => router.push(`/catalogo/kit/${kit.id}`),
  }));

  const productEntries: CatalogEntry[] = matchedProducts.map((product) => ({
    id: product.id,
    title: product.name,
    imageUrl: product.imageUrl,
    price: product.unitPrice,
    onPress: () => router.push(`/catalogo/produto/${product.id}`),
  }));

  const searching = query.length >= 2;
  const nothingFound = searching && kitEntries.length === 0 && productEntries.length === 0;

  return (
    <Screen header={<DetailHeader title="Buscar" />} contentClassName="gap-5">
      <SearchField value={term} onChangeText={setTerm} autoFocus />

      {!searching && (
        <View className="gap-4">
          <SectionHeader title="Buscar por categoria" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {CATEGORIES.map((category) => (
              <CategoryCircle
                key={category.key}
                category={category}
                onPress={() => router.push(`/catalogo/categoria/${category.key}`)}
              />
            ))}
          </ScrollView>
          <Text className="text-sm text-navy/60">Digite pelo menos 2 letras para buscar.</Text>
        </View>
      )}

      {nothingFound && (
        <View className="rounded-2xl border border-sand bg-white px-6 py-10">
          <Text className="text-center text-navy/70">
            Nada encontrado para “{term.trim()}”. Tente outro termo ou navegue pelas categorias.
          </Text>
        </View>
      )}

      {kitEntries.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={`Kits (${kitEntries.length})`} />
          <CatalogGrid entries={kitEntries} emptyMessage="" />
        </View>
      )}

      {productEntries.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={`Itens (${productEntries.length})`} />
          <CatalogGrid entries={productEntries} emptyMessage="" />
        </View>
      )}
    </Screen>
  );
}
