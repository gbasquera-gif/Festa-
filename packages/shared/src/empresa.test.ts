import { describe, expect, it } from "vitest";
import { EMPRESA, enderecoCompleto, enderecoCurto, enderecoEmPartes, qualificacaoDoEndereco, rotuloDoEndereco } from "./empresa";
import { COMPANY } from "./legal";
import { FESTAE_CONTATO } from "./comprovante";

describe("dados da empresa", () => {
  it("a razão social é a do cartão CNPJ, sem acréscimo", () => {
    expect(EMPRESA.razaoSocial).toBe("68.155.380 MARIA LUIZA POCAI");
    expect(EMPRESA.razaoSocial).not.toMatch(/\bME\b|MEI|–|-\s*ME/);
  });

  it("o endereço comercial sai inteiro e numa linha curta", () => {
    expect(enderecoCompleto()).toBe(
      "Rua Barão do Rio Branco, nº 590-E, sala subsolo, Jardim Itália, Chapecó/SC, CEP 89802-101",
    );
    expect(enderecoCurto()).toBe("Rua Barão do Rio Branco, 590-E, sala subsolo");
    expect(enderecoEmPartes()).toEqual({
      semCep: "Rua Barão do Rio Branco, nº 590-E, sala subsolo, Jardim Itália, Chapecó/SC",
      cep: "CEP 89802-101",
    });
  });

  it("endereço sem complemento não deixa vírgula sobrando", () => {
    const semSala = { ...EMPRESA.enderecoComercial, complemento: null };
    expect(enderecoCompleto(semSala)).toBe("Rua Barão do Rio Branco, nº 590-E, Jardim Itália, Chapecó/SC, CEP 89802-101");
    expect(enderecoCurto(semSala)).toBe("Rua Barão do Rio Branco, 590-E");
  });

  it("enquanto a Receita não atualizar o CNPJ, o endereço é comercial — não sede", () => {
    expect(EMPRESA.sedeCadastral.situacao).toBe("AGUARDANDO_ATUALIZACAO_NA_RECEITA");
    expect(qualificacaoDoEndereco()).toBe("endereço comercial");
    expect(rotuloDoEndereco()).toBe("Endereço comercial");
    expect(qualificacaoDoEndereco({ ...EMPRESA, sedeCadastral: { situacao: "CONFERIDA", conferidaEm: "2026-12-01" } })).toBe(
      "sede e endereço comercial",
    );
  });

  it("as constantes antigas leem daqui, sem valor próprio", () => {
    expect(COMPANY.legalName).toBe(EMPRESA.razaoSocial);
    expect(COMPANY.tradeName).toBe(EMPRESA.nomeFantasia);
    expect(COMPANY.taxId).toBe(EMPRESA.cnpj);
    expect(COMPANY.supportEmail).toBe(EMPRESA.contato.email);
    expect(FESTAE_CONTATO).toEqual({
      telefone: EMPRESA.contato.telefone,
      whatsapp: EMPRESA.contato.whatsapp,
      email: EMPRESA.contato.email,
      site: EMPRESA.contato.site,
      instagram: EMPRESA.contato.instagram,
    });
  });
});
