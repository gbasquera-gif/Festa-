import { describe, expect, it } from "vitest";
import { CAMPOS_DE_ESTADO, dadosDaDuplicata, type PropostaOriginal } from "./duplicacao";

const AGORA = new Date("2026-09-25T15:00:00.000Z");

function opcao(ordem: number, nome: string, extra: Record<string, unknown> = {}) {
  return {
    id: `opc-${ordem}`,
    orcamentoId: "orig",
    ordem,
    nome,
    descricao: `Descrição ${nome}`,
    kitId: `kit-${ordem}`,
    imagens: [`https://r2/${ordem}-a.webp`, `https://r2/${ordem}-b.webp`],
    composicaoDoKit: { kitId: `kit-${ordem}`, kitNome: "Kit", itens: [] },
    subtotal: 900,
    desconto: 0,
    entrega: 80,
    montagem: 120,
    total: 1000 + ordem,
    totalCalculado: 1100,
    valorFinalManual: true,
    itens: [
      { id: "l3", orcamentoId: "orig", opcaoId: `opc-${ordem}`, tipo: "SERVICO", productId: null, descricao: "Montagem especial", quantidade: 1, valorUnitario: 120, total: 120, imagemUrl: null, ordem: 2 },
      { id: "l1", orcamentoId: "orig", opcaoId: `opc-${ordem}`, tipo: "KIT", productId: null, descricao: "Kit Essencial", quantidade: 1, valorUnitario: 700, total: 700, imagemUrl: "https://r2/k.webp", ordem: 0 },
      { id: "l2", orcamentoId: "orig", opcaoId: `opc-${ordem}`, tipo: "PRODUTO", productId: "painel", descricao: "Painel", quantidade: 2, valorUnitario: 100, total: 200, imagemUrl: null, ordem: 1 },
    ],
    ...extra,
  };
}

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
    nomeDoFestejado: "Festejada B",
    festaEm: new Date("2026-11-14T12:00:00.000Z"),
    tipoDeFesta: "ANIVERSARIO",
    cidade: "Chapecó",
    local: "Salão",
    convidados: 40,
    observacoes: "Tons de azul",
    validoAte: new Date("2025-03-11T15:00:00.000Z"),
    createdAt: new Date("2025-03-01T15:00:00.000Z"),
    themeId: "tema",
    kitId: "kit-0",
    mostrarValoresIndividuais: true,
    percentualDoSinal: 30,
    imagens: ["https://r2/0-a.webp"],
    subtotal: 900,
    desconto: 0,
    entrega: 80,
    montagem: 120,
    total: 1000,
    totalCalculado: 1100,
    valorFinalManual: true,
    canal: "INSTAGRAM",
    composicaoDoKit: { kitId: "kit-0", kitNome: "Kit", itens: [] },
    primeiroEnvioEm: new Date("2025-03-01T16:00:00.000Z"),
    enviadoEm: new Date("2025-03-02T16:00:00.000Z"),
    // Fora de ordem de propósito: a cópia segue `ordem`, não a do array.
    opcoes: [opcao(2, "Premium"), opcao(0, "Essencial"), opcao(1, "Completa")],
    ...estado,
  };
}

const novo = { token: "token-novo", criadoPorId: "admin", agora: AGORA };

