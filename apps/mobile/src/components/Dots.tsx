import { View } from "react-native";
import { cn } from "@/lib/cn";

/** Indicador de página dos carrosséis: a bolinha ativa vira uma pílula. */
export function Dots({
  count,
  index,
  tone = "coral",
  className,
}: {
  count: number;
  index: number;
  tone?: "coral" | "light";
  className?: string;
}) {
  if (count <= 1) return null;

  return (
    <View className={cn("flex-row items-center justify-center gap-1.5", className)}>
      {Array.from({ length: count }).map((_, i) => {
        const active = i === index;
        const activeClass = tone === "light" ? "bg-white" : "bg-coral";
        const idleClass = tone === "light" ? "bg-white/40" : "bg-navy/20";
        return (
          <View
            key={i}
            className={cn("h-1.5 rounded-full", active ? `w-4 ${activeClass}` : `w-1.5 ${idleClass}`)}
          />
        );
      })}
    </View>
  );
}
