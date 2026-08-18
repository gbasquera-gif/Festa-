import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { SearchField } from "@/components/SearchField";
import { FestaCircle } from "@/components/FestaCard";
import { SectionHeader } from "@/components/SectionHeader";
import { SolicitarTema } from "@/components/SolicitarTema";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { normalize } from "@/lib/catalog";
import { FESTAS, type FestaMeta } from "@/lib/festas";
import type { Kit, Product, Theme } from "@/lib/types";
import { colors } from "@/theme";

export default function Busca() {
  const [term, setTerm] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const { data: themes } = useQuery({ queryKey: ["themes"], queryFn: () => api<Theme[]>("/themes") });

  const query = normalize(term);
  const searching = query.length >= 2;

  /**
   * Tipos de festa entram na busca junto com kits e itens.
   *
   * Quem digita "batizado" não está procurando um produto chamado batizado —
   * está procurando por onde começar. Sem esta faixa, a busca respondia
   * "nada encontrado" para o termo que melhor descreve o que a pessoa quer.
   */
  const matchedFestas: FestaMeta[] = useMemo(() => {
    if (!searching) return [];
    return FESTAS.filter((festa) =>
      normalize(`${festa.label} ${festa.description}`).includes(query),
    );
  }, [query, searching]);

  const matchedThemes = useMemo(() => {
    if (!searching) return [];
    return (themes ?? []).filter((theme) =>
      normalize(`${theme.name} ${theme.description ?? ""}`).includes(query),
    );
  }, [themes, query, searching]);

  const matchedKits = useMemo(() => {
    if (!searching) return [];
    return (kits ?? []).filter((kit) =>
      normalize(`${kit.name} ${kit.description ?? ""} ${kit.theme?.name ?? ""}`).includes(query),
    );
  }, [kits, query, searching]);

  const matchedProducts = useMemo(() => {
    if (!searching) return [];
    return (products ?? []).filter((product) =>
      normalize(`${product.name} ${product.description ?? ""}`).includes(query),
    );
  }, [products, query, searching]);

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

  const nothingFound =
    searching &&
    matchedFestas.length === 0 &&
    matchedThemes.length === 0 &&
    kitEntries.length === 0 &&
    productEntries.length === 0;

  /**
   * Um tema não tem tela própria: ele vive dentro de uma ocasião. Abrimos a
   * primeira ocasião sugerida para o tema — e, quando não há nenhuma marcada,
   * caímos em aniversário, que é a ocasião mais comum.
   */
  function abrirTema(theme: Theme) {
    const tipo = theme.suggestedEventTypes[0] ?? "ANIVERSARIO";
    const festa = FESTAS.find((item) => item.key === tipo) ?? FESTAS[0];
    router.push(`/catalogo/festa/${festa.slug}`);
  }

  return (
    <Screen header={<DetailHeader title="Buscar" showShare={false} />} contentClassName="gap-5">
      <SearchField
        value={term}
        onChangeText={setTerm}
        autoFocus
        placeholder="Busque por festa, tema, kit ou item..."
      />

      {!searching && (
        <View className="gap-4">
          <SectionHeader title="Comece pela ocasião" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {FESTAS.map((festa) => (
              <FestaCircle
                key={festa.key}
                festa={festa}
                onPress={() => router.push(`/catalogo/festa/${festa.slug}`)}
              />
            ))}
          </ScrollView>
          <Text className="text-sm text-navy/60">
            Ou digite pelo menos 2 letras para buscar por tema, kit ou item.
          </Text>
        </View>
      )}

      {nothingFound && (
        <View className="gap-3">
          <View className="rounded-2xl border border-sand bg-white px-6 py-10">
            <Text className="text-center text-navy/70">
              Nada encontrado para “{term.trim()}”. Tente outro termo ou comece escolhendo a
              ocasião.
            </Text>
          </View>

          {/* Busca sem resultado é o melhor momento para perguntar: a pessoa
              acabou de dizer, com as próprias palavras, o tema que ela queria
              e não existe no acervo. Levar isso para o WhatsApp com o termo
              junto transforma uma venda perdida em pedido de compra. */}
          <SolicitarTema procurado={term.trim()} />
        </View>
      )}

      {matchedFestas.length > 0 && (
        <View className="gap-3">
          <SectionHeader title="Tipos de festa" />
          {matchedFestas.map((festa) => (
            <Pressable
              key={festa.key}
              onPress={() => router.push(`/catalogo/festa/${festa.slug}`)}
              className="flex-row items-center gap-3 rounded-2xl border border-sand bg-white p-3"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-linen">
                <Icon name={festa.icon} set={festa.iconSet} size={22} color={colors.navy} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-navy">{festa.label}</Text>
                <Text className="text-xs text-navy/60" numberOfLines={1}>
                  {festa.description}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      )}

      {matchedThemes.length > 0 && (
        <View className="gap-3">
          <SectionHeader title={`Temas (${matchedThemes.length})`} />
          {matchedThemes.map((theme) => (
            <Pressable
              key={theme.id}
              onPress={() => abrirTema(theme)}
              className="flex-row items-center gap-3 rounded-2xl border border-sand bg-white p-3"
            >
              <View className="flex-row">
                {theme.colorPalette.slice(0, 3).map((color, index) => (
                  <View
                    key={index}
                    style={{ backgroundColor: color, marginLeft: index > 0 ? -8 : 0 }}
                    className="h-8 w-8 rounded-full border-2 border-white"
                  />
                ))}
              </View>
              <Text className="flex-1 font-sans-bold text-navy" numberOfLines={1}>
                {theme.name}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
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
          <SectionHeader title={`Itens adicionais (${productEntries.length})`} />
          <CatalogGrid entries={productEntries} emptyMessage="" />
        </View>
      )}
    </Screen>
  );
}
