import { Dimensions, Text, View } from "react-native";
import { CatalogCard } from "./CatalogCard";

const GAP = 12; // gap-3
const SCREEN_PADDING = 40; // p-5 da Screen dos dois lados
const COLUMN_WIDTH = (Dimensions.get("window").width - SCREEN_PADDING - GAP) / 2;

export interface CatalogEntry {
  id: string;
  title: string;
  imageUrl?: string | null;
  price: string | number;
  priceLabel?: string;
  onPress: () => void;
}

/**
 * Grade de duas colunas das listagens. A largura é calculada em vez de usar
 * `flex-1`, senão uma última linha ímpar esticaria o card sozinho.
 */
export function CatalogGrid({ entries, emptyMessage }: { entries: CatalogEntry[]; emptyMessage: string }) {
  if (entries.length === 0) {
    return (
      <View className="rounded-2xl border border-sand bg-white px-6 py-10">
        <Text className="text-center text-navy/70">{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-3">
      {entries.map((entry) => (
        <CatalogCard
          key={entry.id}
          title={entry.title}
          imageUrl={entry.imageUrl}
          price={entry.price}
          priceLabel={entry.priceLabel}
          width={COLUMN_WIDTH}
          onPress={entry.onPress}
        />
      ))}
    </View>
  );
}
