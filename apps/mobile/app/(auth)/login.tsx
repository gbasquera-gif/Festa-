import { useState } from "react";
import { Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth, isApiError } from "@/lib/auth";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/(tabs)");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="flex-1 justify-center">
      <View className="mb-8 items-center">
        <Text className="font-sans-extrabold text-4xl text-navy">
          Festa<Text className="text-coral">ê!</Text>
        </Text>
        <Text className="mt-2 text-center text-base text-navy/70">
          Sua festa dos sonhos, pronta em minutos.
        </Text>
      </View>

      <View className="gap-4">
        <TextField
          label="E-mail"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
        />
        <TextField
          label="Senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        {error && <Text className="text-sm text-red-500">{error}</Text>}
        <Button onPress={handleSubmit} loading={submitting}>
          Entrar
        </Button>
      </View>

      <View className="mt-6 flex-row justify-center gap-1">
        <Text className="text-navy/70">Ainda não tem conta?</Text>
        <Link href="/(auth)/signup">
          <Text className="font-bold text-coral">Criar conta</Text>
        </Link>
      </View>
    </Screen>
  );
}
