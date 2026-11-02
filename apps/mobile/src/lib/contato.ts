import { Linking } from "react-native";
import { EMPRESA } from "@festae/shared";

/** Número de atendimento da Festaê, no formato aceito pelo wa.me. */
export const WHATSAPP_NUMBER = EMPRESA.contato.whatsapp;

/** Abre a conversa no WhatsApp com a mensagem já escrita. */
export function openWhatsApp(message: string) {
  Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`).catch(
    () => {},
  );
}
