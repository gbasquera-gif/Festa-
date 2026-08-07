import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

/**
 * Aceite dos termos no cadastro.
 *
 * A caixa começa desmarcada de propósito: consentimento pré-marcado não vale
 * como consentimento, nem pela LGPD nem na revisão das lojas. Os nomes dos
 * documentos são toques que abrem o texto — exigir aceite sem oferecer
 * leitura é o que costuma reprovar.
 */
export function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Li e concordo com os Termos de Uso e a Política de Privacidade"
        hitSlop={8}
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border-2 ${
          checked ? "border-coral bg-coral" : "border-sand bg-white"
        }`}
      >
        {checked && <Ionicons name="checkmark" size={16} color={colors.white} />}
      </Pressable>

      <Text className="flex-1 text-sm leading-5 text-navy/70">
        Li e concordo com os{" "}
        <Text
          className="font-sans-bold text-coral underline"
          onPress={() => router.push("/legal/termos")}
        >
          Termos de Uso
        </Text>{" "}
        e a{" "}
        <Text
          className="font-sans-bold text-coral underline"
          onPress={() => router.push("/legal/privacidade")}
        >
          Política de Privacidade
        </Text>
        .
      </Text>
    </View>
  );
}
