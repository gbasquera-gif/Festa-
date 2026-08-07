import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";

/**
 * Fluxo de contratação. Exige conta: daqui em diante tudo é sobre uma festa
 * de alguém — o catálogo, esse sim, é aberto.
 *
 * Sem o botão flutuante de WhatsApp: todas as telas daqui terminam com um
 * botão principal, e o flutuante ficava por cima dele. A ajuda aparece em
 * linha, no fim do conteúdo.
 */
export default function EventoLayout() {
  const { user, loading } = useAuth();

  if (!loading && !user) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
