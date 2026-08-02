import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCircle } from "@/components/CategoryCircle";
import { CatalogCard } from "@/components/CatalogCard";
import { PromoBanner, type Promo } from "@/components/PromoBanner";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/catalog";
import { EVENT_TYPE_LABEL, type EventRecord, type Kit, type Product } from "@/lib/types";
import { colors } from "@/theme";

const PROMOS: Promo[] = [
  {
    titleLines: ["Sua festa,", "com tudo que"],
    highlight: "você precisa!",
    subtitle: "Encontre, reserve e monte de forma rápida e segura.",
    cta: "Explorar agora",
    icon: "package-variant",
    onPress: () => router.push("/(tabs)/categorias"),
  },
  {
    titleLines: ["Kits prontos", "para quem quer"],
    highlight: "resolver rápido.",
    subtitle: "Decoração, mesa e louças combinando, num pacote só.",
    cta: "Ver os kits",
    icon: "party-popper",
    onPress: () => router.push("/catalogo/kits"),
  },
  {
    titleLines: ["Data reservada,", "montagem e"],
    highlight: "retirada inclusas.",
    subtitle: "A gente entrega, monta e recolhe. Você só comemora.",
    cta: "Reservar data",
    icon: "calendar-heart",
    onPress: () => router.push("/evento/criar"),
  },
];

export default function Home() {
  const { user } = useAuth();

  const { data: events } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api<EventRecord[]>("/events"),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });

  const firstName = user?.name.split(" ")[0];
  const ongoing = events?.find((event) => event.order.status === "CART");
  const hasUpdates = events?.some((event) => event.order.status === "REQUESTED") ?? false;

  return (
    <Screen contentClassName="gap-6">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="font-sans-extrabold text-2xl text-navy">Olá, {firstName ?? "tudo bem"}! 👋</Text>
          <Text className="text-navy/70">O que vamos preparar hoje?</Text>
        </View>

        <Pressable
          onPress={() => router.push("/(tabs)/pedidos")}
          hitSlop={8}
          accessibilityLabel="Ver atualizações dos pedidos"
          className="pt-1"
        >
          <Ionicons name="notifications-outline" size={24} color={colors.navy} />
          {hasUpdates && (
            <View className="absolute -right-0.5 top-0 h-2.5 w-2.5 rounded-full border border-white bg-coral" />
          )}
        </Pressable>
      </View>

      <SearchField onPress={() => router.push("/catalogo/busca")} />

      <PromoBanner promos={PROMOS} />

      {ongoing && (
        <Card
          onPress={() =>
            router.push(
              ongoing.order.kitId ? `/evento/${ongoing.id}/resumo` : `/evento/${ongoing.id}/kit`,
            )
          }
        >
          <Badge label="Continuar de onde parou" variant="coral" />
          <Text className="mt-2 text-lg font-sans-bold text-navy">{EVENT_TYPE_LABEL[ongoing.type]}</Text>
          <Text className="text-navy/70">
            {new Date(ongoing.date).toLocaleDateString("pt-BR")} · {ongoing.guestCount} convidados
          </Text>
        </Card>
      )}

      <View className="gap-4">
        <SectionHeader title="Categorias" onAction={() => router.push("/(tabs)/categorias")} />
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
      </View>

      <View className="gap-4">
        <SectionHeader title="Kits prontos para sua festa" onAction={() => router.push("/catalogo/kits")} />
        {kits && kits.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {kits.map((kit) => (
              <CatalogCard
                key={kit.id}
                title={kit.name}
                imageUrl={kit.coverImageUrl}
                price={kit.basePrice}
                priceLabel="a partir de"
                width={150}
                onPress={() => router.push(`/catalogo/kit/${kit.id}`)}
              />
            ))}
          </ScrollView>
        ) : (
          <Text className="text-navy/60">Nenhum kit publicado ainda.</Text>
        )}
      </View>

      {products && products.length > 0 && (
        <View className="gap-4">
          <SectionHeader title="Itens para alugar" onAction={() => router.push("/(tabs)/categorias")} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-5"
            contentContainerClassName="gap-3 px-5"
          >
            {products.slice(0, 10).map((product) => (
              <CatalogCard
                key={product.id}
                title={product.name}
                imageUrl={product.imageUrl}
                price={product.unitPrice}
                width={150}
                onPress={() => router.push(`/catalogo/produto/${product.id}`)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}
