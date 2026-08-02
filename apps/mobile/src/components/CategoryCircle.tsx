import { Pressable, Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors } from "@/theme";
import type { CategoryMeta } from "@/lib/catalog";

export function CategoryCircle({
  category,
  onPress,
  width = 72,
}: {
  category: CategoryMeta;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable onPress={onPress} style={{ width }} className="items-center gap-2" accessibilityRole="button">
      <View className="h-16 w-16 items-center justify-center rounded-full border border-sand bg-white">
        <Icon name={category.icon} set={category.iconSet} size={26} color={colors.navy} />
      </View>
      <Text className="text-center text-xs font-sans-semibold leading-4 text-navy" numberOfLines={2}>
        {category.shortLabel}
      </Text>
    </Pressable>
  );
}
