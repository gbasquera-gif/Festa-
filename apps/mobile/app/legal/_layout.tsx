import { Stack } from "expo-router";

// Sem guarda de autenticação: os documentos precisam ser legíveis antes de a
// pessoa criar conta — é no cadastro que ela declara ter lido.
export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