describe("duplicar proposta", () => {
  it.each([
    ["RASCUNHO", {}],
    ["ENVIADO", {}],
    ["APROVADO", { aprovadoEm: AGORA, aprovadoPorNome: "Cliente A", aprovadoPorIp: "1.1.1.1", aprovadoPorAgente: "ua", valorAprovado: 1001, opcaoAprovadaId: "opc-1", opcaoAprovadaNome: "Completa" }],
    ["RECUSADO", { recusadoEm: AGORA, categoriaDaPerda: "PRECO", motivoDaPerda: "caro" }],
    ["APROVADO convertido", { status: "APROVADO", aprovadoEm: AGORA, valorAprovado: 1001, opcaoAprovadaId: "opc-1", reservationId: "reserva-1" }],
  ])("%s: nenhum campo de estado passa para a cópia", (status, estado) => {
    const { proposta, opcoes } = dadosDaDuplicata(original({ status, ...estado }), novo);
    for (const campo of CAMPOS_DE_ESTADO) {
      if (campo === "token") continue;
      expect(proposta).not.toHaveProperty(campo);
    }
    expect(proposta.token).toBe("token-novo");
    for (const o of opcoes) {
      expect(o).not.toHaveProperty("id");
      expect(o).not.toHaveProperty("orcamentoId");
      expect(o).not.toHaveProperty("composicaoDoKit");
    }
    // Sem status e sem versão, o banco aplica os padrões: RASCUNHO, versão 1.
  });

  it("copia o conteúdo comercial compartilhado, festejado incluído", () => {
    const { proposta } = dadosDaDuplicata(original(), novo);
    expect(proposta).toMatchObject({
      userId: "cliente-a",
      clienteNome: "Cliente A",
      clienteTelefone: "49999990000",
      clienteEmail: "a@exemplo.com",
      nomeDoFestejado: "Festejada B",
      tipoDeFesta: "ANIVERSARIO",
      cidade: "Chapecó",
      local: "Salão",
      convidados: 40,
      observacoes: "Tons de azul",
      themeId: "tema",
      mostrarValoresIndividuais: true,
      percentualDoSinal: 30,
      canal: "INSTAGRAM",
      criadoPorId: "admin",
    });
  });

  it("copia todas as opções, na ordem, com nome, kit, imagens e valores", () => {
    const { opcoes } = dadosDaDuplicata(original(), novo);
    expect(opcoes.map((o) => [o.ordem, o.nome, o.kitId, o.total])).toEqual([
      [0, "Essencial", "kit-0", 1000],
      [1, "Completa", "kit-1", 1001],
      [2, "Premium", "kit-2", 1002],
    ]);
    expect(opcoes[1]).toMatchObject({
      descricao: "Descrição Completa",
      imagens: ["https://r2/1-a.webp", "https://r2/1-b.webp"],
      subtotal: 900,
      entrega: 80,
      montagem: 120,
      totalCalculado: 1100,
      valorFinalManual: true,
    });
  });

  it("copia as linhas de cada opção na ordem, sem id nem vínculo com a original", () => {
    const { opcoes } = dadosDaDuplicata(original(), novo);
    for (const o of opcoes) {
      expect(o.itens.map((l) => [l.tipo, l.ordem])).toEqual([["KIT", 0], ["PRODUTO", 1], ["SERVICO", 2]]);
      for (const l of o.itens) {
        expect(l).not.toHaveProperty("id");
        expect(l).not.toHaveProperty("orcamentoId");
        expect(l).not.toHaveProperty("opcaoId");
      }
    }
    expect(opcoes[0].itens[1]).toEqual({ tipo: "PRODUTO", productId: "painel", descricao: "Painel", quantidade: 2, valorUnitario: 100, total: 200, imagemUrl: null, ordem: 1 });
  });

  it("imagens são as mesmas URLs, num array novo", () => {
    const o = original();
    const { opcoes } = dadosDaDuplicata(o, novo);
    const origem = (o.opcoes as ReturnType<typeof opcao>[]).find((x) => x.ordem === 0)!;
    expect(opcoes[0].imagens).toEqual(origem.imagens);
    expect(opcoes[0].imagens).not.toBe(origem.imagens);
  });

  it("validade: o mesmo prazo da original, contado de hoje", () => {
    const { proposta } = dadosDaDuplicata(original(), novo);
    expect(proposta.validoAte.toISOString()).toBe("2026-10-05T15:00:00.000Z");
  });

  it("proposta antiga, de uma opção só, vira cópia de uma opção só", () => {
    const { opcoes } = dadosDaDuplicata(original({ opcoes: [opcao(0, "Opção 1")] }), novo);
    expect(opcoes).toHaveLength(1);
    expect(opcoes[0].nome).toBe("Opção 1");
  });
});
