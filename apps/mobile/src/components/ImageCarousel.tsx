import { useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Dots } from "./Dots";
import { colors } from "@/theme";

const SLIDE_WIDTH = Dimensions.get("window").width - 40; // p-5 da Screen dos dois lados

/**
 * Palco de imagem das telas de detalhe: fundo linen fixo com as fotos por
 * cima, para que itens fotografados em fundo claro não "sumam" na tela.
 */
export function ImageCarousel({ images, height = 260 }: { images: string[]; height?: number }) {
  const [index, setIndex] = useState(0);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    if (next !== index) setIndex(next);
  }

  if (images.length === 0) {
    return (
      <View style={{ height }} className="w-full items-center justify-center rounded-3xl bg-linen">
        <Ionicons name="image-outline" size={32} color={colors.gold} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-3xl bg-linen">
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          style={{ width: SLIDE_WIDTH }}
        >
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={{ width: SLIDE_WIDTH, height }} resizeMode="cover" />
          ))}
        </ScrollView>
      </View>

      <Dots count={images.length} index={index} />
    </View>
  );
}
