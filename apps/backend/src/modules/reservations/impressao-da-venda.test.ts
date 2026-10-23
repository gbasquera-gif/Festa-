import { describe, expect, it } from "vitest";
import { manualReservationSchema, type ManualReservationInput } from "@festae/shared";
import { impressaoDaVenda } from "./impressao-da-venda";

const PRODUTO_A = "cm0produtoa000000000000a";
const PRODUTO_B = "cm0produtob000000000000b";

const venda = (mudar: (v: Record<string, any>) => void = () => {}): ManualReservationInput => {
  const v: Record<string, any> = {
    cliente: { nome: "Cliente Fictícia", telefone: "00000000001" },
    evento: { data: "2026-11-14", tipo: "ANIVERSARIO" },
    produtos: { itens: [{ productId: PRODUTO_A, quantity: 1 }, { productId: PRODUTO_B, quantity: 2 }] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 350, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
    credito: { clienteId: "ficha-1", valor: 120 },
    chaveDeIdempotencia: "0b0c6f6e-8f43-4a5e-9d2a-3f4f1f7e2c11",
  };
  mudar(v);
  return manualReservationSchema.parse(v);
};

describe("impressão da venda manual (envio repetido)", () => {
  const base = impressaoDaVenda(venda());

  it("o mesmo pedido tem a mesma impressão, em qualquer ordem de itens", () => {
    expect(impressaoDaVenda(venda())).toBe(base);
    expect(impressaoDaVenda(venda((v) => v.produtos.itens.reverse()))).toBe(base);
  });

  it("a chave do envio não entra na conta", () => {
    expect(impressaoDaVenda(venda((v) => (v.chaveDeIdempotencia = "1b0c6f6e-8f43-4a5e-9d2a-3f4f1f7e2c11")))).toBe(base);
  });

  it.each([
    ["sinal marcado como recebido", (v: Record<string, any>) => Object.assign(v.financeiro, { sinal: 100, statusPagamento: "PAID" })],
    ["item trocado (mesmo total)", (v: Record<string, any>) => (v.produtos.itens[1].quantity = 3)],
    ["endereço corrigido", (v: Record<string, any>) => Object.assign(v.logistica, { fulfillment: "DELIVERY", endereco: "Rua Fictícia, 10" })],
    ["data da festa", (v: Record<string, any>) => (v.evento.data = "2026-11-15")],
    ["valor do crédito", (v: Record<string, any>) => (v.credito.valor = 100)],
    ["crédito de outra ficha", (v: Record<string, any>) => (v.credito.clienteId = "ficha-2")],
    ["sem crédito", (v: Record<string, any>) => delete v.credito],
    ["nome da cliente", (v: Record<string, any>) => (v.cliente.nome = "Outra Cliente")],
    ["canal de venda", (v: Record<string, any>) => (v.origem = "INSTAGRAM")],
  ])("%s: outra impressão (a correção não some em silêncio)", (_, mudar) => {
    expect(impressaoDaVenda(venda(mudar))).not.toBe(base);
  });
});
