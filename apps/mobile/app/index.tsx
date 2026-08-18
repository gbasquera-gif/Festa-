import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { getItem } from "@/lib/storage";
import { ONBOARDING_KEY } from "@/lib/onboarding";
import { colors } from "@/theme";

export default function Index() {
  const { user, loading } = useAuth();
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    getItem(ONBOARDING_KEY)
      .then((value) => setSeenOnboarding(value === "1"))
      .catch(() => setSeenOnboarding(false));
  }, []);

  if (loading || seenOnboarding === null) {
    return (
      <View className="flex-1 items-center justify-center bg-navy">
        <ActivityIndicator color={colors.coral} size="large" />
      </View>
    );
  }

  // Quem já conhece o app cai direto na vitrine, com ou sem conta. A tela de
  // boas-vindas aparece só na primeira abertura.
  if (user || seenOnboarding) return <Redirect href="/(tabs)" />;
  return <Redirect href="/boas-vindas" />;
}
