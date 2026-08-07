import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useOrcamento } from "@/lib/orcamento";
import { colors } from "@/theme";

// Sem guarda de autenticação: a vitrine é aberta. O login é pedido no
// momento de reservar ou pagar, não na porta de entrada.
export default function TabsLayout() {
  const { count } = useOrcamento();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.navy,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.sand,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: "Nunito_600SemiBold", fontSize: 11 },
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
        name="categorias"
        options={{
          title: "Categorias",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" color={color} size={size} />,
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
