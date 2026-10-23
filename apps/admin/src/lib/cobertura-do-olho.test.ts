import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda tela de consulta formata dinheiro pelo olho (`useFormato`).
 *
 * A revisão achou Eventos, Kits e Produtos mostrando valores com o olho
 * fechado: formatavam por conta própria. Este teste lê o código das telas e
 * recusa formatação de dinheiro fora do olho — tela nova que esquecer cai
 * aqui, não na reunião com a tela compartilhada.
 *
 * Ficam de fora, de propósito, os documentos oficiais (sempre o valor de
 * verdade) e os formulários e diálogos em que o valor está sendo digitado ou
 * conferido para gravar.
 */
const FORA_DO_OLHO = new Set([
  // Documentos oficiais.
  "pages/Comprovante.tsx",
  "pages/Proposta.tsx",
  "pages/VoucherDeCredito.tsx",
  "components/documento/DocumentoFestae.tsx",
  // Formulários e diálogos de lançamento.
  "components/FormularioDeReserva.tsx",
  "components/credito/AplicarCredito.tsx",
  "components/credito/CancelarReserva.tsx",
  "components/credito/RegistrarReembolso.tsx",
  "components/orcamento/EditorDaOpcao.tsx",
  "components/orcamento/AprovacaoManual.tsx",
  "components/financeiro/FormularioDeGasto.tsx",
  "pages/NovaReservaManual.tsx",
  "pages/EditarReserva.tsx",
  "pages/NovoOrcamento.tsx",
  // Os formatadores em si.
  "lib/privacidade.tsx",
  "components/financeiro/formato.ts",
]);

/** Jeitos de pôr dinheiro na tela sem passar pelo olho. */
const FORMATACAO_PROPRIA: [string, RegExp][] = [
  ['"R$ {valor}" escrito à mão', /R\$\s*\{/],
  ['"R$ ${valor}" em texto', /R\$\s*\$\{/],
  ["formatarReais do pacote compartilhado", /import\s*\{[^}]*\bformatarReais\b[^}]*\}\s*from\s*"@festae\/shared"/],
  ["brl ou numero do formato financeiro", /import\s*\{[^}]*\b(brl|numero)\b[^}]*\}\s*from\s*"[^"]*financeiro\/formato"/],
  ["brl ou numero do formato financeiro", /import\s*\{[^}]*\b(brl|numero)\b[^}]*\}\s*from\s*"\.\/formato"/],
  ["moeda pelo Intl", /style:\s*"currency"/],
];

const RAIZ = join(__dirname, "..");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe("cobertura do olho", () => {
  const telas = arquivos(RAIZ).map((caminho) => ({
    arquivo: relative(RAIZ, caminho).replaceAll("\\", "/"),
    codigo: readFileSync(caminho, "utf8"),
  }));

  it("acha as telas (o teste não está olhando para pasta vazia)", () => {
    expect(telas.length).toBeGreaterThan(50);
    expect(telas.some((t) => t.arquivo === "pages/Events.tsx")).toBe(true);
  });

  it("nenhuma tela de consulta formata dinheiro fora do olho", () => {
    const achados = telas
      .filter((t) => !FORA_DO_OLHO.has(t.arquivo))
      .flatMap((t) => FORMATACAO_PROPRIA.filter(([, re]) => re.test(t.codigo)).map(([como]) => `${t.arquivo}: ${como}`));
    expect(achados).toEqual([]);
  });

  it("a lista de exceções só tem arquivos que existem (exceção velha não esconde tela nova)", () => {
    const existentes = new Set(telas.map((t) => t.arquivo));
    expect(Array.from(FORA_DO_OLHO).filter((a) => !existentes.has(a))).toEqual([]);
  });
});
