import { Dimensions, View } from "react-native";
import { Balloon } from "./Balloon";
import { colors } from "@/theme";

// A arte foi desenhada para uma tela de ~874pt de altura. Em aparelhos mais
// baixos ela encolhe junto, senão a faixa comeria metade da tela.
const REFERENCE_HEIGHT = 874;
const SCALE = Math.min(1, Dimensions.get("window").height / REFERENCE_HEIGHT);

const s = (value: number) => Math.round(value * SCALE);

/** Altura da faixa decorativa — as telas reservam esse espaço no topo. */
export const BALLOONS_HEIGHT = s(250);

interface Streamer {
  top: number;
  left: `${number}%`;
  width: number;
  height: number;
  color: string;
  rotate: number;
}

// Confetes retangulares como os da peça da marca: fitas curtas em navy,
// coral e dourado, caindo junto com os balões.
const STREAMERS: Streamer[] = [
  { top: 18, left: "26%", width: 14, height: 6, color: colors.coral, rotate: -35 },
  { top: 52, left: "40%", width: 10, height: 5, color: colors.gold, rotate: 20 },
  { top: 30, left: "56%", width: 7, height: 7, color: colors.navy, rotate: 45 },
  { top: 96, left: "30%", width: 12, height: 5, color: colors.navy, rotate: 60 },
  { top: 120, left: "62%", width: 13, height: 6, color: colors.coral, rotate: -20 },
  { top: 150, left: "18%", width: 9, height: 5, color: colors.gold, rotate: -50 },
  { top: 170, left: "72%", width: 8, height: 8, color: colors.gold, rotate: 45 },
  { top: 196, left: "44%", width: 11, height: 5, color: colors.coral, rotate: 30 },
  { top: 76, left: "84%", width: 9, height: 5, color: colors.navy, rotate: -40 },
  { top: 210, left: "8%", width: 10, height: 5, color: colors.coral, rotate: 15 },
];

/**
 * Balões descendo pelo topo da tela, como na arte de divulgação da Festaê.
 * Fica atrás do conteúdo e não recebe toque.
 */
export function BalloonsBackdrop() {
  return (
    <View
      pointerEvents="none"
      style={{ height: BALLOONS_HEIGHT }}
      className="absolute inset-x-0 top-0 overflow-hidden"
    >
      {/* Os balões saem parcialmente pelas bordas: a arte continua fora da tela. */}
      <View style={{ position: "absolute", top: s(-46), left: s(-38) }}>
        <Balloon size={s(118)} color={colors.navy} tilt={-12} ribbonCurls={4} />
      </View>

      <View style={{ position: "absolute", top: s(-26), right: s(-22) }}>
        <Balloon size={s(126)} color={colors.coral} tilt={10} ribbonCurls={4} />
      </View>

      <View style={{ position: "absolute", top: s(44), right: s(42) }}>
        <Balloon size={s(92)} color={colors.gold} tilt={-6} ribbonCurls={4} />
      </View>

      {STREAMERS.map((streamer, index) => (
        <View
          key={index}
          style={{
            position: "absolute",
            top: s(streamer.top),
            left: streamer.left,
            width: streamer.width,
            height: streamer.height,
            backgroundColor: streamer.color,
            borderRadius: 1.5,
            transform: [{ rotate: `${streamer.rotate}deg` }],
          }}
        />
      ))}
    </View>
  );
}
