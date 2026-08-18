import { PRIVACY_POLICY, TERMS_OF_USE, type LegalDocument } from "@festae/shared";

/**
 * Endereço público dos documentos, usado nos links compartilháveis e nas
 * fichas das lojas. Vem de variável de ambiente para poder mudar sem tocar
 * no código.
 *
 * Aponta para o domínio próprio: é o mesmo endereço do aplicativo e do
 * e-mail da empresa, e é isso que um revisor de loja confere ao comparar a
 * ficha com a política. Um `up.railway.app` numa política de privacidade
 * parece link temporário de teste, não documento oficial de empresa com
 * CNPJ.
 *
 * Estas páginas dependem de JavaScript para exibir o texto — abrem em
 * qualquer navegador, que é como as lojas conferem. Se algum dia for preciso
 * uma versão legível sem JavaScript, a API serve o mesmo texto em HTML puro
 * em /legal/:slug; basta apontar EXPO_PUBLIC_LEGAL_BASE_URL para lá.
 */
const PUBLIC_BASE =
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ?? "https://reservas.festaechapeco.com.br/legal";

export const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? `${PUBLIC_BASE}/privacidade`;
export const TERMS_OF_USE_URL = process.env.EXPO_PUBLIC_TERMS_OF_USE_URL ?? `${PUBLIC_BASE}/termos`;

/** O texto é lido do pacote compartilhado: abre sem internet e sem WebView. */
export const LEGAL_BY_SLUG: Record<string, { document: LegalDocument; url: string }> = {
  privacidade: { document: PRIVACY_POLICY, url: PRIVACY_POLICY_URL },
  termos: { document: TERMS_OF_USE, url: TERMS_OF_USE_URL },
};
