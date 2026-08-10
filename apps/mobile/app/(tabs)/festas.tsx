import { Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { CatalogCard } from "@/components/CatalogCard";
import { FestaTile, FestaPersonalizadaCard } from "@/components/FestaCard";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";
import { FESTAS, MENSAGEM_FESTA_PERSONALIZADA } from "@/lib/festas";
import type { Kit } from "@/lib/types";

export default function Festas() {
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });

  function abrirPersonalizada() {
    track("CLIQUE_WHATSAPP", { origem: "festa-personalizada" });
    openWhatsApp(MENSAGEM_FESTA_PERSONALIZADA);
  }

  return (
    <Screen contentClassName="gap-5">
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Que festa você vai fazer?</Text>
        <Text className="text-navy/70">
          Escolha a ocasião e veja os temas e kits que combinam com ela.
        </Text>
      </View>

      <SearchField onPress={() => router.push("/catalogo/busca")} />

      <View className="flex-row flex-wrap gap-3">
        {FESTAS.map((festa) => (
          <FestaTile
            key={festa.key}
            festa={festa}
            onPress={() => router.push(`/catalogo/festa/${festa.slug}`)}
          />
        ))}
      </View>

      <FestaPersonalizadaCard onPress={abrirPersonalizada} />

      {kits && kits.length > 0 && (
        <View className="gap-3">
          <SectionHeader title="Kits prontos" onAction={() => router.push("/catalogo/kits")} />
          <View className="flex-row flex-wrap gap-3">
            {kits.slice(0, 4).map((kit) => (
              <View key={kit.id} className="flex-1 basis-[47%]">
                <CatalogCard
                  title={kit.name}
                  imageUrl={kit.coverImageUrl}
                  price={kit.basePrice}
                  priceLabel="a partir de"
                  onPress={() => router.push(`/catalogo/kit/${kit.id}`)}
                />
              </View>
            ))}
          </View>
        </View>
      )}
    </Screen>
  );
}
