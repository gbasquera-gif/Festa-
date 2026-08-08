import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { api } from "@/lib/api";
import type { Kit } from "@/lib/types";

export default function Kits() {
  const { data: kits, isLoading } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });

  const entries: CatalogEntry[] =
    kits?.map((kit) => ({
      id: kit.id,
      title: kit.name,
      imageUrl: kit.coverImageUrl,
      price: kit.basePrice,
      priceLabel: "a partir de",
      onPress: () => router.push(`/catalogo/kit/${kit.id}`),
    })) ?? [];

  return (
    <Screen header={<DetailHeader title="Kits" />} contentClassName="gap-4">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Kits prontos</Text>
        <Text className="text-navy/70">Combinações fechadas para resolver a festa de uma vez.</Text>
      </View>

      {isLoading ? (
        <Text className="text-navy/60">Carregando...</Text>
      ) : (
        <CatalogGrid entries={entries} emptyMessage="Nenhum kit publicado ainda." />
      )}
    </Screen>
  );
}
