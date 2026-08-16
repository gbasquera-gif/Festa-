import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { PRODUCT_CATEGORY_LABEL } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { DetailHeader } from "@/components/DetailHeader";
import { ImageCarousel } from "@/components/ImageCarousel";
import { HighlightGrid } from "@/components/HighlightGrid";
import { QuantityStepper } from "@/components/QuantityStepper";
import { api } from "@/lib/api";
import { formatBRL, highlightsFor } from "@/lib/catalog";
import { useFavoritos } from "@/lib/favoritos";
import { useOrcamento } from "@/lib/orcamento";
import { track } from "@/lib/analytics";
import type { Kit, Product } from "@/lib/types";
import { colors } from "@/theme";

export default function ProdutoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addProduct } = useOrcamento();
  const { isFavorite, toggle } = useFavoritos();

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<Product>(`/products/${id}`),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });

  // Esconde a confirmação sozinha para o rodapé voltar ao estado normal.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 4000);
    return () => clearTimeout(timer);
  }, [added]);

  if (isLoading || !product) {
    return (
      <Screen header={<DetailHeader title="Item" />}>
        <Text className="text-navy/60">{isLoading ? "Carregando..." : "Item não encontrado."}</Text>
      </Screen>
    );
  }

  const images = product.imageUrl ? [product.imageUrl] : [];

  function handleAdd() {
    addProduct(product!.id, quantity);
    track("EXTRA_ADICIONADO", { productId: product!.id, quantity });
    setAdded(true);
  }

  return (
    <Screen
      header={
        <DetailHeader
          title={PRODUCT_CATEGORY_LABEL[product.category] ?? "Item"}
          favorite={isFavorite("product", product.id)}
          onToggleFavorite={() => toggle("product", product.id)}
          shareMessage={`Olha esse item na Festaê: ${product.name} — ${formatBRL(product.unitPrice)}`}
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
              <Text className="flex-1 text-sm font-sans-bold text-navy">Adicionado ao orçamento</Text>
              <Text className="text-sm font-sans-bold text-coral">Ver orçamento</Text>
            </Pressable>
          )}

          <View className="flex-row items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <Button className="flex-1 px-4" onPress={handleAdd}>
              Adicionar ao orçamento
            </Button>
          </View>
        </View>
      }
    >
      <ImageCarousel images={images} />

      <View className="gap-1">
        <Text className="font-sans-extrabold text-2xl leading-8 text-navy">{product.name}</Text>
        {/* "a unidade", e não "/ diária": o preço é por peça alugada, e o
            período de locação é o prazo combinado com a Festaê — é o que
            dizem os Termos de Uso. Anunciar diária criava uma tabela de
            preços que não existe, e ainda destoava do resto do app, que já
            fala "a unidade" no detalhe do kit. */}
        <Text className="text-navy/60">
          <Text className="font-sans-extrabold text-xl text-coral">{formatBRL(product.unitPrice)}</Text>{" "}
          a unidade
        </Text>
      </View>

      {product.description && (
        <Text className="text-base leading-6 text-navy/70">{product.description}</Text>
      )}

      <HighlightGrid highlights={highlightsFor(product.category)} />
    </Screen>
  );
}
