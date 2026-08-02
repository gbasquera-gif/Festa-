import { useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Dots } from "./Dots";

const SLIDE_WIDTH = Dimensions.get("window").width - 40; // p-5 da Screen dos dois lados

export interface Promo {
  /** Quebrado em linhas para controlar onde o destaque em coral começa. */
  titleLines: string[];
  highlight: string;
  subtitle: string;
  cta: string;
  icon: string;
  onPress: () => void;
}

export function PromoBanner({ promos }: { promos: Promo[] }) {
  const [index, setIndex] = useState(0);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    if (next !== index) setIndex(next);
  }

  return (
    <View className="gap-3">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ width: SLIDE_WIDTH }}
        className="overflow-hidden rounded-3xl"
      >
        {promos.map((promo) => (
          <View
            key={promo.titleLines.join(" ")}
            style={{ width: SLIDE_WIDTH }}
            className="flex-row items-center bg-navy p-5"
          >
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
        ))}
      </ScrollView>

      <Dots count={promos.length} index={index} />
    </View>
  );
}
