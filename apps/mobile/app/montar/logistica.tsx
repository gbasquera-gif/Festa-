import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router, useIsFocused } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { StepProgress } from "@/components/StepProgress";
import { HelpLink } from "@/components/WhatsAppButton";
import {
  OpcoesLogistica,
  faltaEndereco,
  type EscolhaLogistica,
} from "@/components/OpcoesLogistica";
import { useOrcamento } from "@/lib/orcamento";

export default function LogisticaLocal() {
  const {
    city,
    fulfillment,
    assembly,
    address,
    neighborhood,
    date,
    ready,
    setDadosDaFesta,
  } = useOrcamento();

  const emFoco = useIsFocused();

  const [escolha, setEscolha] = useState<EscolhaLogistica>({
    fulfillment,
    assembly,
    address: address ?? "",
    neighborhood: neighborhood ?? "",
  });

  useEffect(() => {
    if (!ready) return;
    setEscolha({
      fulfillment,
      assembly,
      address: address ?? "",
      neighborhood: neighborhood ?? "",
    });
  }, [ready, fulfillment, assembly, address, neighborhood]);

  // Sem data não há o que combinar de entrega: quem cai aqui por um link
  // antigo volta ao passo que falta, em vez de seguir com a festa pela
  // metade e travar só no fim.
  //
  // Só quando a tela está em foco. Esta tela continua viva embaixo do
  // resumo, e ao fechar a reserva o orçamento é limpo — sem a checagem de
  // foco, o guarda daqui disparava por baixo e roubava a navegação que
  // levava ao Pix.
  useEffect(() => {
    if (emFoco && ready && !date) router.replace("/montar/data");
  }, [emFoco, ready, date]);

  function continuar() {
    setDadosDaFesta({
      fulfillment: escolha.fulfillment,
      assembly: escolha.assembly,
      address: escolha.fulfillment === "DELIVERY" ? escolha.address.trim() : null,
      neighborhood: escolha.fulfillment === "DELIVERY" ? escolha.neighborhood.trim() : null,
    });
    router.push("/montar/resumo");
  }

  return (
    <Screen>
      <StepProgress step={4} />

      <View>
        <Text className="font-sans-extrabold text-2xl text-navy">Como você prefere receber?</Text>
        <Text className="text-navy/70">Escolha a entrega e se quer a montagem por nossa conta.</Text>
      </View>

      <OpcoesLogistica city={city} value={escolha} onChange={setEscolha} />

      <Button onPress={continuar} disabled={faltaEndereco(escolha)}>
        Ver resumo da festa
      </Button>
      {faltaEndereco(escolha) && (
        <Text className="text-center text-xs text-navy/50">
          Informe o endereço para seguir com a entrega.
        </Text>
      )}

      <HelpLink message="Oi! Tenho uma dúvida sobre entrega e montagem da minha festa." />
    </Screen>
  );
}
