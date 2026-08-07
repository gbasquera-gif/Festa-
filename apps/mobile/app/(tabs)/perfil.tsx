import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { useFavoritos } from "@/lib/favoritos";
import { useOrcamento } from "@/lib/orcamento";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";
import { goToLogin, goToSignup } from "@/lib/login-gate";
import { colors } from "@/theme";

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

  function handleWhatsApp() {
    track("CLIQUE_WHATSAPP");
    openWhatsApp("Oi! Preciso de ajuda para montar minha festa.");
  }

  async function handleLogout() {
    // O orçamento fica salvo no aparelho: sair da conta não pode deixar itens
    // de um usuário visíveis para o próximo que entrar.
    clear();
    await logout();
    router.replace("/(auth)/login");
  }

  // Visitante vê um convite, não um perfil vazio com o nome em branco.
  if (!user) {
    return (
      <Screen contentClassName="gap-5">
        <Text className="font-sans-extrabold text-2xl text-navy">Perfil</Text>

        <View className="items-center gap-3 rounded-2xl border border-sand bg-white px-6 py-10">
          <Ionicons name="person-circle-outline" size={44} color={colors.gold} />
          <Text className="text-center font-sans-bold text-lg text-navy">
            Crie sua conta para reservar
          </Text>
          <Text className="text-center text-navy/70">
            Você pode ver todo o catálogo e montar seu orçamento sem conta. Ela só é necessária na
            hora de reservar a data e pagar o sinal.
          </Text>
          <Button className="mt-1 w-full" onPress={() => goToSignup("/(tabs)/perfil")}>
            Criar conta
          </Button>
          <Pressable onPress={() => goToLogin("/(tabs)/perfil")} hitSlop={8}>
            <Text className="font-sans-bold text-coral">Já tenho conta</Text>
          </Pressable>
        </View>

        <View className="overflow-hidden rounded-2xl border border-sand bg-white">
          <Row icon="logo-whatsapp" label="Falar com a Festaê" onPress={handleWhatsApp} />
          <Row
            icon="shield-checkmark-outline"
            label="Política de Privacidade"
            onPress={() => router.push("/legal/privacidade")}
          />
          <Row
            icon="document-text-outline"
            label="Termos de Uso"
            last
            onPress={() => router.push("/legal/termos")}
          />
        </View>
      </Screen>
    );
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
        <Row icon="logo-whatsapp" label="Falar com a Festaê" onPress={handleWhatsApp} />
        {/* Documentos, exportação e exclusão ficam juntos em "Minha Conta":
            é onde a pessoa (e o revisor da loja) espera encontrá-los. */}
        <Row
          icon="person-circle-outline"
          label="Minha Conta"
          last
          onPress={() => router.push("/conta")}
        />
      </View>

      <Button variant="outline" onPress={handleLogout}>
        Sair
      </Button>
    </Screen>
  );
}
