import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ASSEMBLY_FEE,
  DELIVERY_CITY,
  DELIVERY_FEE,
  DELIVERY_UNAVAILABLE_MESSAGE,
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

  return (
    <>
      <View className="gap-3">
        <Text className="text-sm font-sans-bold uppercase tracking-wide text-navy/50">Entrega</Text>

        <Option
          icon="business-outline"
          title="Retirar na Festaê"
          description="Você busca na nossa sede, no horário combinado."
          price="Grátis"
          selected={value.fulfillment === "PICKUP"}
          onPress={() => onChange({ ...value, fulfillment: "PICKUP" })}
        />

        <Option
          icon="car-outline"
          title={`Entrega em ${DELIVERY_CITY}`}
          description={
            canDeliver
              ? "A gente leva tudo até o endereço da festa."
              : `Disponível somente em ${DELIVERY_CITY}.`
          }
          price={`+ ${formatBRL(DELIVERY_FEE)}`}
          selected={value.fulfillment === "DELIVERY"}
          disabled={!canDeliver}
          onPress={() => onChange({ ...value, fulfillment: "DELIVERY" })}
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

      <View className="gap-3">
        <Text className="text-sm font-sans-bold uppercase tracking-wide text-navy/50">Montagem</Text>

        <Option
          icon="hand-left-outline"
          title="Não quero montagem"
          description="Você mesmo monta a decoração no local."
          price="Grátis"
          selected={!value.assembly}
          onPress={() => onChange({ ...value, assembly: false })}
        />

        <Option
          icon="construct-outline"
          title="Quero montagem"
          description="Nossa equipe monta tudo no local da festa."
          price={`+ ${formatBRL(ASSEMBLY_FEE)}`}
          selected={value.assembly}
          onPress={() => onChange({ ...value, assembly: true })}
        />
      </View>
    </>
  );
}

/** Falta o endereço quando a escolha é entrega — bloqueia o avanço. */
export function faltaEndereco(value: EscolhaLogistica) {
  return value.fulfillment === "DELIVERY" && !value.address.trim();
}
