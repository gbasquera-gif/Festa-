import { Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";

export default function Perfil() {
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <Screen>
      <Text className="font-sans-extrabold text-2xl text-navy">Perfil</Text>

      <Card>
        <Text className="text-sm text-navy/60">Nome</Text>
        <Text className="mb-3 text-lg font-bold text-navy">{user?.name}</Text>
        <Text className="text-sm text-navy/60">E-mail</Text>
        <Text className="mb-3 text-lg font-bold text-navy">{user?.email}</Text>
        <Text className="text-sm text-navy/60">Perfil</Text>
        <Text className="text-lg font-bold text-navy">{user?.role}</Text>
      </Card>

      <View className="mt-2">
        <Button variant="outline" onPress={handleLogout}>
          Sair
        </Button>
      </View>
    </Screen>
  );
}
