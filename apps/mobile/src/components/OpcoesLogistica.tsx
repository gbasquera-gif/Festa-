import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  DELIVERY_CITY,
  DELIVERY_FEE,
  DELIVERY_UNAVAILABLE_MESSAGE,
  DELIVERY_WITH_ASSEMBLY_FEE,
  isDeliveryCity,
  type Fulfillment,
} from "@festae/shared";
import { TextField } from "./TextField";
import { formatBRL } from "@/lib/catalog";
import { colors } from "@/theme";

/** Cartão de escolha: título, explicação, preço e marca de selecionado. */
function Option({
  icon,
  title,
  description,
  price,
  selected,
  disabled,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  price: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      className={`flex-row items-center gap-3 rounded-2xl border p-4 ${
        selected ? "border-coral bg-coral/5" : "border-sand bg-white"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <View
        className={`h-11 w-11 items-center justify-center rounded-full ${
          selected ? "bg-coral" : "bg-linen"
        }`}
      >
        <Ionicons name={icon as never} size={21} color={selected ? colors.white : colors.navy} />
      </View>

      <View className="flex-1">
        <Text className="font-sans-bold text-navy">{title}</Text>
        <Text className="text-sm leading-5 text-navy/60">{description}</Text>
      </View>

      <View className="items-end">
        <Text className={`font-sans-extrabold ${selected ? "text-coral" : "text-navy"}`}>{price}</Text>
        {selected && <Ionicons name="checkmark-circle" size={18} color={colors.coral} />}
      </View>
    </Pressable>
  );
}

/** As três saídas possíveis, do jeito que a cliente enxerga. */
type Escolhida = "RETIRADA" | "ENTREGA" | "ENTREGA_MONTAGEM";

export interface EscolhaLogistica {
  fulfillment: Fulfillment;
  assembly: boolean;
  address: string;
  neighborhood: string;
}

/**
 * Entrega e montagem, com os mesmos cartões nos dois lugares que perguntam:
 * a festa em montagem no aparelho e a revisão de um pedido já criado.
 *
 * Vive num componente só porque são escolhas que mexem no total. Duas cópias
 * do formulário viram, na primeira alteração de preço, dois totais diferentes
 * para o mesmo cliente.
 */
export function OpcoesLogistica({
  city,
  value,
  onChange,
}: {
  city: string | null | undefined;
  value: EscolhaLogistica;
  onChange: (escolha: EscolhaLogistica) => void;
}) {
  const canDeliver = isDeliveryCity(city);

  // Uma escolha só, com três saídas. Antes eram duas perguntas separadas
  // (entrega e montagem) e dava para pedir montagem com retirada — combinação
  // que a operação não cumpre, porque quem monta é a equipe que leva.
  const escolhida: Escolhida = value.fulfillment !== "DELIVERY" ? "RETIRADA" : value.assembly ? "ENTREGA_MONTAGEM" : "ENTREGA";

  function escolher(opcao: Escolhida) {
    if (opcao === "RETIRADA") {
      onChange({ ...value, fulfillment: "PICKUP", assembly: false });
      return;
    }
    onChange({
      ...value,
      fulfillment: "DELIVERY",
      assembly: opcao === "ENTREGA_MONTAGEM",
    });
  }

  return (
    <>
      <View className="gap-3">
        <Option
          icon="business-outline"
          title="Retirar na Festaê"
          description="Você busca na nossa sede, no horário combinado."
          price="Grátis"
          selected={escolhida === "RETIRADA"}
          onPress={() => escolher("RETIRADA")}
        />

        <Option
          icon="car-outline"
          title={`Entrega em ${DELIVERY_CITY}`}
          description={
            canDeliver
              ? "A gente leva tudo até o endereço da festa. A montagem fica por sua conta."
              : `Disponível somente em ${DELIVERY_CITY}.`
          }
          price={`+ ${formatBRL(DELIVERY_FEE)}`}
          selected={escolhida === "ENTREGA"}
          disabled={!canDeliver}
          onPress={() => escolher("ENTREGA")}
        />

        <Option
          icon="construct-outline"
          title="Entrega + montagem"
          description={
            canDeliver
              ? "A gente leva e monta a decoração no local da festa."
              : `Disponível somente em ${DELIVERY_CITY}.`
          }
          price={`+ ${formatBRL(DELIVERY_WITH_ASSEMBLY_FEE)}`}
          selected={escolhida === "ENTREGA_MONTAGEM"}
          disabled={!canDeliver}
          onPress={() => escolher("ENTREGA_MONTAGEM")}
        />

        {!canDeliver && (
          <View className="flex-row gap-2 rounded-2xl bg-linen p-3.5">
            <Ionicons name="information-circle-outline" size={18} color={colors.navy} />
            <Text className="flex-1 text-sm leading-5 text-navy/70">
              {DELIVERY_UNAVAILABLE_MESSAGE}
            </Text>
          </View>
        )}

        {value.fulfillment === "DELIVERY" && (
          <View className="gap-3">
            <TextField
              label="Endereço da festa"
              placeholder="Rua, número"
              value={value.address}
              onChangeText={(address) => onChange({ ...value, address })}
            />
            <TextField
              label="Bairro (opcional)"
              placeholder="Ex: Centro"
              value={value.neighborhood}
              onChangeText={(neighborhood) => onChange({ ...value, neighborhood })}
            />
          </View>
        )}
      </View>
    </>
  );
}

/** Falta o endereço quando a escolha é entrega — bloqueia o avanço. */
export function faltaEndereco(value: EscolhaLogistica) {
  return value.fulfillment === "DELIVERY" && !value.address.trim();
}
