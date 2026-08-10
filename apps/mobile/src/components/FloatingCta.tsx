import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useOrcamento } from "@/lib/orcamento";

/**
 * Chamada principal, sempre à mão nas telas de navegação.
 *
 * Enquanto a única porta para fechar a festa era o botão dentro do detalhe do
 * kit, quem estava navegando pela vitrine precisava lembrar de voltar até lá.
 * O atalho muda de texto conforme o orçamento: sem nada escolhido ele convida
 * a começar; com kit ou itens dentro, ele leva direto para fechar a data.
 *
 * Não use em tela que já tem botão fixo no rodapé — ele passaria por cima.
 */
export function FloatingCta({
  label,
  onPress,
  icon = "sparkles",
}: {
  label?: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { count, ready } = useOrcamento();

  // Antes de o orçamento carregar do aparelho, `count` é 0 — mostrar
  // "Montar minha festa" e trocar para "Fechar minha festa" meio segundo
  // depois faria o botão piscar na cara de quem já tinha um kit escolhido.
  if (!ready) return null;

  const temOrcamento = count > 0;
  const texto = label ?? (temOrcamento ? "Fechar minha festa" : "Montar minha festa");
  const destino = () => router.push(temOrcamento ? "/evento/criar" : "/(tabs)/festas");

  return (
    <View className="absolute inset-x-5 bottom-5" pointerEvents="box-none">
      <Pressable
        onPress={onPress ?? destino}
        accessibilityRole="button"
        accessibilityLabel={texto}
        className="flex-row items-center justify-center gap-2 rounded-full bg-coral px-5 py-4 shadow-lg active:opacity-90"
      >
        <Ionicons name={temOrcamento && !label ? "cart" : icon} size={20} color="#fff" />
        <Text className="font-sans-extrabold text-base text-white">{texto}</Text>
        {temOrcamento && !label && (
          <View className="ml-1 h-6 min-w-6 items-center justify-center rounded-full bg-white/25 px-1.5">
            <Text className="text-xs font-sans-extrabold text-white">{count}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
