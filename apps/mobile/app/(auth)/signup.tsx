import { useState } from "react";
import { Text, View } from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { BalloonsBackdrop, BALLOONS_HEIGHT } from "@/components/BalloonsBackdrop";
import { TermsCheckbox } from "@/components/TermsCheckbox";
import { useAuth, isApiError } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { resolveNext } from "@/lib/login-gate";

export default function Signup() {
  const { signup } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signup(name, email, password, phone || undefined);
      track("CADASTRO");
      router.replace(resolveNext(next) as never);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Não foi possível criar sua conta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen backdrop={<BalloonsBackdrop />}>
      {/* Mesma reserva do login para os balões — o formulário é mais longo e
          continua rolando abaixo. */}
      <View style={{ height: BALLOONS_HEIGHT - 60 }} />

      <View className="mb-2 items-center">
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
        <TermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} />

        {error && <Text className="text-sm text-red-500">{error}</Text>}
        <Button onPress={handleSubmit} loading={submitting} disabled={!acceptedTerms}>
          Criar conta
        </Button>
      </View>

      <View className="flex-row justify-center gap-1">
        <Text className="text-navy/70">Já tem conta?</Text>
        <Link href={{ pathname: "/(auth)/login", params: next ? { next } : {} }}>
          <Text className="font-sans-bold text-coral">Entrar</Text>
        </Link>
      </View>
    </Screen>
  );
}
