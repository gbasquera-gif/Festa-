/**
 * Segredo usado para assinar e validar os tokens de sessão.
 *
 * Sem valor padrão de propósito. O padrão anterior ("dev-secret-change-me")
 * estava no repositório, que é público: se a variável sumisse em produção, a
 * API voltaria a assinar tokens com um segredo conhecido e qualquer pessoa
 * poderia forjar um token de administrador — falhando em silêncio, do jeito
 * pior. Melhor o processo nem subir.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 16) {
    throw new Error(
      "JWT_SECRET ausente ou curto demais (mínimo 16 caracteres). " +
        "Defina um valor aleatório e secreto antes de iniciar a API.",
    );
  }

  return secret;
}
