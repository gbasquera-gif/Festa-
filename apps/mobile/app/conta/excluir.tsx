import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { DetailHeader } from "@/components/DetailHeader";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOrcamento } from "@/lib/orcamento";
import { colors } from "@/theme";

const CONSEQUENCES = [
  "Seu nome, e-mail, telefone e endereços de entrega são apagados.",
  "Você perde o acesso ao aplicativo e não dá para desfazer.",
  "Festas já contratadas continuam valendo: precisamos delas para fazer a entrega e guardar a nota fiscal, mas sem ligação com os seus dados.",
];

export default function ExcluirConta() {
  const { logout } = useAuth();
  const { clear: clearOrcamento } = useOrcamento();

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/me", { method: "DELETE", body: JSON.stringify({ password }) });
      clearOrcamento();
      await logout();
      router.replace("/(auth)/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível excluir a conta.");
      setSubmitting(false);
    }
  }

  return (
    <Screen header={<DetailHeader title="Excluir conta" showShare={false} />} contentClassName="gap-5">
      <View className="items-center gap-3 rounded-2xl border border-sand bg-white px-6 py-7">
        <Ionicons name="alert-circle-outline" size={40} color={colors.coral} />
        <Text className="text-center font-sans-extrabold text-xl text-navy">
          Tem certeza que quer excluir sua conta?
        </Text>
      </View>

      <View className="gap-3">
        {CONSEQUENCES.map((line) => (
          <View key={line} className="flex-row gap-3">
            <Text className="font-sans-bold text-coral">•</Text>
            <Text className="flex-1 text-base leading-6 text-navy/70">{line}</Text>
          </View>
        ))}
      </View>

      <View className="gap-4">
        <TextField
          label="Confirme sua senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        {error && <Text className="text-sm text-red-500">{error}</Text>}

        <Button onPress={handleDelete} loading={submitting} disabled={password.length === 0}>
          Excluir minha conta
        </Button>

        <Button variant="outline" onPress={() => router.back()} disabled={submitting}>
          Manter minha conta
        </Button>
      </View>
    </Screen>
  );
}
