import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Icon } from "./Icon";
import { colors } from "@/theme";
import type { FestaMeta } from "@/lib/festas";

/** Versão compacta, para a trilha horizontal da home. */
export function FestaCircle({
  festa,
  onPress,
  width = 84,
}: {
  festa: FestaMeta;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ width }}
      className="items-center gap-2"
      accessibilityRole="button"
      accessibilityLabel={`Festas de ${festa.label}`}
    >
      <View className="h-16 w-16 items-center justify-center rounded-full border border-sand bg-white">
        <Icon name={festa.icon} set={festa.iconSet} size={26} color={colors.navy} />
      </View>
      <Text
        className="text-center text-xs font-sans-semibold leading-4 text-navy"
        numberOfLines={2}
      >
        {festa.shortLabel}
      </Text>
    </Pressable>
  );
}

/** Versão grande, para a tela onde a ocasião é a decisão principal. */
export function FestaTile({ festa, onPress }: { festa: FestaMeta; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 basis-[47%] gap-2 rounded-2xl border border-sand bg-white p-4"
      accessibilityRole="button"
      accessibilityLabel={`Festas de ${festa.label}`}
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-linen">
        <Icon name={festa.icon} set={festa.iconSet} size={24} color={colors.navy} />
      </View>
      <Text className="font-sans-bold text-navy">{festa.label}</Text>
      <Text className="text-xs leading-4 text-navy/60" numberOfLines={3}>
        {festa.description}
      </Text>
    </Pressable>
  );
}

/**
 * Saída para quem não se reconhece em nenhuma das ocasiões.
 *
 * Vai para o WhatsApp, e não para um formulário: uma festa fora do catálogo
 * precisa de conversa para virar preço, e mandar essa pessoa montar um
 * orçamento automático produziria um número que a operação teria de desdizer.
 */
export function FestaPersonalizadaCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-dashed border-coral/50 bg-white p-4"
      accessibilityRole="button"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-coral/10">
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.coral} />
      </View>
      <View className="flex-1">
        <Text className="font-sans-bold text-navy">Festa personalizada</Text>
        <Text className="text-xs leading-4 text-navy/60">
          Fale com a gente e montamos juntos a sua festa.
        </Text>
      </View>
      <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
    </Pressable>
  );
}
