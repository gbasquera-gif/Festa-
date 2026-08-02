import type { ReactNode } from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";

interface ScreenProps extends ScrollViewProps {
  contentClassName?: string;
  /** Barra fixa no topo (não rola com o conteúdo), ex: DetailHeader. */
  header?: ReactNode;
  /** Barra fixa no rodapé, ex: quantidade + "Adicionar ao orçamento". */
  footer?: ReactNode;
  /** Camada decorativa atrás do conteúdo, ex: os balões do login. */
  backdrop?: ReactNode;
}

export function Screen({
  children,
  contentClassName,
  header,
  footer,
  backdrop,
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top", "left", "right"]}>
      {backdrop}
      {header}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName={cn("gap-4 p-5 pb-10", contentClassName)}
        {...props}
      >
        {children}
      </ScrollView>

      {footer && <View className="border-t border-sand bg-cream px-5 pb-5 pt-3">{footer}</View>}
    </SafeAreaView>
  );
}

export function ScreenFixed({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top", "left", "right"]}>
      <View className="flex-1 p-5">{children}</View>
    </SafeAreaView>
  );
}
