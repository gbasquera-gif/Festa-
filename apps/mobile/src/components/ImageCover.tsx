import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "@/lib/cn";

interface ImageCoverProps {
  uri?: string | null;
  className?: string;
  rounded?: "top" | "all";
}

export function ImageCover({ uri, className, rounded = "top" }: ImageCoverProps) {
  const radiusClass = rounded === "top" ? "rounded-t-2xl" : "rounded-2xl";

  if (!uri) {
    return (
      <View className={cn("h-40 w-full items-center justify-center bg-navy/5", radiusClass, className)}>
        <Ionicons name="image-outline" size={28} color="#0F2A4F55" />
        <Text className="mt-1 text-xs font-semibold text-navy/40">Foto em breve</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      className={cn("h-40 w-full bg-navy/5", radiusClass, className)}
      resizeMode="cover"
    />
  );
}
