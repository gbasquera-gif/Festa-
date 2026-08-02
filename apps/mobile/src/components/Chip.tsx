import { Pressable, Text } from "react-native";

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-4 py-2.5 ${
        selected ? "border-coral bg-coral" : "border-sand bg-white"
      }`}
    >
      <Text className={`font-semibold ${selected ? "text-white" : "text-navy"}`}>{label}</Text>
    </Pressable>
  );
}
