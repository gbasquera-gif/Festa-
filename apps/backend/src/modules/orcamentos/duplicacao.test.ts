import { describe, expect, it } from "vitest";
import { CAMPOS_DE_ESTADO, dadosDaDuplicata, type PropostaOriginal } from "./duplicacao";

const AGORA = new Date("2026-09-25T15:00:00.000Z");

function original(estado: Record<string, unknown> = {}): PropostaOriginal & Record<string, unknown> {
  return {
    id: "orig",
    numero: 41,
    versao: 3,
    status: "ENVIADO",
    token: "token-antigo",
    userId: "cliente-a",
    clienteNome: "Cliente A",
    clienteTelefone: "49999990000",
    clienteEmail: "a@exemplo.com",
    festaEm: new Date("2026-11-14T12:00:00.000Z"),
    tipoDeFesta: "ANIVERSARIO",
    cidade: "Chapecó",
    local: "Salão",
    convidados: 40,
    observacoes: "Tons de azul",
    validoAte: new Date("2025-03-11T15:00:00.000Z"),
    createdAt: new Date("2025-03-01T15:00:00.000Z"),
    themeId: "tema",
    kitId: "kit",
    mostrarValoresIndividuais: true,
    percentualDoSinal: 30,
    imagens: ["https://r2/a.webp", "https://r2/b.webp"],
    subtotal: 900,
    desconto: 0,
    entrega: 80,
    montagem: 120,
    total: 1000,
    totalCalculado: 1100,
    valorFinalManual: true,
    canal: "INSTAGRAM",
    composicaoDoKit: { kitId: "kit", kitNome: "Kit", itens: [] },
    primeiroEnvioEm: new Date("2025-03-01T16:00:00.000Z"),
    enviadoEm: new Date("2025-03-02T16:00:00.000Z"),
    itens: [
      { tipo: "SERVICO", productId: null, descricao: "Montagem especial", quantidade: 1, valorUnitario: 120, total: 120, imagemUrl: null, ordem: 2 },
      { tipo: "KIT", productId: null, descricao: "Kit Essencial", quantidade: 1, valorUnitario: 700, total: 700, imagemUrl: "https://r2/k.webp", ordem: 0 },
      { tipo: "PRODUTO", productId: "painel", descricao: "Painel", quantidade: 2, valorUnitario: 100, total: 200, imagemUrl: null, ordem: 1 },
    ],
    ...estado,
  };
}

const novo = { token: "token-novo", criadoPorId: "admin", agora: AGORA };

describe("duplicar proposta", () => {
  it.each([
    ["RASCUNHO", {}],
    ["ENVIADO", {}],
    ["APROVADO", { aprovadoEm: AGORA, aprovadoPorNome: "Cliente A", aprovadoPorIp: "1.1.1.1", aprovadoPorAgente: "ua", valorAprovado: 1000 }],
    ["RECUSADO", { recusadoEm: AGORA, categoriaDaPerda: "PRECO", motivoDaPerda: "caro" }],
    ["APROVADO convertido", { status: "APROVADO", aprovadoEm: AGORA, valorAprovado: 1000, reservationId: "reserva-1" }],
  ])("%s: nenhum campo de estado passa para a cópia", (status, estado) => {
    const dados = dadosDaDuplicata(original({ status, ...estado }), novo);
    for (const campo of CAMPOS_DE_ESTADO) {
      if (campo === "token") continue;
      expect(dados).not.toHaveProperty(campo);
    }
    expect(dados.token).toBe("token-novo");
    // Sem status e sem versão, o banco aplica os padrões: RASCUNHO, versão 1.
  });

  it("copia o conteúdo comercial", () => {
    const dados = dadosDaDuplicata(original(), novo);
    expect(dados).toMatchObject({
      userId: "cliente-a",
      clienteNome: "Cliente A",
      clienteTelefone: "49999990000",
      clienteEmail: "a@exemplo.com",
      tipoDeFesta: "ANIVERSARIO",
      cidade: "Chapecó",
      local: "Salão",
      convidados: 40,
      observacoes: "Tons de azul",
      themeId: "tema",
      kitId: "kit",
      mostrarValoresIndividuais: true,
      percentualDoSinal: 30,
      imagens: ["https://r2/a.webp", "https://r2/b.webp"],
      canal: "INSTAGRAM",
      subtotal: 900,
      entrega: 80,
      montagem: 120,
      total: 1000,
      totalCalculado: 1100,
      valorFinalManual: true,
      criadoPorId: "admin",
    });
  });

  it("copia as linhas na ordem, sem id nem vínculo com a original", () => {
    const linhas = dadosDaDuplicata(original(), novo).itens.create;
    expect(linhas.map((l) => [l.tipo, l.ordem])).toEqual([["KIT", 0], ["PRODUTO", 1], ["SERVICO", 2]]);
    expect(linhas[1]).toEqual({ tipo: "PRODUTO", productId: "painel", descricao: "Painel", quantidade: 2, valorUnitario: 100, total: 200, imagemUrl: null, ordem: 1 });
    for (const l of linhas) expect(l).not.toHaveProperty("orcamentoId");
  });

  it("imagens são as mesmas URLs, num array novo", () => {
    const o = original();
    const dados = dadosDaDuplicata(o, novo);
    expect(dados.imagens).toEqual(o.imagens);
    expect(dados.imagens).not.toBe(o.imagens);
  });

  it("validade: o mesmo prazo da original, contado de hoje", () => {
    const dados = dadosDaDuplicata(original(), novo);
    expect(dados.validoAte.toISOString()).toBe("2026-10-05T15:00:00.000Z");
  });

  it("composição congelada não é copiada: o rascunho lê o catálogo", () => {
    expect(dadosDaDuplicata(original(), novo)).not.toHaveProperty("composicaoDoKit");
  });
});
