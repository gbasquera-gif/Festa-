import { Stack } from "expo-router";

// Aberto a visitantes: é a vitrine da Festaê. Sem o botão flutuante de
// WhatsApp aqui, porque as telas de detalhe têm rodapé fixo com "Adicionar
// ao orçamento" e os dois se sobreporiam.
export default function CatalogoLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
