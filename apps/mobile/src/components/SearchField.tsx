import { Pressable, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

interface SearchFieldProps {
  value?: string;
  onChangeText?: (value: string) => void;
  onSubmit?: () => void;
  /** Quando definido, o campo vira um botão que leva para a tela de busca. */
  onPress?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export function SearchField({
  value,
  onChangeText,
  onSubmit,
  onPress,
  autoFocus,
  placeholder = "Busque por itens, kits ou fornecedores...",
}: SearchFieldProps) {
  const content = (
    <View className="h-14 flex-row items-center gap-3 rounded-2xl border border-sand bg-white px-4">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        editable={!onPress}
        pointerEvents={onPress ? "none" : "auto"}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        className="flex-1 text-base text-navy"
      />
      <Ionicons name="search" size={20} color={colors.navy} />
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="search">
        {content}
      </Pressable>
    );
  }

  return content;
}
