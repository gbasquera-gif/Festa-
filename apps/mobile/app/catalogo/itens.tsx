import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { SearchField } from "@/components/SearchField";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { FloatingCta } from "@/components/FloatingCta";
import { api } from "@/lib/api";
import { normalize } from "@/lib/catalog";
import type { Product } from "@/lib/types";

/**
 * Peças avulsas, sem separação por categoria.
 *
 * A navegação por Decoração / Mobiliário / Louças saiu da vitrine: ela pedia
 * que o cliente traduzisse a festa que imaginou em tipos de peça antes de ver
 * qualquer coisa. Com o catálogo do tamanho que a Festaê tem hoje, uma lista
 * única com busca encontra mais rápido do que dois toques de menu.
 */
export default function Itens() {
  const [term, setTerm] = useState("");
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });

  const query = normalize(term);
  const filtered = useMemo(() => {
    if (query.length < 2) return products ?? [];
    return (products ?? []).filter((product) =>
      normalize(`${product.name} ${product.description ?? ""}`).includes(query),
    );
  }, [products, query]);

  const entries: CatalogEntry[] = filtered.map((product) => ({
    id: product.id,
    title: product.name,
    imageUrl: product.imageUrl,
    price: product.unitPrice,
    onPress: () => router.push(`/catalogo/produto/${product.id}`),
  }));

  return (
    <Screen
      header={<DetailHeader title="Itens adicionais" showShare={false} />}
      contentClassName="gap-4"
      floating={<FloatingCta />}
    >
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Itens adicionais para alugar</Text>
        <Text className="text-navy/70">
          Peças avulsas para completar seu kit — ou para montar a festa do seu jeito.
        </Text>
      </View>

      <SearchField
        value={term}
        onChangeText={setTerm}
        placeholder="Buscar item pelo nome..."
      />

      {isLoading ? (
        <Text className="text-navy/60">Carregando...</Text>
      ) : (
        <CatalogGrid
          entries={entries}
          emptyMessage={
            query.length >= 2
              ? `Nada encontrado para “${term.trim()}”.`
              : "Ainda não há itens publicados."
          }
        />
      )}
    </Screen>
  );
}
