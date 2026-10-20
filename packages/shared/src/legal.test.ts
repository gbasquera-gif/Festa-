import { describe, expect, it } from "vitest";
import { ASSISTENTE_IA_EM_USO_A_PARTIR_DE, COMPANY, formatLegalDate, LEGAL_DOCUMENTS, PRIVACY_POLICY } from "./legal";

const textoDe = (d: (typeof LEGAL_DOCUMENTS)[number]) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.title, ...s.paragraphs])].join("\n");

describe("documentos legais", () => {
  it("não vão ao ar com marcador de pendência no texto", () => {
    for (const d of LEGAL_DOCUMENTS) expect(textoDe(d)).not.toMatch(/\[[^\]]+\]|A DEFINIR|PENDENTE|VALIDAR/);
  });

  it("a identificação e o endereço da Festaê continuam no controlador", () => {
    expect(PRIVACY_POLICY.sections[0].paragraphs[0]).toBe(
      `${COMPANY.legalName}, inscrita no CNPJ ${COMPANY.taxId}, com sede em ${COMPANY.address}, ${COMPANY.city}/${COMPANY.state}.`,
    );
  });

  it("a seção do Assistente IA diz a partir de quando ele é usado", () => {
    const secao = PRIVACY_POLICY.sections.find((s) => s.title === "Assistente de inteligência artificial na gestão interna");
    expect(secao?.paragraphs[0]).toMatch(new RegExp(`^A partir de ${formatLegalDate(ASSISTENTE_IA_EM_USO_A_PARTIR_DE)},`));
  });
});
