import { describe, expect, it } from "vitest";
import { EMPRESA, enderecoCompleto } from "./empresa";
import {
  ASSISTENTE_IA_EM_USO_A_PARTIR_DE,
  COMPANY,
  formatLegalDate,
  LEGAL_DOCUMENTS,
  PRIVACY_POLICY,
  rotuloDaAtualizacao,
  TERMS_OF_USE,
  TERMS_UPDATED_AT,
} from "./legal";

/** A branch que a Railway publica em produção. */
const BRANCH_DE_PRODUCAO = "claude/festaê-app-llk596";

const textoDe = (d: (typeof LEGAL_DOCUMENTS)[number]) => [d.title, d.intro, ...d.sections.flatMap((s) => [s.title, ...s.paragraphs])].join("\n");

describe("documentos legais", () => {
  it("não vão ao ar com marcador de pendência no texto", () => {
    for (const d of LEGAL_DOCUMENTS) expect(textoDe(d)).not.toMatch(/\[[^\]]+\]|A DEFINIR|PENDENTE|VALIDAR/);
  });

  it("o controlador é identificado pela razão social, CNPJ e endereço comercial", () => {
    expect(PRIVACY_POLICY.sections[0].paragraphs[0]).toBe(
      `${EMPRESA.razaoSocial}, inscrita no CNPJ ${EMPRESA.cnpj}, com endereço comercial na ${enderecoCompleto()}.`,
    );
    expect(COMPANY.address).toBe(enderecoCompleto());
  });

  it("nenhum documento chama o endereço de sede enquanto o cartão CNPJ não for atualizado", () => {
    expect(EMPRESA.sedeCadastral.situacao).toBe("AGUARDANDO_ATUALIZACAO_NA_RECEITA");
    for (const d of LEGAL_DOCUMENTS) expect(textoDe(d)).not.toMatch(/\bsede\b/i);
  });

  it("a retirada aponta o endereço comercial", () => {
    const retirada = TERMS_OF_USE.sections.find((s) => s.title === "Retirada, entrega e montagem");
    expect(retirada?.paragraphs[0]).toContain(`no endereço comercial da Festaê, na ${enderecoCompleto()}`);
  });

  it("a seção do Assistente IA diz a partir de quando ele é usado", () => {
    const secao = PRIVACY_POLICY.sections.find((s) => s.title === "Assistente de inteligência artificial na gestão interna");
    expect(secao?.paragraphs[0]).toMatch(new RegExp(`^A partir de ${formatLegalDate(ASSISTENTE_IA_EM_USO_A_PARTIR_DE)},`));
  });

  /**
   * A data que o leitor vê é a da publicação. Enquanto a versão está em
   * preparação, ela fica vazia e a página diz isso — nunca mostra o dia em que
   * o texto foi preparado. Na branch de produção o teste exige a data: sem
   * ela, o CI falha e a Railway (Wait for CI) não publica.
   */
  it("a data de vigência é a da publicação; a branch de produção não passa sem ela", () => {
    if (process.env.GITHUB_REF_NAME === BRANCH_DE_PRODUCAO) {
      expect(TERMS_UPDATED_AT, "Defina TERMS_UPDATED_AT com o dia da publicação antes de publicar esta versão.").toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      return;
    }
    for (const d of LEGAL_DOCUMENTS) expect(d.updatedAt).toBe(TERMS_UPDATED_AT);
    if (TERMS_UPDATED_AT === null) expect(rotuloDaAtualizacao(TERMS_OF_USE)).toBe("em preparação, ainda não publicada");
  });

  it("publicada, a versão mostra o dia da publicação", () => {
    expect(rotuloDaAtualizacao({ updatedAt: "2026-11-20" })).toBe("atualizada em 20/11/2026");
    expect(rotuloDaAtualizacao({ updatedAt: null })).toBe("em preparação, ainda não publicada");
  });
});
