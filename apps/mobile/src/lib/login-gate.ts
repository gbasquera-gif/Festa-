import { router } from "expo-router";

/**
 * Portão de login.
 *
 * O catálogo é aberto: qualquer pessoa vê temas, kits, produtos e preços sem
 * conta. A conta só é pedida quando a ação exige saber quem é — reservar uma
 * data, pagar um sinal, ver os próprios pedidos. Pedir antes disso é o que
 * fazia o app perder gente na primeira tela.
 *
 * Ao mandar para o login, guardamos para onde a pessoa estava indo, e o
 * login devolve ela exatamente ali. Sem isso, quem cria conta para reservar
 * cairia na home e teria que refazer o caminho — que é onde a maioria
 * desiste de novo.
 */
export function goToLogin(next?: string) {
  router.push({ pathname: "/(auth)/login", params: next ? { next } : {} });
}

export function goToSignup(next?: string) {
  router.push({ pathname: "/(auth)/signup", params: next ? { next } : {} });
}

/** Destino após autenticar: o que a pessoa tentou fazer, ou a home. */
export function resolveNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  // Só caminhos internos: um `next` vindo de fora não pode virar redirecionamento
  // para outro lugar — e caminho relativo (`//`) sairia do app.
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/(tabs)";
}
