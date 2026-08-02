import { Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme";

/**
 * Marca da Festaê: a caixa aberta (o "pegue") sobre o logotipo, com o "ê!"
 * em coral e a assinatura PEGUE · MONTE · COMEMORE.
 */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View className="items-center">
      {!compact && (
        <View className="mb-2">
          <MaterialCommunityIcons name="package-variant" size={56} color={colors.navy} />
        </View>
      )}

      <Text
        className={`font-sans-extrabold tracking-tight text-navy ${compact ? "text-4xl" : "text-6xl"}`}
      >
        FESTA<Text className="text-coral">ê!</Text>
      </Text>

      <View className="mt-2 flex-row items-center gap-2">
        <Text className="text-[11px] font-sans-bold tracking-[3px] text-navy">PEGUE</Text>
        <Text className="text-[11px] font-sans-bold text-coral">•</Text>
        <Text className="text-[11px] font-sans-bold tracking-[3px] text-coral">MONTE</Text>
        <Text className="text-[11px] font-sans-bold text-gold">•</Text>
        <Text className="text-[11px] font-sans-bold tracking-[3px] text-navy">COMEMORE</Text>
      </View>
    </View>
  );
}
