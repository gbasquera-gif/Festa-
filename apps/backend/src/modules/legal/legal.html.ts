import { BRAND_COLORS, COMPANY, formatLegalDate, type LegalDocument } from "@festae/shared";

/**
 * O texto vem do repositório, mas passa por escape mesmo assim: se um dia
 * alguém colar um trecho vindo de fora, ele não vira HTML executável.
 */
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Página estática, sem dependência externa — precisa abrir em qualquer rede. */
export function renderLegalDocument(document: LegalDocument): string {
  const sections = document.sections
    .map(
      (section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        ${section.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("\n        ")}
      </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(document.title)} — ${escapeHtml(COMPANY.tradeName)}</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; padding: 2.5rem 1.25rem 4rem;
    background: ${BRAND_COLORS.cream}; color: ${BRAND_COLORS.navy};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    line-height: 1.65;
  }
  main { max-width: 42rem; margin: 0 auto; }
  h1 { font-size: 1.9rem; margin: 0 0 .35rem; }
  h2 { font-size: 1.15rem; margin: 2.25rem 0 .5rem; }
  .meta { color: ${BRAND_COLORS.navy}99; font-size: .875rem; margin: 0 0 2rem; }
  .intro { font-size: 1.05rem; }
  p { margin: 0 0 .85rem; }
  footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid ${BRAND_COLORS.gold}55; font-size: .875rem; color: ${BRAND_COLORS.navy}99; }
  a { color: ${BRAND_COLORS.coral}; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(document.title)}</h1>
  <p class="meta">Versão ${escapeHtml(document.version)} · atualizada em ${escapeHtml(formatLegalDate(document.updatedAt))}</p>
  <p class="intro">${escapeHtml(document.intro)}</p>
${sections}
  <footer>
    ${escapeHtml(COMPANY.tradeName)} · ${escapeHtml(COMPANY.city)}/${escapeHtml(COMPANY.state)}<br>
    Dúvidas sobre seus dados: <a href="mailto:${escapeHtml(COMPANY.privacyEmail)}">${escapeHtml(COMPANY.privacyEmail)}</a>
  </footer>
</main>
</body>
</html>`;
}
