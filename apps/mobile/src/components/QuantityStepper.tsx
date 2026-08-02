import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <View className="h-14 flex-row items-center rounded-2xl border border-sand bg-white px-1">
      <Pressable
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        accessibilityLabel="Diminuir quantidade"
        className="h-12 w-9 items-center justify-center"
      >
        <Ionicons name="remove" size={20} color={value <= min ? colors.muted : colors.navy} />
      </Pressable>
      <Text className="min-w-8 text-center text-base font-sans-bold text-navy">{value}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        accessibilityLabel="Aumentar quantidade"
        className="h-12 w-9 items-center justify-center"
      >
        <Ionicons name="add" size={20} color={value >= max ? colors.muted : colors.navy} />
      </Pressable>
    </View>
  );
}
