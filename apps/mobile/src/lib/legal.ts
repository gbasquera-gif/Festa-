import { PRIVACY_POLICY, TERMS_OF_USE, type LegalDocument } from "@festae/shared";

/**
 * Endereço público dos documentos, usado nos links compartilháveis e nas
 * fichas das lojas. Vem de variável de ambiente porque muda quando a Festaê
 * tiver site próprio — nada de URL fixa no código.
 *
 * O padrão aponta para as páginas servidas pela própria API, que existem
 * desde já e não dependem de um site estar no ar.
 */
const PUBLIC_BASE =
  process.env.EXPO_PUBLIC_LEGAL_BASE_URL ?? "https://festa-production.up.railway.app/legal";

export const PRIVACY_POLICY_URL = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? `${PUBLIC_BASE}/privacidade`;
export const TERMS_OF_USE_URL = process.env.EXPO_PUBLIC_TERMS_OF_USE_URL ?? `${PUBLIC_BASE}/termos`;

/** O texto é lido do pacote compartilhado: abre sem internet e sem WebView. */
export const LEGAL_BY_SLUG: Record<string, { document: LegalDocument; url: string }> = {
  privacidade: { document: PRIVACY_POLICY, url: PRIVACY_POLICY_URL },
  termos: { document: TERMS_OF_USE, url: TERMS_OF_USE_URL },
};
