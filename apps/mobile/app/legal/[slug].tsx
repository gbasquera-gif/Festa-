import { Pressable, Share, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatLegalDate } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { DetailHeader } from "@/components/DetailHeader";
import { LEGAL_BY_SLUG } from "@/lib/legal";
import { colors } from "@/theme";

export default function LegalDocumentScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const entry = LEGAL_BY_SLUG[slug];

  if (!entry) {
    return (
      <Screen header={<DetailHeader title="Documento" showShare={false} />}>
        <Text className="text-navy/70">Documento não encontrado.</Text>
      </Screen>
    );
  }

  const { document, url } = entry;

  return (
    <Screen
      header={
        <DetailHeader
          title={document.title}
          shareMessage={`${document.title} da Festaê: ${url}`}
        />
      }
      contentClassName="gap-5"
    >
      <View>
        <Text className="font-sans-extrabold text-2xl leading-8 text-navy">{document.title}</Text>
        <Text className="mt-1 text-sm text-navy/50">
          Versão {document.version} · atualizada em {formatLegalDate(document.updatedAt)}
        </Text>
      </View>

      <Text className="text-base leading-6 text-navy/80">{document.intro}</Text>

      {document.sections.map((section) => (
        <View key={section.title} className="gap-2">
          <Text className="font-sans-bold text-lg text-navy">{section.title}</Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text key={index} className="text-base leading-6 text-navy/70">
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      {/* Link para a versão pública: é o endereço que a pessoa pode guardar,
          mandar para alguém ou abrir fora do aplicativo. */}
      <Pressable
        onPress={() => Share.share({ message: url }).catch(() => {})}
        className="mt-2 flex-row items-center gap-2 rounded-2xl border border-sand bg-white px-4 py-3.5"
      >
        <Ionicons name="link-outline" size={18} color={colors.navy} />
        <Text className="flex-1 text-sm text-navy/70" numberOfLines={1}>
          {url}
        </Text>
        <Text className="text-sm font-sans-bold text-coral">Compartilhar</Text>
      </Pressable>
    </Screen>
  );
}
