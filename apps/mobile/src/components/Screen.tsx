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
  /**
   * Camada flutuante sobre o conteúdo, ex: o botão de montar a festa.
   *
   * Só use em telas de navegação. Em tela de decisão com `footer`, o
   * flutuante passa por cima do botão principal — foi assim que o botão de
   * WhatsApp chegou a engolir o toque em "Quero montagem" no teste real.
   */
  floating?: ReactNode;
}

export function Screen({
  children,
  contentClassName,
  header,
  footer,
  backdrop,
  floating,
  ...props
}: ScreenProps) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={["top", "left", "right"]}>
      {backdrop}
      {header}

      <ScrollView
        keyboardShouldPersistTaps="handled"
        // Com botão flutuante, o conteúdo ganha folga extra no fim: sem ela o
        // último cartão fica escondido embaixo do botão e parece cortado.
        contentContainerClassName={cn("gap-4 p-5", floating ? "pb-28" : "pb-10", contentClassName)}
        {...props}
      >
        {children}
      </ScrollView>

      {floating}

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
