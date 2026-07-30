import { useState } from "react";
import { Text, View } from "react-native";
import { Link, router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth, isApiError } from "@/lib/auth";

export default function Signup() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signup(name, email, password, phone || undefined);
      router.replace("/(tabs)");
    } catch (err) {
      setError(isApiError(err) ? err.message : "Não foi possível criar sua conta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentClassName="flex-1 justify-center">
      <View className="mb-6 items-center">
        <Text className="font-sans-extrabold text-3xl text-navy">Criar conta</Text>
        <Text className="mt-2 text-center text-base text-navy/70">
          Leva menos de um minuto — depois é só montar sua festa.
        </Text>
      </View>

      <View className="gap-4">
        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Seu nome" />
        <TextField
          label="E-mail"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="voce@email.com"
        />
        <TextField
          label="Telefone (opcional)"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="(49) 90000-0000"
        />
        <TextField
          label="Senha"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="Mínimo 8 caracteres"
        />
        {error && <Text className="text-sm text-red-500">{error}</Text>}
        <Button onPress={handleSubmit} loading={submitting}>
          Criar conta
        </Button>
      </View>

      <View className="mt-6 flex-row justify-center gap-1">
        <Text className="text-navy/70">Já tem conta?</Text>
        <Link href="/(auth)/login">
          <Text className="font-bold text-coral">Entrar</Text>
        </Link>
      </View>
    </Screen>
  );
}
