import { Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { track } from "@/lib/analytics";

const WHATSAPP_NUMBER = "5549999487777";

export function WhatsAppButton() {
  function handlePress() {
    track("CLIQUE_WHATSAPP");
    Linking.openURL(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Oi! Preciso de ajuda para montar minha festa.")}`,
    ).catch(() => {});
  }

  return (
    <View className="absolute bottom-6 right-5">
      <Pressable
        onPress={handlePress}
        className="flex-row items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 shadow-lg active:opacity-90"
      >
        <Ionicons name="logo-whatsapp" size={22} color="#fff" />
        <Text className="font-bold text-white">Precisa de ajuda?</Text>
      </Pressable>
    </View>
  );
}
