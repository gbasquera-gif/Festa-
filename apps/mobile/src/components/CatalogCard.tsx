import { Pressable, Text, View } from "react-native";
import { ImageCover } from "./ImageCover";
import { formatBRL } from "@/lib/catalog";

/**
 * Card do catálogo usado tanto na trilha horizontal da home quanto nas
 * listagens em grade — `width` fica a cargo de quem posiciona.
 */
export function CatalogCard({
  title,
  imageUrl,
  price,
  priceLabel,
  width,
  onPress,
}: {
  title: string;
  imageUrl?: string | null;
  price: string | number;
  /** Texto antes do preço, ex: "a partir de". */
  priceLabel?: string;
  width?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={width ? { width } : undefined}
      className="overflow-hidden rounded-2xl border border-sand bg-white"
    >
      <ImageCover uri={imageUrl} className="h-32" />
      <View className="gap-0.5 p-3">
        <Text className="font-sans-bold text-sm text-navy" numberOfLines={2}>
          {title}
        </Text>
        <Text className="text-xs text-navy/60">
          {priceLabel ? `${priceLabel} ` : ""}
          <Text className="font-sans-bold text-coral">{formatBRL(price)}</Text>
        </Text>
      </View>
    </Pressable>
  );
}
