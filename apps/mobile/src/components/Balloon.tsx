import { View } from "react-native";
import { colors } from "@/theme";

interface BalloonProps {
  /** Largura do corpo do balão; a altura sai daí (proporção ~1.2). */
  size: number;
  color: string;
  /** Comprimento da fita pendurada, em número de curvas. */
  ribbonCurls?: number;
  /** Inclinação do balão, para que não fiquem todos na vertical. */
  tilt?: number;
}

const RIBBON_COLOR = colors.gold;

/**
 * Balão desenhado só com Views — o projeto não usa react-native-svg, e um
 * elipse + brilho + nó + fita já entrega o volume da peça da marca.
 */
export function Balloon({ size, color, ribbonCurls = 3, tilt = 0 }: BalloonProps) {
  const knot = size * 0.13;
  const curl = size * 0.1;

  return (
    <View style={{ alignItems: "center", transform: [{ rotate: `${tilt}deg` }] }}>
      {/* Corpo: um círculo esticado na vertical vira a elipse do balão. */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scaleY: 1.2 }],
        }}
      >
        {/* Brilho fora de centro — é ele que dá o aspecto de balão cheio. */}
        <View
          style={{
            position: "absolute",
            top: size * 0.16,
            left: size * 0.18,
            width: size * 0.26,
            height: size * 0.36,
            borderRadius: size * 0.18,
            backgroundColor: "#FFFFFF",
            opacity: 0.22,
            transform: [{ rotate: "-20deg" }],
          }}
        />
      </View>

      {/* Nó: quadrado girado 45°, encostado na base da elipse. */}
      <View
        style={{
          marginTop: size * 0.09,
          width: knot,
          height: knot,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />

      {/* Fita: segmentos finos girados em zigue-zague desenham o cacho.
          Arcos com borda transparente nos lados vizinhos saem recortados no
          RN, então a ondulação é feita com retângulos inclinados. */}
      <View style={{ marginTop: -knot * 0.3, alignItems: "center" }}>
        {Array.from({ length: ribbonCurls * 2 }).map((_, index) => (
          <View
            key={index}
            style={{
              width: 1.5,
              height: curl,
              borderRadius: 1,
              backgroundColor: RIBBON_COLOR,
              opacity: 0.75,
              marginTop: -curl * 0.14,
              transform: [
                { rotate: `${index % 2 === 0 ? 16 : -16}deg` },
                { translateX: index % 2 === 0 ? curl * 0.1 : -curl * 0.1 },
              ],
            }}
          />
        ))}
      </View>
    </View>
  );
}
