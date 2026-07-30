import { View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { WhatsAppButton } from "@/components/WhatsAppButton";

export default function EventoLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  return (
    <View className="flex-1">
      <Stack screenOptions={{ headerShown: false }} />
      <WhatsAppButton />
    </View>
  );
}
