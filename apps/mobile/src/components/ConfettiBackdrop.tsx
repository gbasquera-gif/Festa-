import { View } from "react-native";
import { colors } from "@/theme";

interface Piece {
  /** Posição em porcentagem da altura/largura da tela. */
  top: number;
  left: number;
  size: number;
  color: string;
  /** "dot" = círculo, "square" = quadrado girado, "diamond" = losango. */
  shape: "dot" | "square" | "diamond";
  rotate?: number;
}

// Distribuição fixa (não aleatória): a marca precisa ficar igual em toda
// abertura do app. As peças ficam nas margens laterais, longe da faixa
// central onde a logo e o texto são lidos.
const PIECES: Piece[] = [
  { top: 6, left: 12, size: 10, color: colors.navy, shape: "square", rotate: 25 },
  { top: 5, left: 36, size: 12, color: colors.coral, shape: "dot" },
  { top: 11, left: 80, size: 9, color: colors.gold, shape: "diamond" },
  { top: 17, left: 6, size: 11, color: colors.navy, shape: "square", rotate: -18 },
  { top: 14, left: 62, size: 7, color: colors.navy, shape: "dot" },
  { top: 23, left: 90, size: 10, color: colors.coral, shape: "square", rotate: 40 },
  { top: 31, left: 4, size: 8, color: colors.gold, shape: "diamond" },
  { top: 36, left: 93, size: 12, color: colors.gold, shape: "dot" },
  { top: 47, left: 4, size: 9, color: colors.coral, shape: "dot" },
  { top: 55, left: 94, size: 10, color: colors.navy, shape: "diamond" },
  { top: 68, left: 3, size: 11, color: colors.gold, shape: "square", rotate: 30 },
  { top: 76, left: 94, size: 8, color: colors.coral, shape: "dot" },
];

/**
 * Confetes espalhados pela tela e os dois quartos de círculo que ancoram o
 * rodapé da tela de boas-vindas.
 *
 * `skipAbove` omite as peças do topo (em % da altura) para quando a faixa
 * dos balões já ocupa aquela área — evita confete demais no mesmo lugar.
 */
export function ConfettiBackdrop({ skipAbove = 0 }: { skipAbove?: number }) {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {PIECES.filter((piece) => piece.top >= skipAbove).map((piece, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            top: `${piece.top}%`,
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: piece.shape === "dot" ? piece.size / 2 : 2,
            transform: [{ rotate: `${piece.shape === "diamond" ? 45 : (piece.rotate ?? 0)}deg` }],
          }}
        />
      ))}

      {/* Quartos de círculo do rodapé — saem da tela de propósito. */}
      <View
        style={{ width: 230, height: 230, bottom: -120, left: -110, borderRadius: 115 }}
        className="absolute bg-coral"
      />
      <View
        style={{ width: 190, height: 190, bottom: -95, right: -70, borderRadius: 95 }}
        className="absolute bg-gold"
      />
    </View>
  );
}
