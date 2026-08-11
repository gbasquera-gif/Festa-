import { useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Dots } from "@/components/Dots";
import { Wordmark } from "@/components/Wordmark";
import { ConfettiBackdrop, CornerArcs } from "@/components/ConfettiBackdrop";
import { BalloonsBackdrop, BALLOONS_HEIGHT } from "@/components/BalloonsBackdrop";
import { setItem } from "@/lib/storage";
import { ONBOARDING_KEY } from "@/lib/onboarding";

const SLIDE_WIDTH = Dimensions.get("window").width;

/**
 * A apresentação promete o que a Festaê faz de verdade.
 *
 * O primeiro slide dizia "conectamos você aos melhores fornecedores de todos
 * os ramos" — descrição de marketplace, e a Festaê não é isso: é acervo
 * próprio de decoração, alugado direto. Prometer intermediação de terceiros
 * cria expectativa de bolo, buffet e DJ na primeira tela, e a segunda tela
 * já desmente.
 */
const SLIDES = [
  {
    title: "Decoração de festa",
    highlight: "para alugar em Chapecó.",
    body: "Painéis, arcos de balões e mesa posta do nosso acervo, prontos para a sua data.",
  },
  {
    title: "Diga que festa vai fazer",
    highlight: "e leve um kit pronto.",
    body: "Aniversário, chá de bebê, chá revelação ou batizado — com tema e itens combinando.",
  },
  {
    title: "Reserve a data,",
    highlight: "retire ou receba em casa.",
    body: "Retirada na Festaê sem custo. Entrega e montagem são opcionais em Chapecó.",
  },
];

export default function BoasVindas() {
  const [index, setIndex] = useState(0);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    if (next !== index) setIndex(next);
  }

  // Marca como visto assim que o usuário sai daqui: quem já conhece o app não
  // precisa rever a apresentação a cada logout.
  async function go(path: "/(tabs)" | "/(auth)/signup" | "/(auth)/login") {
    await setItem(ONBOARDING_KEY, "1").catch(() => {});
    router.replace(path);
  }

  return (
    <View className="flex-1 bg-cream">
      {/* Os balões ocupam o topo; o confete continua da faixa deles para
          baixo, para as duas camadas não se sobreporem. */}
      <ConfettiBackdrop skipAbove={32} />
      <BalloonsBackdrop />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        {/* Rolagem com flexGrow: em telas altas o rodapé é empurrado para
            baixo pelo mt-auto; em telas curtas o conteúdo rola em vez de
            subir por cima dos balões. */}
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* Faixa reservada dos balões — a logo nunca encosta neles. */}
          <View style={{ height: BALLOONS_HEIGHT + 40 }} />

          <View className="px-8">
            <Wordmark width={286} />

            <Text className="mt-5 text-center text-[11px] font-sans-bold tracking-[2px] text-navy/60">
              LOCAÇÃO DE ARTIGOS PARA FESTAS
            </Text>
          </View>

          <View className="h-9" />

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            style={{ flexGrow: 0 }}
          >
            {SLIDES.map((slide) => (
              <View key={slide.title} style={{ width: SLIDE_WIDTH }} className="px-8">
                <Text className="text-center font-sans-extrabold text-2xl leading-8 text-navy">
                  {slide.title}
                </Text>
                <Text className="text-center font-sans-extrabold text-2xl leading-8 text-coral">
                  {slide.highlight}
                </Text>
                <Text className="mt-3 text-center text-base leading-6 text-navy/70">{slide.body}</Text>
              </View>
            ))}
          </ScrollView>

          <Dots count={SLIDES.length} index={index} className="mt-7" />

          <View className="mt-auto gap-4 px-8 pb-4 pt-10">
            <CornerArcs />

            {/* Entra direto na vitrine: a conta é pedida só na hora de
                reservar, quando a pessoa já sabe o que está contratando. */}
            <Button variant="navy" onPress={() => go("/(tabs)")}>
              Ver o catálogo
            </Button>

            <Pressable onPress={() => go("/(auth)/login")} hitSlop={8}>
              <Text className="text-center font-sans-bold text-navy underline">Já tenho uma conta</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
