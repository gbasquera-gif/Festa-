import { Stack } from "expo-router";

/**
 * Montagem da festa, antes de existir conta.
 *
 * Sem guarda de autenticação de propósito — é a diferença deste fluxo para
 * o `/evento`. Aqui a pessoa escolhe data, entrega e montagem e vê o preço
 * final sem cadastrar nada; a conta só é pedida no botão que fecha a
 * reserva, quando ela já sabe exatamente o que está contratando e por
 * quanto. Pedir antes é pedir compromisso de quem ainda está decidindo.
 */
export default function MontarLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
