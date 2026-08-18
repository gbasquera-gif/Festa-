import { Linking } from "react-native";

/** Número de atendimento da Festaê, no formato aceito pelo wa.me. */
export const WHATSAPP_NUMBER = "5549999487777";

/** Abre a conversa no WhatsApp com a mensagem já escrita. */
export function openWhatsApp(message: string) {
  Linking.openURL(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`).catch(
    () => {},
  );
}
