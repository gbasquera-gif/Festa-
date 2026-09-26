import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { orcamentoSchema } from "@festae/shared";
import {
  dadosDasOpcoes,
  espelhoDaOpcao,
  opcaoDeReferencia,
  opcaoEscolhida,
  opcaoParaConverter,
  totaisDaOpcao,
} from "./opcoes";
import { kitDaConversao } from "./kit-da-conversao";

const linha = (descricao: string, valorUnitario: number, quantidade = 1, tipo = "PRODUTO") =>
  ({ tipo, descricao, quantidade, valorUnitario }) as never;

const op = (id: string, ordem: number, extra: Record<string, unknown> = {}) => ({ id, ordem, nome: `Opção ${ordem + 1}`, ...extra });

function entrada(opcoes: unknown[]) {
  return orcamentoSchema.parse({
    cliente: { nome: "Cliente Teste", telefone: "49999990000" },
    festa: { data: "2027-03-10", nomeDoFestejado: "  Festejada  " },
    proposta: {},
    opcoes,
  });
}

describe("opções da proposta — entrada", () => {
  it("aceita 1, 2 e 5+ opções, sem teto comercial de 3", () => {
    for (const n of [1, 2, 5, 8]) {
      const opcoes = Array.from({ length: n }, (_, i) => ({ nome: `Opção ${i + 1}`, itens: [linha("Painel", 100)], valores: {} }));
      expect(entrada(opcoes).opcoes).toHaveLength(n);
    }
  });

  it("recusa proposta sem opção e opção sem item", () => {
    expect(() => entrada([])).toThrow();
    expect(() => entrada([{ nome: "Vazia", itens: [], valores: {} }])).toThrow();
  });

  it("recusa opção sem nome", () => {
    expect(() => entrada([{ nome: "   ", itens: [linha("Painel", 100)], valores: {} }])).toThrow();
  });

  it("festejado é opcional e chega sem espaços", () => {
    expect(entrada([{ nome: "A", itens: [linha("Painel", 100)], valores: {} }]).festa.nomeDoFestejado).toBe("Festejada");
  });
});

describe("opções da proposta — valores", () => {
  it("cada opção tem os seus totais, independentes das outras", () => {
    const [a, b, c] = dadosDasOpcoes(
      entrada([
        { nome: "Essencial", kitId: "", itens: [linha("Kit Essencial", 700, 1, "KIT")], valores: { entrega: 80 } },
        { nome: "Completa", itens: [linha("Kit Completo", 1000, 1, "KIT"), linha("Balões", 5, 40, "BALOES")], valores: { montagem: 150, desconto: 50 } },
        { nome: "Premium", itens: [linha("Kit Premium", 1500, 1, "KIT")], valores: { valorFinal: 1390 } },
      ]).opcoes,
    );
    expect([a.total, b.total, c.total]).toEqual([780, 1300, 1390]);
    expect(b).toMatchObject({ subtotal: 1200, desconto: 50, montagem: 150, totalCalculado: 1300, valorFinalManual: false });
    expect(c).toMatchObject({ totalCalculado: 1500, total: 1390, valorFinalManual: true });
    expect([a.ordem, b.ordem, c.ordem]).toEqual([0, 1, 2]);
    expect(a.kitId).toBeNull();
  });

  it("linhas numeradas por opção, com total em centavos", () => {
    const [a] = dadosDasOpcoes(entrada([{ nome: "A", itens: [linha("Xícara", 16.65, 3), linha("Yoyô", 10)], valores: {} }]).opcoes);
    expect(a.itens.map((l) => [l.descricao, l.total, l.ordem])).toEqual([["Xícara", 49.95, 0], ["Yoyô", 10, 1]]);
  });

  it("valor final negociado por opção", () => {
    const t = totaisDaOpcao({ itens: [linha("Kit", 1000)], valores: { desconto: 0, entrega: 0, montagem: 0, valorFinal: 900 } });
    expect(t).toMatchObject({ total: 900, totalCalculado: 1000, valorFinalManual: true });
  });

  it("o espelho copia kit, imagens e valores da opção", () => {
    const [a] = dadosDasOpcoes(entrada([{ nome: "A", kitId: "", imagens: ["u1", "u2"], itens: [linha("Xícara", 10)], valores: {} }]).opcoes);
    expect(espelhoDaOpcao(a)).toEqual({
      kitId: null, imagens: ["u1", "u2"], subtotal: 10, desconto: 0, entrega: 0, montagem: 0, total: 10, totalCalculado: 10, valorFinalManual: false,
    });
  });
});

describe("opção de referência", () => {
  const opcoes = [op("c", 2), op("a", 0), op("b", 1)];
  it("sem aceite, a primeira pela ordem", () => {
    expect(opcaoDeReferencia({ opcaoAprovadaId: null, opcoes })?.id).toBe("a");
  });
  it("com aceite, a aprovada", () => {
    expect(opcaoDeReferencia({ opcaoAprovadaId: "b", opcoes })?.id).toBe("b");
  });
  it("sem opções, nenhuma", () => {
    expect(opcaoDeReferencia({ opcaoAprovadaId: null, opcoes: [] })).toBeNull();
  });
});

describe("aprovação da opção", () => {
  const tres = [op("a", 0), op("b", 1), op("c", 2)];
  it("a escolhida precisa ser desta proposta", () => {
    expect(opcaoEscolhida(tres, "b").id).toBe("b");
    expect(() => opcaoEscolhida(tres, "de-outra-proposta")).toThrow(BadRequestException);
  });
  it("com várias opções, a escolha é obrigatória", () => {
    expect(() => opcaoEscolhida(tres, undefined)).toThrow("Escolha uma das opções antes de aprovar.");
  });
  it("com uma opção só (toda proposta antiga), ela é a escolhida", () => {
    expect(opcaoEscolhida([op("única", 0)], undefined).id).toBe("única");
  });
  it("sem opção, não há o que aprovar", () => {
    expect(() => opcaoEscolhida([], undefined)).toThrow(ConflictException);
  });
});

describe("conversão: só a opção aprovada vira reserva", () => {
  const tres = [op("a", 0), op("b", 1), op("c", 2)];
  it("a aprovada", () => {
    expect(opcaoParaConverter({ numero: 7, opcaoAprovadaId: "c", opcoes: tres }).id).toBe("c");
  });
  it("aprovada antes das opções existirem: a opção única do backfill", () => {
    expect(opcaoParaConverter({ numero: 7, opcaoAprovadaId: null, opcoes: [op("opc_x", 0)] }).id).toBe("opc_x");
  });
  it("várias opções sem registro da escolha: não adivinha", () => {
    expect(() => opcaoParaConverter({ numero: 7, opcaoAprovadaId: null, opcoes: tres })).toThrow(ConflictException);
  });
  it("aprovada que sumiu: para", () => {
    expect(() => opcaoParaConverter({ numero: 7, opcaoAprovadaId: "z", opcoes: tres })).toThrow(ConflictException);
  });
  it("o kit congelado é o da opção escolhida", () => {
    const escolhida = {
      kitId: "kit-b",
      composicaoDoKit: { kitId: "kit-b", kitNome: "Kit B", itens: [{ productId: "p1", nome: "Painel", quantidade: 2 }] },
    };
    expect(kitDaConversao({ numero: 7, ...escolhida })).toEqual({ itens: [{ productId: "p1", nome: "Painel", quantity: 2 }] });
    expect(() => kitDaConversao({ numero: 7, kitId: "kit-a", composicaoDoKit: escolhida.composicaoDoKit })).toThrow(ConflictException);
  });
});
