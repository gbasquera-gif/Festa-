import { Pressable, Text, View } from "react-native";

export function SectionHeader({
  title,
  actionLabel = "Ver todas",
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="flex-row items-end justify-between">
      <Text className="font-sans-extrabold text-lg text-navy">{title}</Text>
      {onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text className="font-sans-bold text-sm text-coral">{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}
