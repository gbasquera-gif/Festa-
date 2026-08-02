import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { DetailHeader } from "@/components/DetailHeader";
import { ImageCarousel } from "@/components/ImageCarousel";
import { HighlightGrid } from "@/components/HighlightGrid";
import { ColorSwatches } from "@/components/ColorSwatches";
import { ImageCover } from "@/components/ImageCover";
import { api } from "@/lib/api";
import { formatBRL, highlightsFor } from "@/lib/catalog";
import { useFavoritos } from "@/lib/favoritos";
import { useOrcamento } from "@/lib/orcamento";
import { track } from "@/lib/analytics";
import type { Kit } from "@/lib/types";
import { colors } from "@/theme";

export default function KitDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { kitId, setKit } = useOrcamento();
  const { isFavorite, toggle } = useFavoritos();

  const [added, setAdded] = useState(false);

  const { data: kit, isLoading } = useQuery({
    queryKey: ["kit", id],
    queryFn: () => api<Kit>(`/kits/${id}`),
  });

  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 4000);
    return () => clearTimeout(timer);
  }, [added]);

  if (isLoading || !kit) {
    return (
      <Screen header={<DetailHeader title="Kit" />}>
        <Text className="text-navy/60">{isLoading ? "Carregando..." : "Kit não encontrado."}</Text>
      </Screen>
    );
  }

  const chosen = kitId === kit.id;
  const images = [kit.coverImageUrl, ...kit.images].filter((image): image is string => Boolean(image));
  const palette = kit.theme?.colorPalette ?? [];

  function handleToggleKit() {
    if (chosen) {
      setKit(null);
      return;
    }
    setKit(kit!.id);
    track("ESCOLHA_KIT", { kitId: kit!.id });
    setAdded(true);
  }

  return (
    <Screen
      header={
        <DetailHeader
          title={kit.theme?.name ?? "Kit"}
          favorite={isFavorite("kit", kit.id)}
          onToggleFavorite={() => toggle("kit", kit.id)}
          shareMessage={`Olha esse kit na Festaê: ${kit.name} — a partir de ${formatBRL(kit.basePrice)}`}
        />
      }
      contentClassName="gap-5"
      footer={
        <View className="gap-3">
          {added && (
            <Pressable
              onPress={() => router.push("/(tabs)/pedidos")}
              className="flex-row items-center gap-2 rounded-2xl bg-linen px-4 py-3"
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.coral} />
              <Text className="flex-1 text-sm font-sans-bold text-navy">Kit adicionado ao orçamento</Text>
              <Text className="text-sm font-sans-bold text-coral">Ver orçamento</Text>
            </Pressable>
          )}

          <Button variant={chosen ? "outline" : "primary"} onPress={handleToggleKit}>
            {chosen ? "Remover do orçamento" : "Adicionar ao orçamento"}
          </Button>
        </View>
      }
    >
      <ImageCarousel images={images} />

      <View className="gap-1">
        <Text className="font-sans-extrabold text-2xl leading-8 text-navy">{kit.name}</Text>
        <Text className="text-navy/60">
          <Text className="font-sans-extrabold text-xl text-coral">{formatBRL(kit.basePrice)}</Text> / kit
        </Text>
      </View>

      {kit.description && <Text className="text-base leading-6 text-navy/70">{kit.description}</Text>}

      <View className="flex-row flex-wrap gap-2">
        {/* Kits sem faixa definida ficam com o default 0–9999 no banco: mostrar
            isso como "0 a 9999 convidados" não diz nada ao cliente. */}
        {kit.minGuests > 0 && kit.maxGuests < 9999 && (
          <Badge label={`${kit.minGuests} a ${kit.maxGuests} convidados`} variant="neutral" />
        )}
        {kit.theme && <Badge label={kit.theme.name} variant="coral" />}
      </View>

      <HighlightGrid highlights={highlightsFor("DECORACAO")} />

      {palette.length > 0 && <ColorSwatches colors={palette} />}

      {kit.products.length > 0 && (
        <View className="gap-3">
          <Text className="font-sans-bold text-navy">O que vem no kit</Text>
          {kit.products.map((link) => (
            <Pressable
              key={link.productId}
              onPress={() => router.push(`/catalogo/produto/${link.productId}`)}
              className="flex-row items-center gap-3 rounded-2xl border border-sand bg-white p-2.5"
            >
              <ImageCover uri={link.product.imageUrl} rounded="all" className="h-14 w-14" showPlaceholderLabel={false} />
              <Text className="flex-1 font-sans-bold text-navy" numberOfLines={2}>
                {link.product.name}
              </Text>
              <Text className="text-sm font-sans-bold text-navy/50">{link.quantity}x</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
