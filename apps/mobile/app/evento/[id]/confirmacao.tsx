import { Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenFixed } from "@/components/Screen";
import { Button } from "@/components/Button";

export default function Confirmacao() {
  return (
    <ScreenFixed>
      <View className="flex-1 items-center justify-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-coral/15">
          <Ionicons name="checkmark-circle" size={64} color="#F06853" />
        </View>
        <Text className="text-center font-sans-extrabold text-2xl text-navy">
          Reserva solicitada!
        </Text>
        <Text className="text-center text-navy/70">
          Pegue, monte, comemore. A equipe da Festaê vai confirmar a disponibilidade da sua data em
          breve.
        </Text>
      </View>

      <View className="gap-3">
        <Button onPress={() => router.replace("/(tabs)/historico")}>Ver meu histórico</Button>
        <Button variant="outline" onPress={() => router.replace("/(tabs)")}>
          Voltar ao início
        </Button>
      </View>
    </ScreenFixed>
  );
}
