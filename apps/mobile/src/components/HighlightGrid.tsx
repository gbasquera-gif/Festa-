import { Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors } from "@/theme";
import type { Highlight } from "@/lib/catalog";

/** Faixa de diferenciais do item, dividida em colunas por linhas verticais. */
export function HighlightGrid({ highlights }: { highlights: Highlight[] }) {
  return (
    <View className="flex-row overflow-hidden rounded-2xl border border-sand bg-white">
      {highlights.map((highlight, index) => (
        <View
          key={highlight.label}
          className={`flex-1 items-center gap-1.5 px-1 py-3 ${index > 0 ? "border-l border-sand" : ""}`}
        >
          <Icon name={highlight.icon} set={highlight.iconSet} size={22} color={colors.coral} />
          <Text className="text-center text-[10px] font-sans-semibold leading-3 text-navy/70">
            {highlight.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
