import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { FestaCircle, FestaPersonalizadaCard } from "@/components/FestaCard";
import { CatalogCard } from "@/components/CatalogCard";
import { FloatingCta } from "@/components/FloatingCta";
import { PromoBanner, type Promo } from "@/components/PromoBanner";
import { useAuth } from "@/lib/auth";
import { goToLogin } from "@/lib/login-gate";
import { api } from "@/lib/api";
import { formatConvidados } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";
import { FESTAS, MENSAGEM_FESTA_PERSONALIZADA } from "@/lib/festas";
import { EVENT_TYPE_LABEL, type EventRecord, type Kit, type Product } from "@/lib/types";
import { colors } from "@/theme";

/**
 * O destaque da home diz o que a Festaê faz e manda escolher a ocasião —
 * que é onde a jornada começa de verdade.
 */
const PROMO: Promo = {
  titleLines: ["Sua festa,", "com tudo que"],
  highlight: "você precisa!",
  subtitle: "Encontre, reserve e monte de forma rápida e segura.",
  cta: "Explorar agora",
  icon: "package-variant",
  onPress: () => router.push("/(tabs)/festas"),
};

export default function Home() {
  const { user } = useAuth();

  // Só consulta os eventos de quem tem conta: visitante não tem pedido, e
  // pedir /events sem token devolveria 401 e sujaria a home com erro.
  const { data: events } = useQuery({
    queryKey: ["my-events"],
    queryFn: () => api<EventRecord[]>("/events"),
    enabled: Boolean(user),
  });
  const { data: kits } = useQuery({ queryKey: ["kits"], queryFn: () => api<Kit[]>("/kits") });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
  });

  const firstName = user?.name.split(" ")[0];
  const ongoing = events?.find((event) => event.order.status === "CART");
  const hasUpdates = events?.some((event) => event.order.status === "REQUESTED") ?? false;

  function abrirPersonalizada() {
    track("CLIQUE_WHATSAPP", { origem: "festa-personalizada" });
    openWhatsApp(MENSAGEM_FESTA_PERSONALIZADA);
  }

  return (
    <Screen contentClassName="gap-6" floating={<FloatingCta />}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="font-sans-extrabold text-2xl text-navy">
            {firstName ? `Olá, ${firstName}! 👋` : "Bem-vindo à Festaê! 🎈"}
          </Text>
          <Text className="text-navy/70">
            {firstName ? "O que vamos preparar hoje?" : "Veja tudo que temos e monte sua festa."}
          </Text>
        </View>

        {user ? (
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
        ) : (
          <Pressable onPress={() => goToLogin()} hitSlop={8} className="pt-1">
            <Text className="font-sans-bold text-coral">Entrar</Text>
          </Pressable>
        )}
      </View>

      <SearchField onPress={() => router.push("/catalogo/busca")} />

      <PromoBanner promo={PROMO} />

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
            {new Date(ongoing.date).toLocaleDateString("pt-BR")} · {formatConvidados(ongoing.guestCount)}
          </Text>
        </Card>
      )}

      <View className="gap-4">
        <SectionHeader
          title="Que festa você vai fazer?"
          actionLabel="Ver todas"
          onAction={() => router.push("/(tabs)/festas")}
        />
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
        <FestaPersonalizadaCard onPress={abrirPersonalizada} />
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
          <SectionHeader
            title="Itens adicionais para alugar"
            onAction={() => router.push("/catalogo/itens")}
          />
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
