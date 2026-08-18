import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cn } from "@/lib/cn";
import { colors } from "@/theme";

interface ImageCoverProps {
  uri?: string | null;
  className?: string;
  rounded?: "top" | "all" | "none";
  /** Em miniaturas o texto "Foto em breve" não cabe — só o ícone é usado. */
  showPlaceholderLabel?: boolean;
}

const RADIUS_CLASS = {
  top: "rounded-t-2xl",
  all: "rounded-2xl",
  none: "",
} as const;

export function ImageCover({
  uri,
  className,
  rounded = "top",
  showPlaceholderLabel = true,
}: ImageCoverProps) {
  const radiusClass = RADIUS_CLASS[rounded];

  if (!uri) {
    return (
      <View className={cn("h-40 w-full items-center justify-center bg-linen", radiusClass, className)}>
        <Ionicons name="image-outline" size={showPlaceholderLabel ? 28 : 20} color={colors.gold} />
        {showPlaceholderLabel && (
          <Text className="mt-1 text-xs font-sans-semibold text-navy/40">Foto em breve</Text>
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      className={cn("h-40 w-full bg-linen", radiusClass, className)}
      resizeMode="cover"
    />
  );
}
