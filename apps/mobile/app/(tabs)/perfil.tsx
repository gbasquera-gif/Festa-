import { Linking, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { useFavoritos } from "@/lib/favoritos";
import { useOrcamento } from "@/lib/orcamento";
import { track } from "@/lib/analytics";
import { colors } from "@/theme";

const WHATSAPP_NUMBER = "5549999487777";

function Row({
  icon,
  label,
  hint,
  last,
  onPress,
}: {
  icon: string;
  label: string;
  hint?: string;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-4 ${last ? "" : "border-b border-sand"}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-linen">
        <Ionicons name={icon as never} size={19} color={colors.navy} />
      </View>
      <Text className="flex-1 font-sans-bold text-navy">{label}</Text>
      {hint && <Text className="text-sm text-navy/50">{hint}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function Perfil() {
  const { user, logout } = useAuth();
  const { products, kits } = useFavoritos();
  const { count, clear } = useOrcamento();

  const initials = (user?.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  function openWhatsApp() {
    track("CLIQUE_WHATSAPP");
    Linking.openURL(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Preciso de ajuda para montar minha festa.")}`,
    ).catch(() => {});
  }

  async function handleLogout() {
    // O orçamento fica salvo no aparelho: sair da conta não pode deixar itens
    // de um usuário visíveis para o próximo que entrar.
    clear();
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <Screen contentClassName="gap-5">
      <Text className="font-sans-extrabold text-2xl text-navy">Perfil</Text>

      <View className="flex-row items-center gap-4 rounded-2xl border border-sand bg-white p-4">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-navy">
          <Text className="font-sans-extrabold text-xl text-white">{initials || "?"}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-sans-extrabold text-lg text-navy" numberOfLines={1}>
            {user?.name}
          </Text>
          <Text className="text-navy/70" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      <View className="overflow-hidden rounded-2xl border border-sand bg-white">
        <Row
          icon="bag-handle-outline"
          label="Meus pedidos"
          hint={count > 0 ? `${count} no orçamento` : undefined}
          onPress={() => router.push("/(tabs)/pedidos")}
        />
        <Row
          icon="heart-outline"
          label="Favoritos"
          hint={String(products.length + kits.length)}
          onPress={() => router.push("/(tabs)/favoritos")}
        />
        <Row icon="logo-whatsapp" label="Falar com a Festaê" onPress={openWhatsApp} />
        <Row
          icon="trash-outline"
          label="Excluir minha conta"
          last
          onPress={() => router.push("/conta/excluir")}
        />
      </View>

      <Button variant="outline" onPress={handleLogout}>
        Sair
      </Button>
    </Screen>
  );
}
