import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export function TextField({ label, error, className, ...props }: TextFieldProps & { className?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-bold text-navy">{label}</Text>
      <TextInput
        placeholderTextColor="#9CA8B8"
        className={cn(
          "rounded-xl border px-4 py-3.5 text-base text-navy",
          error ? "border-red-400" : "border-[#E5DCC8]",
          className,
        )}
        {...props}
      />
      {error && <Text className="text-xs text-red-500">{error}</Text>}
    </View>
  );
}
