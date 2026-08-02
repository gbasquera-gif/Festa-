import { Pressable, Share, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

/** Cabeçalho das telas de detalhe: voltar · título · favoritar · compartilhar. */
export function DetailHeader({
  title,
  favorite,
  onToggleFavorite,
  shareMessage,
}: {
  title: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  shareMessage?: string;
}) {
  function handleShare() {
    Share.share({ message: shareMessage ?? title }).catch(() => {});
  }

  return (
    <View className="flex-row items-center gap-2 px-5 pb-2 pt-1">
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
        hitSlop={8}
        accessibilityLabel="Voltar"
        className="h-10 w-10 items-center justify-center"
      >
        <Ionicons name="arrow-back" size={22} color={colors.navy} />
      </Pressable>

      <Text className="flex-1 text-center font-sans-bold text-base text-navy" numberOfLines={1}>
        {title}
      </Text>

      {onToggleFavorite ? (
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={8}
          accessibilityLabel={favorite ? "Remover dos favoritos" : "Salvar nos favoritos"}
          className="h-10 w-10 items-center justify-center"
        >
          <Ionicons
            name={favorite ? "heart" : "heart-outline"}
            size={22}
            color={favorite ? colors.coral : colors.navy}
          />
        </Pressable>
      ) : (
        <View className="h-10 w-10" />
      )}

      <Pressable
        onPress={handleShare}
        hitSlop={8}
        accessibilityLabel="Compartilhar"
        className="h-10 w-10 items-center justify-center"
      >
        <Ionicons name="share-outline" size={22} color={colors.navy} />
      </Pressable>
    </View>
  );
}
