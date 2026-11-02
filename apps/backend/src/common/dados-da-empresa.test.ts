import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPRESA } from "@festae/shared";

/**
 * CNPJ, telefone, e-mail e endereço da Festaê só existem em `empresa.ts`.
 *
 * Eles já estiveram copiados em quatro arquivos, e o endereço novo teria de
 * ser lembrado em cada um. Este teste lê o código do sistema e falha se um
 * desses dados aparecer escrito em outro lugar: quem precisar dele importa
 * `EMPRESA`.
 *
 * Fora da varredura: os testes (que conferem os valores), a documentação, o
 * painel financeiro antigo congelado e o app antigo em `apps/site`, que não
 * é publicado pelo ERP.
 */
const RAIZ = join(__dirname, "../../../..");
const PASTAS = [
  "apps/admin/src",
  "apps/admin/index.html",
  "apps/backend/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "packages/shared/src",
  "packages/database/prisma",
];
const FONTE_UNICA = "packages/shared/src/empresa.ts";
const EXTENSOES = /\.(ts|tsx|js|html|prisma)$/;

const DADOS = [
  EMPRESA.cnpj.slice(0, 10),
  EMPRESA.contato.telefone,
  EMPRESA.contato.whatsapp,
  EMPRESA.contato.email,
  EMPRESA.contato.instagram,
  EMPRESA.enderecoComercial.logradouro,
  EMPRESA.enderecoComercial.cep,
];

function arquivos(caminho: string): string[] {
  const absoluto = join(RAIZ, caminho);
  if (!statSync(absoluto).isDirectory()) return [caminho];
  return readdirSync(absoluto).flatMap((nome) =>
    nome === "node_modules" || nome === "dist" ? [] : arquivos(join(caminho, nome)),
  );
}

describe("dados da empresa em uma fonte só", () => {
  const codigo = PASTAS.flatMap(arquivos).filter(
    (a) => EXTENSOES.test(a) && !/\.test\.tsx?$/.test(a) && a !== FONTE_UNICA,
  );

  it("a varredura encontra o código do sistema", () => {
    expect(codigo.length).toBeGreaterThan(100);
  });

  it("nenhum arquivo além de empresa.ts escreve CNPJ, contato ou endereço", () => {
    const repetidos = codigo.flatMap((arquivo) => {
      const texto = readFileSync(join(RAIZ, arquivo), "utf8");
      return DADOS.filter((dado) => texto.includes(dado)).map((dado) => `${arquivo}: ${dado}`);
    });
    expect(repetidos).toEqual([]);
  });
});
