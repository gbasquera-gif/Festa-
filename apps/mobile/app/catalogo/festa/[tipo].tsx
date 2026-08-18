import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { Chip } from "@/components/Chip";
import { SolicitarTema } from "@/components/SolicitarTema";
import { ImageCover } from "@/components/ImageCover";
import { CatalogGrid, type CatalogEntry } from "@/components/CatalogGrid";
import { FestaPersonalizadaCard } from "@/components/FestaCard";
import { FloatingCta } from "@/components/FloatingCta";
import { SectionHeader } from "@/components/SectionHeader";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";
import { FESTA_BY_SLUG, MENSAGEM_FESTA_PERSONALIZADA } from "@/lib/festas";
import { useOrcamento } from "@/lib/orcamento";
import type { Kit, Product, Theme } from "@/lib/types";

/**
 * Vitrine de uma ocasião: primeiro o tema, depois o kit.
 *
 * O tema aparece como faixa de escolha no topo em vez de tela própria. A
 * jornada continua sendo ocasião → tema → kit, mas sem um toque a mais só
 * para trocar de tela: quem já sabe que quer "Safari" filtra ali mesmo, e
 * quem não faz questão de tema segue direto para os kits logo abaixo.
 */
export default function FestaPorTipo() {
  const { tipo } = useLocalSearchParams<{ tipo: string }>();
  const festa = FESTA_BY_SLUG[tipo ?? ""];
  const [themeId, setThemeId] = useState<string | null>(null);
  const { setEventType } = useOrcamento();

  // A ocasião escolhida aqui é o primeiro passo do pedido: guardá-la agora é
  // o que faz o formulário de criar a festa já vir preenchido lá na frente.
  useEffect(() => {
    if (festa) setEventType(festa.key);
  }, [festa, setEventType]);

  const { data: themes } = useQuery({
    queryKey: ["themes", festa?.key],
    queryFn: () => api<Theme[]>(`/themes?eventType=${festa!.key}`),
    enabled: Boolean(festa),
  });

  const { data: kits, isLoading } = useQuery({
    queryKey: ["kits", festa?.key, themeId],
    queryFn: () =>
      api<Kit[]>(
        `/kits?eventType=${festa!.key}${themeId ? `&themeId=${encodeURIComponent(themeId)}` : ""}`,
      ),
    enabled: Boolean(festa),
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });

  if (!festa) {
    return (
      <Screen header={<DetailHeader title="Festas" />}>
        <Text className="text-navy/60">Não encontramos esse tipo de festa.</Text>
      </Screen>
    );
  }

  const temaEscolhido = themes?.find((theme) => theme.id === themeId) ?? null;

  const kitEntries: CatalogEntry[] =
    kits?.map((kit) => ({
      id: kit.id,
      title: kit.name,
      imageUrl: kit.coverImageUrl,
      price: kit.basePrice,
      priceLabel: "a partir de",
      onPress: () => router.push(`/catalogo/kit/${kit.id}`),
    })) ?? [];

  function escolherTema(theme: Theme | null) {
    setThemeId(theme?.id ?? null);
    if (theme) track("ESCOLHA_TEMA", { themeId: theme.id, eventType: festa.key });
  }

  function abrirPersonalizada() {
    track("CLIQUE_WHATSAPP", { origem: "festa-personalizada", eventType: festa.key });
    openWhatsApp(MENSAGEM_FESTA_PERSONALIZADA);
  }

  return (
    <Screen
      header={<DetailHeader title={festa.label} showShare={false} />}
      contentClassName="gap-5"
      floating={<FloatingCta />}
    >
      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">{festa.label}</Text>
        <Text className="text-navy/70">{festa.description}</Text>
      </View>

      {themes && themes.length > 0 && (
        <View className="gap-3">
          <Text className="font-sans-bold text-navy">Escolha um tema</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {themes.map((theme) => (
              <Pressable
                key={theme.id}
                onPress={() => escolherTema(themeId === theme.id ? null : theme)}
                style={{ width: 132 }}
                className={
                  themeId === theme.id
                    ? "overflow-hidden rounded-2xl border-2 border-coral bg-white"
                    : "overflow-hidden rounded-2xl border border-sand bg-white"
                }
                accessibilityRole="button"
                accessibilityLabel={`Tema ${theme.name}`}
              >
                <ImageCover uri={theme.coverImageUrl} className="h-20" showPlaceholderLabel={false} />
                <Text
                  className="px-2.5 py-2 text-center text-xs font-sans-bold text-navy"
                  numberOfLines={2}
                >
                  {theme.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {temaEscolhido && (
            <View className="flex-row">
              <Chip label={`Tema: ${temaEscolhido.name} ✕`} selected onPress={() => escolherTema(null)} />
            </View>
          )}

          {/* Logo abaixo dos temas, que é onde a pessoa descobre que o que ela
              queria não está ali. Mais para baixo na página ela já teria
              desistido. */}
          <SolicitarTema ocasiao={festa.label} compacto />
        </View>
      )}

      <View className="gap-3">
        <Text className="font-sans-bold text-navy">
          {temaEscolhido ? `Kits de ${temaEscolhido.name}` : `Kits prontos para ${festa.label.toLowerCase()}`}
        </Text>
        {isLoading ? (
          <Text className="text-navy/60">Carregando...</Text>
        ) : (
          <CatalogGrid
            entries={kitEntries}
            emptyMessage={
              temaEscolhido
                ? "Ainda não há kit publicado neste tema. Escolha outro tema ou fale com a gente."
                : "Ainda não há kit publicado para esta ocasião. Fale com a gente pelo WhatsApp."
            }
          />
        )}
      </View>

      <FestaPersonalizadaCard onPress={abrirPersonalizada} />

      {products && products.length > 0 && (
        <View className="gap-3">
          <SectionHeader
            title="Itens adicionais para alugar"
            actionLabel="Ver todos"
            onAction={() => router.push("/catalogo/itens")}
          />
          <Text className="-mt-1 text-sm text-navy/60">
            Peças avulsas para completar o kit — ou para montar a festa do seu jeito.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {products.slice(0, 8).map((product) => (
              <Pressable
                key={product.id}
                onPress={() => router.push(`/catalogo/produto/${product.id}`)}
                style={{ width: 132 }}
                className="overflow-hidden rounded-2xl border border-sand bg-white"
              >
                <ImageCover uri={product.imageUrl} className="h-20" showPlaceholderLabel={false} />
                <Text className="px-2.5 py-2 text-xs font-sans-bold text-navy" numberOfLines={2}>
                  {product.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}
