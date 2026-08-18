import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { DELIVERY_CITY, type EventType } from "@festae/shared";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { StepProgress } from "@/components/StepProgress";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { track } from "@/lib/analytics";
import { useOrcamento } from "@/lib/orcamento";
import { FESTAS } from "@/lib/festas";

/**
 * Data e cidade da festa. Nada sai do aparelho aqui.
 *
 * Antes esta tela criava o evento no servidor, e por isso exigia conta logo
 * no primeiro passo — a pessoa escolhia o kit, clicava em continuar e caía
 * num cadastro sem nunca ter visto o preço final. Agora a escolha fica
 * guardada localmente e só vira pedido quando a reserva é fechada.
 */
export default function EscolherData() {
  const {
    kitId,
    items,
    eventType: tipoGuardado,
    date: dataGuardada,
    city: cidadeGuardada,
    ready,
    setDadosDaFesta,
  } = useOrcamento();

  const [type, setType] = useState<EventType>(tipoGuardado ?? "ANIVERSARIO");
  const [date, setDate] = useState(dataGuardada ?? "");
  const [inDeliveryCity, setInDeliveryCity] = useState(true);
  const [otherCity, setOtherCity] = useState("");

  useEffect(() => {
    track("INICIO_CRIACAO_FESTA");
  }, []);

  // O orçamento vem do armazenamento do aparelho e chega um instante depois
  // do primeiro render: sem isto, o que a pessoa já escolheu perderia para
  // os valores iniciais do formulário.
  useEffect(() => {
    if (!ready) return;
    if (tipoGuardado) setType(tipoGuardado);
    if (dataGuardada) setDate(dataGuardada);
    if (cidadeGuardada && cidadeGuardada !== DELIVERY_CITY) {
      setInDeliveryCity(false);
      setOtherCity(cidadeGuardada);
    }
  }, [ready, tipoGuardado, dataGuardada, cidadeGuardada]);

  // A cidade é perguntada aqui, e não junto da entrega, porque é dado da
  // festa — e é ela que define se a entrega chega a ser oferecida depois.
  const city = inDeliveryCity ? DELIVERY_CITY : otherCity.trim();
  const missingCity = !inDeliveryCity && !otherCity.trim();
  const temKit = Boolean(kitId);
  const temItens = items.length > 0;

  function continuar() {
    setDadosDaFesta({ eventType: type, date, city });
    router.push("/montar/logistica");
  }

  return (
    <Screen>
      <StepProgress step={1} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Conte sobre sua festa</Text>
        <Text className="text-navy/70">
          {temKit || temItens
            ? "Falta só a data para fecharmos seu orçamento."
            : "Escolha a data e depois monte sua festa com os kits."}
        </Text>
      </View>

      {/* A ocasião só é perguntada aqui para quem não passou pela vitrine —
          quem entrou por "Chá de bebê" já respondeu, e repetir a pergunta
          faz o fluxo parecer que não prestou atenção. Sem essa ressalva a
          festa sairia gravada como aniversário, que é só o valor inicial do
          formulário, sem ninguém ter escolhido. */}
      {!tipoGuardado && (
        <View className="gap-2">
          <Text className="text-sm font-bold text-navy">Tipo de evento</Text>
          <View className="flex-row flex-wrap gap-2">
            {FESTAS.map((festa) => (
              <Chip
                key={festa.key}
                label={festa.label}
                selected={type === festa.key}
                onPress={() => setType(festa.key)}
              />
            ))}
          </View>
        </View>
      )}

      <View className="gap-2">
        <Text className="text-sm font-bold text-navy">Data da festa</Text>
        <AvailabilityCalendar value={date} onChange={setDate} />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-bold text-navy">Onde vai ser a festa?</Text>
        <View className="flex-row gap-2">
          <Chip
            label={DELIVERY_CITY}
            selected={inDeliveryCity}
            onPress={() => setInDeliveryCity(true)}
          />
          <Chip
            label="Outra cidade"
            selected={!inDeliveryCity}
            onPress={() => setInDeliveryCity(false)}
          />
        </View>
        {!inDeliveryCity && (
          <>
            <TextField
              label="Cidade"
              placeholder="Ex: Xanxerê"
              value={otherCity}
              onChangeText={setOtherCity}
            />
            <Text className="text-xs leading-4 text-navy/60">
              Fora de {DELIVERY_CITY} a retirada é feita na Festaê — você combina o horário com a
              gente e leva tudo pronto.
            </Text>
          </>
        )}
      </View>

      <Button onPress={continuar} disabled={!date || missingCity}>
        Continuar
      </Button>
    </Screen>
  );
}
