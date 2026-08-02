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
import { ConfettiBackdrop } from "@/components/ConfettiBackdrop";
import { BalloonsBackdrop } from "@/components/BalloonsBackdrop";
import { setItem } from "@/lib/storage";
import { ONBOARDING_KEY } from "@/lib/onboarding";

const SLIDE_WIDTH = Dimensions.get("window").width;

const SLIDES = [
  {
    title: "Tudo para a sua festa,",
    highlight: "com agilidade e praticidade.",
    body: "Conectamos você aos melhores fornecedores de todos os ramos.",
  },
  {
    title: "Escolha item por item",
    highlight: "ou leve um kit pronto.",
    body: "Decoração, mesas, louças, iluminação e brinquedos no mesmo lugar.",
  },
  {
    title: "Reserve a data e relaxe:",
    highlight: "a gente monta e recolhe.",
    body: "Entrega, montagem e retirada inclusas no seu orçamento.",
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
  async function go(path: "/(auth)/signup" | "/(auth)/login") {
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
        {/* flex-1 aqui joga a sobra de espaço para o topo, onde ficam os
            confetes — a logo desce e encosta no bloco de texto, como no layout. */}
        <View className="flex-1 justify-end px-8 pb-10 pt-10">
          <Wordmark width={286} />

          <Text className="mt-5 text-center text-[11px] font-sans-bold tracking-[2px] text-navy/60">
            LOCAÇÃO DE ARTIGOS PARA FESTAS
          </Text>
        </View>

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

        <View className="gap-4 px-8 pb-4 pt-10">
          <Button variant="navy" onPress={() => go("/(auth)/signup")}>
            Começar
          </Button>

          <Pressable onPress={() => go("/(auth)/login")} hitSlop={8}>
            <Text className="text-center font-sans-bold text-navy underline">Já tenho uma conta</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
