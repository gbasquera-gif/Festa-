import { useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/theme";

function Row({
  icon,
  label,
  hint,
  danger,
  last,
  loading,
  onPress,
}: {
  icon: string;
  label: string;
  hint?: string;
  danger?: boolean;
  last?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      className={`flex-row items-center gap-3 px-4 py-4 ${last ? "" : "border-b border-sand"}`}
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-linen">
        {loading ? (
          <ActivityIndicator size="small" color={colors.navy} />
        ) : (
          <Ionicons name={icon as never} size={19} color={danger ? colors.coral : colors.navy} />
        )}
      </View>
      <View className="flex-1">
        <Text className={`font-sans-bold ${danger ? "text-coral" : "text-navy"}`}>{label}</Text>
        {hint && <Text className="text-xs leading-4 text-navy/50">{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function MinhaConta() {
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /**
   * A exportação é entregue na hora, pelo menu de compartilhamento do
   * aparelho — a pessoa escolhe se salva, manda por e-mail ou guarda na
   * nuvem. Prometer "enviaremos por e-mail em até X dias" exigiria um
   * provedor de e-mail que ainda não existe, e seria pior para ela.
   */
  async function handleExport() {
    setMessage(null);
    setExporting(true);
    try {
      const data = await api<unknown>("/auth/me/export");
      await Share.share({
        title: "Meus dados na Festaê",
        message: JSON.stringify(data, null, 2),
      });
    } catch (error) {
      setMessage(
        error instanceof ApiError ? error.message : "Não foi possível gerar seus dados agora.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen header={<DetailHeader title="Minha Conta" showShare={false} />} contentClassName="gap-5">
      <View className="rounded-2xl border border-sand bg-white p-4">
        <Text className="text-sm text-navy/60">Conta</Text>
        <Text className="font-sans-extrabold text-lg text-navy" numberOfLines={1}>
          {user?.name}
        </Text>
        <Text className="text-navy/70" numberOfLines={1}>
          {user?.email}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="px-1 text-xs font-sans-bold uppercase tracking-wide text-navy/50">
          Documentos
        </Text>
        <View className="overflow-hidden rounded-2xl border border-sand bg-white">
          <Row
            icon="shield-checkmark-outline"
            label="Política de Privacidade"
            onPress={() => router.push("/legal/privacidade")}
          />
          <Row
            icon="document-text-outline"
            label="Termos de Uso"
            last
            onPress={() => router.push("/legal/termos")}
          />
        </View>
      </View>

      <View className="gap-2">
        <Text className="px-1 text-xs font-sans-bold uppercase tracking-wide text-navy/50">
          Seus dados
        </Text>
        <View className="overflow-hidden rounded-2xl border border-sand bg-white">
          <Row
            icon="download-outline"
            label="Solicitar exportação dos meus dados"
            hint="Gera na hora uma cópia de tudo que guardamos sobre você"
            loading={exporting}
            onPress={handleExport}
          />
          <Row
            icon="trash-outline"
            label="Solicitar exclusão da conta"
            hint="Apaga seus dados pessoais e bloqueia o acesso"
            danger
            last
            onPress={() => router.push("/conta/excluir")}
          />
        </View>
      </View>

      {message && <Text className="px-1 text-sm text-red-500">{message}</Text>}

      <Text className="px-1 text-xs leading-4 text-navy/50">
        Para qualquer assunto sobre seus dados, fale com a gente pelo WhatsApp ou escreva para
        contato@festaechapeco.com.br.
      </Text>
    </Screen>
  );
}
