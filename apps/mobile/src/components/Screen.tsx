import { ScrollView, View, type ScrollViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";

export function Screen({ children, contentClassName, ...props }: ScrollViewProps & { contentClassName?: string }) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top", "left", "right"]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName={cn("gap-4 p-5 pb-10", contentClassName)}
        {...props}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function ScreenFixed({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top", "left", "right"]}>
      <View className="flex-1 p-5">{children}</View>
    </SafeAreaView>
  );
}
