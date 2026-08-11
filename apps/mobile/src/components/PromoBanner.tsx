import { Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface Promo {
  /** Quebrado em linhas para controlar onde o destaque em coral começa. */
  titleLines: string[];
  highlight: string;
  subtitle: string;
  cta: string;
  icon: string;
  onPress: () => void;
}

/**
 * Faixa de destaque da home. Um banner só, sem carrossel.
 *
 * Eram três, deslizáveis, com bolinhas embaixo — e as bolinhas mentiam: o
 * `overflow-hidden` que arredondava as bordas ficava na própria área de
 * rolagem e desligava o arrasto, então o segundo e o terceiro nunca eram
 * alcançados. Dava para consertar a rolagem, mas os dois banners escondidos
 * mandavam para "Ver os kits" e "Reservar data" — que a home já oferece na
 * seção de kits e no botão flutuante. Carrossel de banner também é onde a
 * atenção acaba: quase ninguém desliza além do primeiro.
 */
export function PromoBanner({ promo }: { promo: Promo }) {
  return (
    <View className="flex-row items-center rounded-3xl bg-navy p-5">
      <View className="flex-1 pr-2">
        {promo.titleLines.map((line) => (
          <Text key={line} className="font-sans-extrabold text-xl leading-7 text-white">
            {line}
          </Text>
        ))}
        <Text className="font-sans-extrabold text-xl leading-7 text-coral">{promo.highlight}</Text>
        <Text className="mt-2 text-xs leading-4 text-white/70">{promo.subtitle}</Text>
        <Pressable
          onPress={promo.onPress}
          className="mt-4 self-start rounded-full bg-coral px-5 py-2.5 active:opacity-90"
        >
          <Text className="text-sm font-sans-bold text-white">{promo.cta}</Text>
        </Pressable>
      </View>

      <MaterialCommunityIcons name={promo.icon as never} size={92} color="#F2674C" />
    </View>
  );
}
