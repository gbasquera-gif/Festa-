import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma de mentira: o kit do CATÁLOGO já mudou para A+B+D; a proposta
// congelou A+B+C. O teste prova que a venda lê a proposta, não o catálogo.
const banco = vi.hoisted(() => ({
  produtosExistentes: ["A", "B", "C", "D"] as string[],
}));
vi.mock("@festae/database", () => ({
  prisma: {
    kit: {
      findUnique: async () => ({ id: "kit1", products: [{ productId: "A", quantity: 1 }, { productId: "B", quantity: 2 }, { productId: "D", quantity: 1 }] }),
    },
    product: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.filter((id) => banco.produtosExistentes.includes(id)).map((id) => ({ id, name: id, stockQuantity: 1 })),
    },
    analyticsEvent: { createMany: async () => ({ count: 1 }) },
    reservation: { findMany: async () => [] },
  },
}));

import { ConflictException } from "@nestjs/common";
import { kitDaConversao } from "./kit-da-conversao";
import { ManualReservationService } from "../reservations/manual-reservation.service";

const CONGELADA = {
  kitId: "kit1",
  kitNome: "Kit Essencial",
  itens: [
    { productId: "A", nome: "Painel", quantidade: 1 },
    { productId: "B", nome: "Cilindros", quantidade: 2 },
    { productId: "C", nome: "Bandejas", quantidade: 3 },
  ],
};

describe("kit da conversão", () => {
  it("proposta congelada: a composição dela, peça por peça", () => {
    expect(kitDaConversao({ numero: 1, kitId: "kit1", composicaoDoKit: CONGELADA })).toEqual({
      itens: [
        { productId: "A", nome: "Painel", quantity: 1 },
        { productId: "B", nome: "Cilindros", quantity: 2 },
        { productId: "C", nome: "Bandejas", quantity: 3 },
      ],
    });
  });

  it("proposta antiga sem composição: null (cai no catálogo, como antes)", () => {
    expect(kitDaConversao({ numero: 1, kitId: "kit1", composicaoDoKit: null })).toBeNull();
  });

  it("composição de outro kit: bloqueia, nunca reconstrói", () => {
    expect(() => kitDaConversao({ numero: 7, kitId: "kit2", composicaoDoKit: CONGELADA })).toThrow(ConflictException);
  });
});

describe("venda a partir da composição combinada", () => {
  const entrada = {
    cliente: { nome: "Cliente", telefone: "49999990000" },
    evento: { data: new Date("2029-05-10T12:00:00.000Z"), tipo: "ANIVERSARIO" },
    produtos: { kitId: "kit1", itens: [{ productId: "C", quantity: 1 }] },
    logistica: { fulfillment: "PICKUP", assembly: false, cidade: "Chapecó" },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, ajusteComercial: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  } as never;
  const combinado = kitDaConversao({ numero: 1, kitId: "kit1", composicaoDoKit: CONGELADA })!;

  let conferido: { itensDoKit: unknown; itensAvulsos: unknown } | null;
  const faltaC = { productId: "C", nome: "Bandejas", estoque: 3, jaComprometido: 1, pedido: 4 };
  let conflitos: unknown[];
  const servico = new ManualReservationService({
    conflitosDeItens: async (_data: Date, pedido: { itensDoKit: unknown; itensAvulsos: unknown }) => {
      conferido = pedido;
      return conflitos;
    },
  } as never);

  beforeEach(() => {
    conferido = null;
    conflitos = [faltaC];
    banco.produtosExistentes = ["A", "B", "C", "D"];
  });

  it("confere o estoque da composição congelada (A+B+C), não do catálogo (A+B+D), com o extra junto", async () => {
    await expect(servico.criar(entrada, "admin", { tipo: "CONVERSAO_DE_PROPOSTA" }, combinado)).rejects.toThrow(ConflictException);
    expect(conferido).toEqual({
      itensDoKit: [
        { productId: "A", quantity: 1 },
        { productId: "B", quantity: 2 },
        { productId: "C", quantity: 3 },
      ],
      itensAvulsos: [{ productId: "C", quantity: 1 }],
    });
  });

  it("falta de estoque de C bloqueia com o 409 normal de disponibilidade", async () => {
    const erro = await servico.criar(entrada, "admin", { tipo: "CONVERSAO_DE_PROPOSTA" }, combinado).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({ message: "Faltam itens para esta data." });
  });

  it("sem composição combinada, segue lendo o catálogo (proposta antiga)", async () => {
    await servico.criar(entrada, "admin", { tipo: "CONVERSAO_DE_PROPOSTA" }).catch(() => undefined);
    expect((conferido as { itensDoKit: { productId: string }[] }).itensDoKit.map((i) => i.productId)).toEqual(["A", "B", "D"]);
  });

  it("peça que não existe mais: bloqueia com mensagem clara, antes de conferir estoque", async () => {
    banco.produtosExistentes = ["A", "B", "D"];
    const erro = await servico.criar(entrada, "admin", { tipo: "CONVERSAO_DE_PROPOSTA" }, combinado).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro as Error).message)).toContain("Bandejas");
    expect(conferido).toBeNull();
  });
});
