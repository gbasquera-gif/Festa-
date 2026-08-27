import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrcamento } from "@/lib/orcamento";
import { colors } from "@/theme";

/**
 * Altura do conteúdo da barra: ícone (24) + rótulo (11px) + respiro.
 * A área segura do aparelho é somada a isso, nunca descontada dela.
 */
const ALTURA_DO_CONTEUDO = 62;

// Sem guarda de autenticação: a vitrine é aberta. O login é pedido no
// momento de reservar ou pagar, não na porta de entrada.
export default function TabsLayout() {
  const { count } = useOrcamento();
  // A página abre com `viewport-fit=cover`, então o rodapé fica embaixo da
  // barra do Safari e do indicador de home. Com altura fixa, o navegador
  // reservava esse espaço por dentro da barra e comia o rótulo ("Iníci...").
  // Somar o inset à altura devolve a faixa que era do texto.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.navy,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.sand,
          height: ALTURA_DO_CONTEUDO + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontFamily: "Nunito_600SemiBold",
          fontSize: 11,
          // Sem isso o rótulo de duas sílabas ("Favoritos") ainda podia ser
          // cortado na vertical em telas com fonte aumentada.
          lineHeight: 14,
          marginBottom: 4,
        },
        tabBarBadgeStyle: { backgroundColor: colors.coral, fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="festas"
        options={{
          title: "Festas",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="balloon" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="favoritos"
        options={{
          title: "Favoritos",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{
          title: "Pedidos",
          tabBarIcon: ({ color, size }) => <Ionicons name="bag-handle" color={color} size={size} />,
          tabBarBadge: count > 0 ? count : undefined,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
