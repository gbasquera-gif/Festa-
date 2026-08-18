import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { EventType } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { Chip } from "@/components/Chip";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { FloatingCta } from "@/components/FloatingCta";
import { api } from "@/lib/api";
import { FESTAS } from "@/lib/festas";
import type { Kit } from "@/lib/types";

export default function Kits() {
  const [tipo, setTipo] = useState<EventType | null>(null);

  const { data: kits, isLoading } = useQuery({
    queryKey: ["kits", tipo],
    queryFn: () => api<Kit[]>(`/kits${tipo ? `?eventType=${tipo}` : ""}`),
  });

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
    <Screen
      header={<DetailHeader title="Kits" showShare={false} />}
      contentClassName="gap-4"
      floating={<FloatingCta />}
    >
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Kits prontos</Text>
        <Text className="text-navy/70">Combinações fechadas para resolver a festa de uma vez.</Text>
      </View>

      {/* Filtro por ocasião em vez de por categoria de produto: é assim que o
          cliente pensa a festa, e é o mesmo recorte da vitrine. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5"
        contentContainerClassName="gap-2 px-5"
      >
        <Chip label="Todas as festas" selected={tipo === null} onPress={() => setTipo(null)} />
        {FESTAS.map((festa) => (
          <Chip
            key={festa.key}
            label={festa.label}
            selected={tipo === festa.key}
            onPress={() => setTipo(tipo === festa.key ? null : festa.key)}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <Text className="text-navy/60">Carregando...</Text>
      ) : (
        <CatalogGrid
          entries={entries}
          emptyMessage={
            tipo
              ? "Ainda não há kit publicado para esta ocasião."
              : "Nenhum kit publicado ainda."
          }
        />
      )}
    </Screen>
  );
}
