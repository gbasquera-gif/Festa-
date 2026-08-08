import { Text, View } from "react-native";

const MAX_VISIBLE = 4;

/**
 * Amostras de cor disponíveis. Vêm da paleta do tema associado ao kit — quando
 * o item não tem tema, o bloco inteiro é omitido pela tela que o usa.
 */
export function ColorSwatches({ colors: palette }: { colors: string[] }) {
  const visible = palette.slice(0, MAX_VISIBLE);
  const overflow = palette.length - visible.length;

  return (
    <View className="gap-2.5">
      <Text className="font-sans-bold text-navy">Cores disponíveis</Text>
      <View className="flex-row items-center gap-2.5">
        {visible.map((color, index) => (
          <View
            key={`${color}-${index}`}
            style={{ backgroundColor: color }}
            className="h-9 w-9 rounded-full border border-sand"
          />
        ))}
        {overflow > 0 && (
          <View className="h-9 w-9 items-center justify-center rounded-full border border-sand bg-white">
            <Text className="text-xs font-sans-bold text-navy">+{overflow}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
