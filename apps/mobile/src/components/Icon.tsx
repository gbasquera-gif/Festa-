import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

/**
 * As categorias e diferenciais do catálogo precisam de ícones que o Ionicons
 * não cobre (cadeira, talher, urso). Este wrapper deixa os metadados em
 * catalog.ts escolherem a família sem espalhar `if` pelas telas.
 */
export function Icon({
  name,
  set = "ion",
  size = 22,
  color,
}: {
  name: string;
  set?: "ion" | "mci";
  size?: number;
  color: string;
}) {
  if (set === "mci") {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
  }
  return <Ionicons name={name as never} size={size} color={color} />;
}
