import { describe, expect, it } from "vitest";
import { criarGastoSchema, editarGastoSchema } from "./financeiro";

const base = { descricao: "Painel romano", natureza: "ACERVO" as const, valor: 120 };

describe("criarGastoSchema", () => {
  it("exige natureza, e não tem padrão", () => {
    // Sem isso, um balão entra como patrimônio por omissão — que é
    // exatamente o que quebrou o painel antigo.
    const erro = criarGastoSchema.safeParse({ descricao: "Balões", valor: 30 });
    expect(erro.success).toBe(false);
  });

  it("aceita um gasto de acervo com vida útil e valor residual", () => {
    const ok = criarGastoSchema.safeParse({ ...base, vidaUtilMeses: 36, valorResidual: 20 });
    expect(ok.success).toBe(true);
  });

  it("recusa vida útil em consumo — consumo não dura", () => {
    const erro = criarGastoSchema.safeParse({
      descricao: "Balões",
      natureza: "CONSUMO",
      valor: 30,
      vidaUtilMeses: 12,
    });
    expect(erro.success).toBe(false);
  });

  it("recusa vida útil em custeio", () => {
    const erro = criarGastoSchema.safeParse({
      descricao: "Meta Ads",
      natureza: "CUSTEIO",
      valor: 20,
      valorResidual: 5,
    });
    expect(erro.success).toBe(false);
  });

  it("recusa valor residual maior que o de compra", () => {
    const erro = criarGastoSchema.safeParse({ ...base, valorResidual: 200 });
    expect(erro.success).toBe(false);
  });

  it("aceita fornecedor, e aceita ficar sem", () => {
    expect(criarGastoSchema.safeParse({ ...base, fornecedor: "Loja X" }).success).toBe(true);
    expect(criarGastoSchema.safeParse(base).success).toBe(true);
  });

  it("recusa valor zero ou negativo", () => {
    expect(criarGastoSchema.safeParse({ ...base, valor: 0 }).success).toBe(false);
    expect(criarGastoSchema.safeParse({ ...base, valor: -5 }).success).toBe(false);
  });

  it("aceita gasto sem data de pagamento — é conta a pagar", () => {
    const ok = criarGastoSchema.safeParse({ ...base, natureza: "CUSTEIO", venceEm: "2026-10-10" });
    expect(ok.success).toBe(true);
  });
});

describe("editarGastoSchema", () => {
  it("aceita mudar um campo só", () => {
    expect(editarGastoSchema.safeParse({ valor: 99 }).success).toBe(true);
    expect(editarGastoSchema.safeParse({ fornecedor: "Outra loja" }).success).toBe(true);
  });

  it("mantém a regra cruzada quando a natureza vem junto", () => {
    const erro = editarGastoSchema.safeParse({ natureza: "CONSUMO", vidaUtilMeses: 24 });
    expect(erro.success).toBe(false);
  });

  it("aceita objeto vazio sem explodir", () => {
    expect(editarGastoSchema.safeParse({}).success).toBe(true);
  });
});
