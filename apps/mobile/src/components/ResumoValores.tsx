import { Text, View } from "react-native";
import { DELIVERY_CITY, type PricingResult } from "@festae/shared";
import { Card } from "./Card";
import { formatBRL } from "@/lib/catalog";

/** Linha de valor. `strong` destaca o total; `muted` suaviza os itens grátis. */
export function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text className={strong ? "font-sans-extrabold text-lg text-navy" : "text-navy/70"}>
        {label}
      </Text>
      <Text
        className={
          strong
            ? "font-sans-extrabold text-lg text-coral"
            : muted
              ? "text-navy/50"
              : "font-sans-bold text-navy"
        }
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Serviços escolhidos, com o preço de cada um.
 *
 * `onAlterar` só é passado enquanto dá para mudar: depois da reserva
 * solicitada, oferecer "Alterar" seria oferecer o que a operação já não
 * aceita sem falar com a Festaê.
 */
export function CartaoServicos({
  fulfillment,
  assembly,
  deliveryFee,
  assemblyFee,
  address,
  onAlterar,
}: {
  fulfillment: "PICKUP" | "DELIVERY";
  assembly: boolean;
  deliveryFee: number;
  assemblyFee: number;
  address?: string;
  onAlterar?: () => void;
}) {
  const isDelivery = fulfillment === "DELIVERY";

  return (
    <Card>
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-bold text-navy">Serviços adicionais</Text>
        {onAlterar && (
          <Text className="text-sm font-sans-bold text-coral" onPress={onAlterar}>
            Alterar
          </Text>
        )}
      </View>

      <Line
        label={isDelivery ? `Entrega em ${DELIVERY_CITY}` : "Retirada na Festaê"}
        value={deliveryFee > 0 ? formatBRL(deliveryFee) : "Grátis"}
        muted={deliveryFee === 0}
      />
      {isDelivery && address ? (
        <Text className="mt-0.5 text-sm text-navy/50">{address}</Text>
      ) : null}

      <View className="mt-1">
        <Line
          label={assembly ? "Montagem da festa" : "Sem montagem"}
          value={assemblyFee > 0 ? formatBRL(assemblyFee) : "Grátis"}
          muted={assemblyFee === 0}
        />
      </View>
    </Card>
  );
}

/**
 * Formação do valor e a divisão do pagamento.
 *
 * Recebe o resultado pronto do motor de preços compartilhado, e não números
 * soltos: é o mesmo cálculo que a API grava no pedido e que o Pix cobra.
 * Enquanto cada tela somava por conta própria, bastava um arredondamento
 * diferente para o cliente ver um valor aqui e outro no QR Code.
 */
export function CartaoValores({ pricing }: { pricing: PricingResult }) {
  return (
    <Card>
      <Text className="mb-3 font-bold text-navy">Valores</Text>
      <Line label="Produtos" value={formatBRL(pricing.subtotalProducts)} />
      <Line
        label="Taxa de entrega"
        value={formatBRL(pricing.deliveryFee)}
        muted={pricing.deliveryFee === 0}
      />
      <Line
        label="Taxa de montagem"
        value={formatBRL(pricing.assemblyFee)}
        muted={pricing.assemblyFee === 0}
      />

      <View className="mt-3 border-t border-sand pt-3">
        <Line label="Total" value={formatBRL(pricing.total)} strong />
      </View>

      <View className="mt-4 gap-1 rounded-2xl bg-linen p-3.5">
        <Text className="font-sans-bold text-navy">Pagamento em duas partes</Text>
        <Line label="Sinal de 50% — agora, via Pix" value={formatBRL(pricing.deposit)} />
        <Line label="Restante de 50% — na retirada/entrega" value={formatBRL(pricing.balance)} />
      </View>
    </Card>
  );
}
