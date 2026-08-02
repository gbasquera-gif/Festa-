import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

// Sem o botão flutuante de WhatsApp aqui: as telas de detalhe têm rodapé fixo
// com "Adicionar ao orçamento", e os dois se sobreporiam.
export default function CatalogoLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
