import { useState } from "react";
import { Dimensions, Image, ScrollView, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { ImageCover } from "./ImageCover";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SLIDE_WIDTH = SCREEN_WIDTH - 40; // matches Screen's horizontal padding (p-5 = 20 each side)

export function ImageCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return <ImageCover uri={undefined} rounded="all" className="h-52" />;
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    if (next !== index) setIndex(next);
  }

  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={{ width: SLIDE_WIDTH }}
        className="overflow-hidden rounded-2xl"
      >
        {images.map((uri, i) => (
          <Image key={i} source={{ uri }} style={{ width: SLIDE_WIDTH, height: 208 }} resizeMode="cover" />
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View className="flex-row justify-center gap-1.5">
          {images.map((_, i) => (
            <View key={i} className={`h-1.5 rounded-full ${i === index ? "w-4 bg-coral" : "w-1.5 bg-navy/20"}`} />
          ))}
        </View>
      )}
    </View>
  );
}
