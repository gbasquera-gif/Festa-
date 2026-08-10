import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import Head from "expo-router/head";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { AuthProvider } from "@/lib/auth";
import { OrcamentoProvider } from "@/lib/orcamento";
import { FavoritesProvider } from "@/lib/favoritos";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const TITULO = "Festaê — Locação de artigos para festas em Chapecó";

/**
 * Título da aba do navegador.
 *
 * Fica fora da guarda das fontes de propósito. O `+html.tsx` não resolve
 * isto sozinho: a exportação web já grava um `<title>` vazio no topo do
 * `<head>`, e o navegador fica com o primeiro que encontra. Quem preenche
 * aquela tag é este componente — e enquanto ele morava dentro da árvore,
 * o `return null` de "fontes ainda carregando" o levava junto, deixando a
 * aba sem nome tanto no HTML servido quanto depois de o app abrir.
 */
function TituloDaPagina() {
  return (
    <Head>
      <title>{TITULO}</title>
    </Head>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return <TituloDaPagina />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TituloDaPagina />
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OrcamentoProvider>
              <FavoritesProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="boas-vindas" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="catalogo" />
                  <Stack.Screen name="conta" />
                  <Stack.Screen name="legal" />
                  <Stack.Screen name="evento" />
                </Stack>
              </FavoritesProvider>
            </OrcamentoProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
