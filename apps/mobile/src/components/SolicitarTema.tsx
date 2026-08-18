import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { openWhatsApp } from "@/lib/contato";
import { track } from "@/lib/analytics";
import { colors } from "@/theme";

/**
 * Mensagem que abre no WhatsApp já contextualizada.
 *
 * Termina em dois-pontos de propósito: o cursor fica logo depois, e a pessoa
 * só digita o nome do tema. Mensagem pronta demais faz todo mundo mandar a
 * mesma frase e a Festaê ainda precisa perguntar qual é o tema — que é a
 * única informação que importa aqui.
 */
function mensagem(ocasiao?: string, procurado?: string) {
  const inicio = ocasiao
    ? `Oi! Estou montando ${ocasiao.toLowerCase()} pelo site da Festaê`
    : "Oi! Estou vendo os temas no site da Festaê";

  return procurado
    ? `${inicio} e procurei por "${procurado}", mas não encontrei. Vocês conseguem esse tema?`
    : `${inicio} e não encontrei o tema que eu queria. O tema que eu procuro é: `;
}

/**
 * Saída para quem não achou o tema que queria.
 *
 * O catálogo de temas é pequeno e vai continuar sendo — cada tema novo é
 * acervo físico comprado. Sem esta porta, quem procura "Homem-Aranha" e não
 * acha simplesmente fecha a loja, e a Festaê nunca fica sabendo que perdeu a
 * venda nem que existe procura por aquele tema.
 *
 * Cada toque vira um pedido no WhatsApp e um evento no funil: com o tempo,
 * essa lista é a melhor pista de qual acervo comprar em seguida.
 */
export function SolicitarTema({
  ocasiao,
  procurado,
  compacto = false,
}: {
  /** Nome da ocasião, ex: "Aniversário" — entra na mensagem. */
  ocasiao?: string;
  /** O que a pessoa digitou na busca e não achou. */
  procurado?: string;
  /** Versão em uma linha, para caber embaixo de uma lista. */
  compacto?: boolean;
}) {
  function pedir() {
    track("CLIQUE_WHATSAPP", { motivo: "tema_nao_encontrado", ocasiao, procurado });
    openWhatsApp(mensagem(ocasiao, procurado));
  }

  if (compacto) {
    return (
      <Pressable onPress={pedir} hitSlop={8} className="flex-row items-center justify-center gap-2 py-1">
        <Ionicons name="logo-whatsapp" size={16} color={colors.coral} />
        <Text className="text-sm font-sans-bold text-coral">
          Não achou seu tema? Fale com a gente
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={pedir}
      accessibilityRole="button"
      accessibilityLabel="Pedir um tema que não está no catálogo"
      className="flex-row items-center gap-3 rounded-2xl border border-dashed border-coral bg-white p-4"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-linen">
        <Ionicons name="sparkles-outline" size={20} color={colors.coral} />
      </View>
      <View className="flex-1">
        <Text className="font-sans-bold text-navy">Não achou o tema que queria?</Text>
        <Text className="text-sm leading-5 text-navy/60">
          Conte para a gente qual é. A Festaê avalia a possibilidade de trazer o tema para a sua
          festa.
        </Text>
      </View>
      <Ionicons name="logo-whatsapp" size={22} color={colors.coral} />
    </Pressable>
  );
}
