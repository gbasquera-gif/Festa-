import { Text, View } from "react-native";

const VARIANT_CLASS: Record<string, string> = {
  neutral: "bg-linen",
  coral: "bg-coral/15",
  success: "bg-green-100",
  danger: "bg-red-100",
};

const VARIANT_TEXT: Record<string, string> = {
  neutral: "text-navy",
  coral: "text-coral",
  success: "text-green-700",
  danger: "text-red-600",
};

export function Badge({ label, variant = "neutral" }: { label: string; variant?: keyof typeof VARIANT_CLASS }) {
  return (
    <View className={`self-start rounded-full px-3 py-1 ${VARIANT_CLASS[variant]}`}>
      <Text className={`text-xs font-bold ${VARIANT_TEXT[variant]}`}>{label}</Text>
    </View>
  );
}
