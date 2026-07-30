import { Pressable, View, type ViewProps } from "react-native";
import { cn } from "@/lib/cn";

interface CardProps extends ViewProps {
  selected?: boolean;
  onPress?: () => void;
}

export function Card({ children, selected, onPress, className, ...props }: CardProps & { className?: string }) {
  const base = cn("rounded-2xl border bg-white p-4", selected ? "border-2 border-coral" : "border-[#E5DCC8]", className);

  if (onPress) {
    return (
      <Pressable onPress={onPress} className={base}>
        {children}
      </Pressable>
    );
  }

  return (
    <View className={base} {...props}>
      {children}
    </View>
  );
}
