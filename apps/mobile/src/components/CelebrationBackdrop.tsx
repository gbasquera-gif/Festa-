import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, View } from "react-native";
import { colors } from "@/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface Peca {
  /** Posição horizontal, em % da largura. */
  left: number;
  size: number;
  color: string;
  forma: "balao" | "circulo" | "quadrado" | "losango";
  /** Segundos até esta peça começar a cair. */
  atraso: number;
  /** Segundos que leva para atravessar a tela. */
  duracao: number;
  /** Amplitude do bambolear lateral, em pixels. */
  deriva: number;
}

/**
 * Quantas vezes cada peça atravessa a tela antes de a festa sossegar.
 *
 * Comemoração tem hora para acabar. Confete caindo para sempre deixa de ser
 * alegria e vira ruído por cima de uma tela que a pessoa ainda vai ler — e
 * mantém a animação rodando enquanto o aparelho estiver ali, gastando
 * bateria à toa.
 */
const VOLTAS = 2;

/**
 * Distribuição fixa em vez de aleatória: a comemoração precisa ser a mesma
 * para todo cliente. Aleatório às vezes agrupa tudo num canto e deixa a tela
 * torta — e ninguém testaria de novo para descobrir.
 *
 * As peças ficam nas laterais, fora da faixa central: na primeira versão
 * elas desciam por cima do texto e a frase mais importante da jornada — a
 * data garantida — ficava difícil de ler.
 *
 * Os balões caem mais devagar que o confete porque é assim que a vista
 * espera: coisa grande e leve desce flutuando, papel pequeno desce rápido.
 */
const PECAS: Peca[] = [
  { left: 4, size: 34, color: colors.coral, forma: "balao", atraso: 0, duracao: 5.5, deriva: 18 },
  { left: 84, size: 40, color: colors.navy, forma: "balao", atraso: 0.6, duracao: 6.2, deriva: -20 },
  { left: 14, size: 26, color: colors.gold, forma: "balao", atraso: 2.4, duracao: 5, deriva: 14 },
  { left: 76, size: 30, color: colors.coral, forma: "balao", atraso: 3.2, duracao: 6, deriva: -16 },

  { left: 9, size: 10, color: colors.gold, forma: "quadrado", atraso: 0.2, duracao: 3.2, deriva: 22 },
  { left: 92, size: 8, color: colors.coral, forma: "circulo", atraso: 0.9, duracao: 2.8, deriva: -18 },
  { left: 20, size: 11, color: colors.navy, forma: "losango", atraso: 0.4, duracao: 3.6, deriva: 16 },
  { left: 88, size: 9, color: colors.gold, forma: "circulo", atraso: 1.6, duracao: 3, deriva: -22 },
  { left: 2, size: 10, color: colors.coral, forma: "quadrado", atraso: 1.1, duracao: 3.4, deriva: 20 },
  { left: 95, size: 9, color: colors.navy, forma: "losango", atraso: 2.1, duracao: 3.1, deriva: -14 },
  { left: 17, size: 8, color: colors.gold, forma: "quadrado", atraso: 2.8, duracao: 2.9, deriva: 24 },
  { left: 80, size: 10, color: colors.coral, forma: "circulo", atraso: 3.6, duracao: 3.3, deriva: -20 },
];

/** Balão com o nó e o barbante — o mesmo desenho da tela de boas-vindas. */
function Balao({ size, color }: { size: number; color: string }) {
  return (
    <View className="items-center">
      <View style={{ width: size, height: size * 1.2, backgroundColor: color, borderRadius: size / 2 }} />
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.12,
          borderRightWidth: size * 0.12,
          borderTopWidth: size * 0.18,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
        }}
      />
      <View style={{ width: 1.5, height: size * 0.9, backgroundColor: colors.gold, opacity: 0.7 }} />
    </View>
  );
}

function PecaCaindo({ peca }: { peca: Peca }) {
  const progresso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const queda = Animated.loop(
      Animated.sequence([
        Animated.delay(peca.atraso * 1000),
        Animated.timing(progresso, {
          toValue: 1,
          duration: peca.duracao * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
      { iterations: VOLTAS },
    );
    queda.start();
    return () => queda.stop();
  }, [peca, progresso]);

  const translateY = progresso.interpolate({
    inputRange: [0, 1],
    // Começa acima da tela e sai por baixo, para nunca aparecer nem sumir
    // no meio do caminho.
    outputRange: [-peca.size * 3, SCREEN_HEIGHT + peca.size * 2],
  });

  // Bambolear lateral: sobe e volta uma vez durante a queda, para o
  // movimento não ser uma linha reta.
  const translateX = progresso.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, peca.deriva, 0],
  });

  const rotate = progresso.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", peca.forma === "balao" ? "12deg" : "320deg"],
  });

  // Some antes de encostar no rodapé, para não brigar com os botões.
  const opacity = progresso.interpolate({
    inputRange: [0, 0.08, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        left: (peca.left / 100) * SCREEN_WIDTH,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    >
      {peca.forma === "balao" ? (
        <Balao size={peca.size} color={peca.color} />
      ) : (
        <View
          style={{
            width: peca.size,
            height: peca.size,
            backgroundColor: peca.color,
            borderRadius: peca.forma === "circulo" ? peca.size / 2 : 2,
            transform: [{ rotate: peca.forma === "losango" ? "45deg" : "0deg" }],
          }}
        />
      )}
    </Animated.View>
  );
}

/**
 * Chuva de balões e confete para o momento em que a festa fica garantida.
 *
 * `pointerEvents="none"` é o detalhe que evita o pior desfecho possível
 * aqui: sem ele, a camada da animação cobriria a tela inteira e engoliria os
 * toques nos botões logo depois de a pessoa ter pagado.
 */
export function CelebrationBackdrop() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      {PECAS.map((peca, index) => (
        <PecaCaindo key={index} peca={peca} />
      ))}
    </View>
  );
}
