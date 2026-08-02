import { useState } from "react";
import { Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Wordmark } from "@/components/Wordmark";
import { BalloonsBackdrop, BALLOONS_HEIGHT } from "@/components/BalloonsBackdrop";
import { useAuth, isApiError } from "@/lib/auth";
import { track } from "@/lib/analytics";

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
      track("LOGIN");
      router.replace("/(tabs)");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen backdrop={<BalloonsBackdrop />}>
      {/* Reserva a faixa dos balões — a logo entra logo abaixo deles. */}
      <View style={{ height: BALLOONS_HEIGHT - 60 }} />

      <View className="mb-4">
        <Wordmark compact />
        <Text className="mt-4 text-center text-base text-navy/70">
          Bem-vindo de volta! Vamos preparar a próxima festa?
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

      <View className="flex-row justify-center gap-1">
        <Text className="text-navy/70">Ainda não tem conta?</Text>
        <Link href="/(auth)/signup">
          <Text className="font-sans-bold text-coral">Criar conta</Text>
        </Link>
      </View>
    </Screen>
  );
}
