import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { DetailHeader } from "@/components/DetailHeader";
import { ImageCarousel } from "@/components/ImageCarousel";
import { HighlightGrid } from "@/components/HighlightGrid";
import { ImageCover } from "@/components/ImageCover";
import { QuantityStepper } from "@/components/QuantityStepper";
import { api } from "@/lib/api";
import { formatBRL, highlightsFor } from "@/lib/catalog";
import { useFavoritos } from "@/lib/favoritos";
import { useOrcamento } from "@/lib/orcamento";
import { track } from "@/lib/analytics";
import type { Kit, Product } from "@/lib/types";
import { colors } from "@/theme";

/** Quantas unidades a mais de um mesmo item o cliente pode pedir pelo app. */
const EXTRA_MAXIMO = 30;

/**
 * Altura da lista de itens adicionais, em pontos.
 *
 * Escolhida para cortar uma linha ao meio: linha inteira medindo 76 pontos
 * mais 12 de espaçamento, 400 mostra quatro e meia. É a metade aparecendo
 * que avisa "tem mais aqui embaixo" — com corte exato na borda, a lista
 * parece terminar ali e ninguém rola.
 */
const ALTURA_DA_LISTA = 400;

export default function KitDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { kitId, setKit, quantityOf, setProductQuantity } = useOrcamento();
  const { isFavorite, toggle } = useFavoritos();

  const [added, setAdded] = useState(false);

  const { data: kit, isLoading } = useQuery({
    queryKey: ["kit", id],
    queryFn: () => api<Kit>(`/kits/${id}`),
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
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

  const noKit = new Set(kit.products.map((link) => link.productId));
  const sugestoes = (products ?? []).filter((product) => !noKit.has(product.id));

  /**
   * Mexer numa quantidade já escolhe o kit.
   *
   * Sem isso, quem subisse as cadeiras de 20 para 25 sem tocar no botão do
   * rodapé levaria para o orçamento 5 cadeiras soltas e nenhum kit — e só
   * descobriria na tela de resumo, com o preço errado.
   */
  function garantirKit() {
    if (kitId === kit!.id) return;
    setKit(kit!.id);
    track("ESCOLHA_KIT", { kitId: kit!.id });
    setAdded(true);
  }

  function handleToggleKit() {
    if (chosen) {
      setKit(null);
      return;
    }
    garantirKit();
  }

  /** Ajusta o total de um item do kit; o que passa do incluído vira extra. */
  function ajustarItemDoKit(productId: string, incluido: number, total: number) {
    garantirKit();
    setProductQuantity(productId, Math.max(0, total - incluido));
    if (total > incluido) {
      track("EXTRA_ADICIONADO", { productId, quantity: total - incluido, kitId: kit!.id });
    }
  }

  function ajustarItemDeFora(productId: string, quantidade: number) {
    garantirKit();
    setProductQuantity(productId, quantidade);
    if (quantidade > 0) {
      track("EXTRA_ADICIONADO", { productId, quantity: quantidade, kitId: kit!.id });
    }
  }

  // Total parcial: base do kit + tudo que passou do que ele já inclui. Não
  // entram entrega nem montagem — essas escolhas vêm depois, na logística.
  const totalExtras = [...kit.products.map((link) => link.product), ...sugestoes].reduce(
    (sum, product) => sum + quantityOf(product.id) * Number(product.unitPrice),
    0,
  );
  const totalParcial = Number(kit.basePrice) + totalExtras;

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

          {chosen ? (
            <>
              <View className="flex-row items-baseline justify-between">
                <Text className="text-sm text-navy/60">Total parcial</Text>
                <Text className="font-sans-extrabold text-xl text-coral">
                  {formatBRL(totalParcial)}
                </Text>
              </View>
              <Button onPress={() => router.push("/montar/data")}>Continuar para a data</Button>
              <Pressable onPress={() => setKit(null)} hitSlop={8} className="items-center py-1">
                <Text className="text-sm font-sans-bold text-navy/50">Remover kit do orçamento</Text>
              </Pressable>
            </>
          ) : (
            <Button onPress={handleToggleKit}>Escolher este kit</Button>
          )}
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

      {/* Sem faixa de convidados: o catálogo é de decoração, e painel, arco e
          mesa não mudam porque a festa tem 20 ou 200 pessoas. O selo dizia
          "10 a 30 convidados" como se houvesse um limite que não existe. */}
      {kit.theme && (
        <View className="flex-row flex-wrap gap-2">
          <Badge label={kit.theme.name} variant="coral" />
        </View>
      )}

      <HighlightGrid highlights={highlightsFor("DECORACAO")} />

      {kit.products.length > 0 && (
        <View className="gap-3">
          <View>
            <Text className="font-sans-bold text-navy">O que vem no kit</Text>
            <Text className="text-sm leading-5 text-navy/60">
              Precisa de mais de alguma coisa? Ajuste a quantidade — as unidades acima do que já vem
              no kit são cobradas à parte.
            </Text>
          </View>

          {kit.products.map((link) => {
            const extra = quantityOf(link.productId);
            const total = link.quantity + extra;
            return (
              <View key={link.productId} className="gap-2 rounded-2xl border border-sand bg-white p-2.5">
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => router.push(`/catalogo/produto/${link.productId}`)}
                    className="flex-row items-center gap-3"
                    style={{ flex: 1 }}
                  >
                    <ImageCover
                      uri={link.product.imageUrl}
                      rounded="all"
                      className="h-14 w-14"
                      showPlaceholderLabel={false}
                    />
                    <View className="flex-1">
                      <Text className="font-sans-bold text-navy" numberOfLines={2}>
                        {link.product.name}
                      </Text>
                      <Text className="text-xs text-navy/50">
                        {link.quantity}x no kit · {formatBRL(link.product.unitPrice)} a unidade extra
                      </Text>
                    </View>
                  </Pressable>

                  <QuantityStepper
                    value={total}
                    min={link.quantity}
                    max={link.quantity + EXTRA_MAXIMO}
                    onChange={(value) => ajustarItemDoKit(link.productId, link.quantity, value)}
                  />
                </View>

                {extra > 0 && (
                  <View className="flex-row justify-between rounded-xl bg-linen px-3 py-2">
                    <Text className="text-xs font-sans-bold text-navy">
                      +{extra} {extra === 1 ? "unidade adicional" : "unidades adicionais"}
                    </Text>
                    <Text className="text-xs font-sans-bold text-coral">
                      {formatBRL(extra * Number(link.product.unitPrice))}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {sugestoes.length > 0 && (
        <View className="gap-3">
          <View>
            <Text className="font-sans-bold text-navy">Quer acrescentar mais alguma coisa?</Text>
            <Text className="text-sm leading-5 text-navy/60">
              Itens adicionais para alugar junto com o kit.
            </Text>
          </View>

          {/* Lista inteira numa área que rola sozinha, em vez de mostrar seis
              e esconder o resto atrás de um botão. Quem está montando o kit
              não sai da página para ver o catálogo — some da tela o que já
              escolheu, e a maioria simplesmente não clicava.

              `nestedScrollEnabled` é o que faz o Android rolar aqui dentro:
              sem isso, o toque vai direto para a rolagem da página e a lista
              fica travada mostrando sempre as mesmas linhas. */}
          <ScrollView
            style={{ maxHeight: ALTURA_DA_LISTA }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            contentContainerClassName="gap-3"
          >
            {sugestoes.map((product) => {
              const quantidade = quantityOf(product.id);
              return (
                <View
                  key={product.id}
                  className="flex-row items-center gap-3 rounded-2xl border border-sand bg-white p-2.5"
                >
                  <Pressable
                    onPress={() => router.push(`/catalogo/produto/${product.id}`)}
                    className="flex-row items-center gap-3"
                    style={{ flex: 1 }}
                  >
                    <ImageCover
                      uri={product.imageUrl}
                      rounded="all"
                      className="h-14 w-14"
                      showPlaceholderLabel={false}
                    />
                    <View className="flex-1">
                      <Text className="font-sans-bold text-navy" numberOfLines={2}>
                        {product.name}
                      </Text>
                      <Text className="text-xs text-navy/50">
                        {formatBRL(product.unitPrice)} a unidade
                      </Text>
                    </View>
                  </Pressable>

                  {quantidade > 0 ? (
                    <QuantityStepper
                      value={quantidade}
                      min={0}
                      max={EXTRA_MAXIMO}
                      onChange={(value) => ajustarItemDeFora(product.id, value)}
                    />
                  ) : (
                    <Pressable
                      onPress={() => ajustarItemDeFora(product.id, 1)}
                      accessibilityLabel={`Adicionar ${product.name}`}
                      className="h-11 w-11 items-center justify-center rounded-2xl border border-coral"
                    >
                      <Ionicons name="add" size={20} color={colors.coral} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* O link fica depois da lista, e não ao lado do título, por duas
              razões. A ordem certa é olhar o que tem e só então procurar o
              que faltou. E, ao lado do título, "Buscar item" encostava na
              linha "Itens adicionais para alugar junto com o kit." — de
              longe as duas viravam uma frase só. */}
          <Pressable
            onPress={() => router.push("/catalogo/itens")}
            hitSlop={8}
            className="items-center py-1"
          >
            <Text className="text-sm font-sans-bold text-coral">
              Não achou? Buscar no catálogo
            </Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
