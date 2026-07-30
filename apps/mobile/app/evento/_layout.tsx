import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function EventoLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
