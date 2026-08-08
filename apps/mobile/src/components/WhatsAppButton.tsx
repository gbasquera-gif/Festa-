import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { track } from "@/lib/analytics";
import { openWhatsApp } from "@/lib/contato";

const MENSAGEM_PADRAO = "Oi! Preciso de ajuda para montar minha festa.";

function abrir(mensagem: string) {
  track("CLIQUE_WHATSAPP");
  openWhatsApp(mensagem);
}

/**
 * Ajuda humana dentro do fluxo de contratação.
 *
 * Deliberadamente em linha, e não flutuando: o botão flutuante cobria a
 * opção de montagem e o cartão de pagamento — chegou a engolir um toque
 * durante os testes —, e nas telas de decisão ele ainda competia com o
 * botão principal. Aqui ele aparece depois da decisão, que é quando a
 * dúvida realmente aparece.
 */
export function HelpLink({ message = MENSAGEM_PADRAO }: { message?: string }) {
  return (
    <Pressable
      onPress={() => abrir(message)}
      className="flex-row items-center justify-center gap-2 py-2"
      accessibilityRole="button"
    >
      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
      <Text className="text-sm font-sans-bold text-navy/70">
        Ficou com dúvida? Fale com a Festaê
      </Text>
    </Pressable>
  );
}

/**
 * Botão flutuante de WhatsApp. Só deve ser usado em telas sem barra de ação
 * fixa e sem botão principal no rodapé — senão ele se sobrepõe ao conteúdo.
 */
export function WhatsAppButton() {
  return (
    <View className="absolute bottom-6 right-5">
      <Pressable
        onPress={() => abrir(MENSAGEM_PADRAO)}
        className="flex-row items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 shadow-lg active:opacity-90"
      >
        <Ionicons name="logo-whatsapp" size={22} color="#fff" />
        <Text className="font-sans-bold text-white">Precisa de ajuda?</Text>
      </Pressable>
    </View>
  );
}
