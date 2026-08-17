import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router, useIsFocused } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { calculateOrderPricing } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { StepProgress } from "@/components/StepProgress";
import { HelpLink } from "@/components/WhatsAppButton";
import { CartaoServicos, CartaoValores, Line } from "@/components/ResumoValores";
import { api, ApiError } from "@/lib/api";
import { formatBRL } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/auth";
import { goToSignup } from "@/lib/login-gate";
import { useOrcamento } from "@/lib/orcamento";
import { origemComoMetadata } from "@/lib/origem";
import { EVENT_TYPE_LABEL, type EventRecord, type Kit, type Product } from "@/lib/types";
import { colors } from "@/theme";

/**
 * O resumo antes de existir conta — e o ponto onde a conta passa a ser
 * necessária.
 *
 * O total é calculado aqui pelo mesmo motor de preços que a API usa para
 * gravar o pedido, então o número que a pessoa lê agora é exatamente o que
 * vai ser cobrado no Pix. Fosse uma soma feita à parte, bastaria um
 * arredondamento diferente para o resumo e o QR Code discordarem.
 */
export default function ResumoLocal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const {
    kitId,
    items,
    eventType,
    date,
    city,
    fulfillment,
    assembly,
    address,
    neighborhood,
    ready,
    clear,
  } = useOrcamento();

  const emFoco = useIsFocused();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Marca que a festa já virou pedido no servidor.
   *
   * Existe por causa da guarda logo abaixo: ao fechar a reserva o orçamento
   * do aparelho é limpo, a data some, e a guarda entendia isso como "chegou
   * aqui sem escolher data" — mandava de volta para o começo no exato
   * momento em que deveria abrir o Pix.
   */
  const [finalizado, setFinalizado] = useState(false);
  /**
   * Festa já criada no servidor numa tentativa anterior.
   *
   * Quando a reserva falha — a data lotou entre montar e fechar, por
   * exemplo —, o evento já foi criado. Sem guardar isso, cada nova tentativa
   * criaria outra festa idêntica, e o cliente terminaria com uma pilha de
   * pedidos vazios na lista.
   */
  const eventoCriado = useRef<string | null>(null);

  const { data: kit } = useQuery({
    queryKey: ["kit", kitId],
    queryFn: () => api<Kit>(`/kits/${kitId}`),
    enabled: Boolean(kitId),
  });
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => api<Product[]>("/products"),
    enabled: items.length > 0,
  });

  useEffect(() => {
    if (emFoco && ready && !date && !finalizado) router.replace("/montar/data");
  }, [emFoco, ready, date, finalizado]);

  const extras = items
    .map((item) => {
      const product = products?.find((p) => p.id === item.productId);
      return product ? { product, quantity: item.quantity } : null;
    })
    .filter((linha): linha is { product: Product; quantity: number } => linha !== null);

  const pricing = calculateOrderPricing({
    subtotalKit: Number(kit?.basePrice ?? 0),
    subtotalExtras: extras.reduce(
      (soma, linha) => soma + Number(linha.product.unitPrice) * linha.quantity,
      0,
    ),
    fulfillment,
    assembly,
    city,
  });

  /**
   * Cria a festa inteira de uma vez e já solicita a reserva.
   *
   * Só acontece aqui, no fim: até este ponto nada foi para o servidor. Se
   * qualquer passo falhar, a festa não fica pela metade no banco — o evento
   * criado sem reserva some da lista quando o cliente descarta, e a data não
   * chega a ser bloqueada porque quem bloqueia é a reserva.
   */
  const fechar = useMutation({
    mutationFn: async () => {
      const jaExiste = eventoCriado.current;
      const event = jaExiste
        ? { id: jaExiste }
        : await api<EventRecord>("/events", {
            method: "POST",
            // A origem viaja junto: é o que liga "veio do Instagram" a
            // "reservou e pagou R$ 520".
            body: JSON.stringify({
              type: eventType ?? "ANIVERSARIO",
              date,
              city,
              ...origemComoMetadata(),
            }),
          });
      eventoCriado.current = event.id;

      if (!jaExiste) {
        if (kitId) {
          await api(`/events/${event.id}/order/kit`, {
            method: "POST",
            body: JSON.stringify({ kitId }),
          });
        }

        for (const item of items) {
          await api(`/events/${event.id}/order/items`, {
            method: "POST",
            body: JSON.stringify({ productId: item.productId, quantity: item.quantity }),
          });
        }
      }

      await api(`/events/${event.id}/order/logistics`, {
        method: "PATCH",
        body: JSON.stringify({
          fulfillment,
          assembly,
          address: fulfillment === "DELIVERY" ? (address ?? undefined) : undefined,
          neighborhood: fulfillment === "DELIVERY" ? (neighborhood ?? undefined) : undefined,
        }),
      });

      await api(`/events/${event.id}/reservation`, {
        method: "POST",
        body: JSON.stringify({ notes: notes || undefined }),
      });

      return event;
    },
    onSuccess: (event: { id: string }) => {
      track("RESERVA_CRIADA", { eventId: event.id });
      setFinalizado(true);
      clear();
      queryClient.invalidateQueries({ queryKey: ["my-events"] });
      router.replace(`/evento/${event.id}/pagamento`);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Não foi possível fechar sua reserva."),
  });

  function fecharFesta() {
    setError(null);
    // A conta é pedida só agora: a pessoa já escolheu tudo e sabe o preço.
    // O cadastro volta para esta mesma tela, com a festa intacta no aparelho.
    //
    // Vai para o cadastro, e não para o login: quem chegou até aqui pela loja
    // aberta quase nunca tem conta, e o botão promete "criar conta". Mandar
    // para o login entregava um formulário pedindo uma senha que essa pessoa
    // nunca criou — no passo de maior intenção da jornada inteira. Quem já
    // tem conta acha o "Já tem conta? Entrar" na própria tela de cadastro.
    if (!user) {
      goToSignup("/montar/resumo");
      return;
    }
    fechar.mutate();
  }

  if (!ready) {
    return (
      <Screen>
        <Text className="text-navy/60">Carregando...</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepProgress step={5} />

      <View className="items-center">
        <Text className="text-center font-sans-extrabold text-2xl text-navy">Essa será sua</Text>
        <Text className="text-center font-sans-extrabold text-3xl text-coral">Festaê!</Text>
      </View>

      <Card>
        <Text className="font-bold text-navy">
          {EVENT_TYPE_LABEL[eventType ?? "ANIVERSARIO"]}
        </Text>
        <Text className="text-navy/70">
          {date ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR") : "Data a escolher"}
        </Text>
        <Text className="text-navy/70">{kit?.theme?.name ?? "Sem tema definido"}</Text>
        <Text className="text-navy/70">{city}</Text>
      </Card>

      <Card>
        <Text className="mb-2 font-bold text-navy">Sua festa</Text>
        <Line
          label={kit?.name ?? "Nenhum kit selecionado"}
          value={formatBRL(pricing.subtotalKit)}
        />

        {extras.length > 0 && (
          <>
            <Text className="mb-2 mt-4 font-bold text-navy">Produtos adicionais</Text>
            {extras.map((linha) => (
              <Line
                key={linha.product.id}
                label={`${linha.quantity}x ${linha.product.name}`}
                value={formatBRL(Number(linha.product.unitPrice) * linha.quantity)}
              />
            ))}
          </>
        )}

        <View className="mt-3 border-t border-sand pt-3">
          <Line label="Subtotal dos produtos" value={formatBRL(pricing.subtotalProducts)} />
        </View>
      </Card>

      <CartaoServicos
        fulfillment={fulfillment}
        assembly={assembly}
        deliveryFee={pricing.deliveryFee}
        assemblyFee={pricing.assemblyFee}
        address={[address, neighborhood].filter(Boolean).join(", ")}
        onAlterar={() => router.push("/montar/logistica")}
      />

      <CartaoValores pricing={pricing} />

      <TextField
        label="Alguma observação para a equipe? (opcional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Ex: prefiro retirar pela manhã"
        multiline
      />

      {error && <Text className="text-sm text-red-500">{error}</Text>}

      {/* Sem kit não há o que reservar. Em vez de só desabilitar o botão e
          deixar a pessoa sem saída, a tela leva de volta aos kits. */}
      {!kitId ? (
        <>
          <View className="flex-row gap-2 rounded-2xl bg-linen p-3.5">
            <Ionicons name="information-circle-outline" size={18} color={colors.navy} />
            <Text className="flex-1 text-sm leading-5 text-navy/70">
              Falta escolher um kit para fechar a reserva.
            </Text>
          </View>
          <Button onPress={() => router.push("/catalogo/kits")}>Ver os kits</Button>
        </>
      ) : (
        <Button onPress={fecharFesta} loading={fechar.isPending}>
          {user ? "Solicitar reserva e pagar sinal" : "Criar conta e garantir a data"}
        </Button>
      )}

      {!user && (
        <Text className="text-center text-xs leading-4 text-navy/50">
          Leva menos de um minuto. Sua festa fica guardada — você volta para cá com tudo pronto.
        </Text>
      )}

      <View className="flex-row items-center justify-center gap-1.5">
        <Ionicons name="lock-closed" size={12} color={colors.muted} />
        <Text className="text-center text-xs text-navy/50">
          Pagamento via Pix pelo Mercado Pago
        </Text>
      </View>

      <HelpLink message="Oi! Tenho uma dúvida sobre o orçamento da minha festa." />
    </Screen>
  );
}
