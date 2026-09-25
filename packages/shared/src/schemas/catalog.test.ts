import { describe, expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "./catalog";

describe("atualização de produto", () => {
  it("campo ausente não recebe padrão", () => {
    expect(updateProductSchema.parse({ active: false })).toEqual({ active: false });
    expect(updateProductSchema.parse({ unitPrice: 12.5 })).toEqual({ unitPrice: 12.5 });
    expect(updateProductSchema.parse({})).toEqual({});
  });

  it("0 e false enviados valem", () => {
    expect(updateProductSchema.parse({ stockQuantity: 0 })).toEqual({ stockQuantity: 0 });
    expect(updateProductSchema.parse({ active: false, stockQuantity: 0 })).toEqual({ active: false, stockQuantity: 0 });
  });

  it("texto opcional enviado vazio ou nulo limpa o campo; ausente não aparece", () => {
    expect(updateProductSchema.parse({ description: "" })).toEqual({ description: null });
    expect(updateProductSchema.parse({ imageUrl: null })).toEqual({ imageUrl: null });
    expect(updateProductSchema.parse({ name: "Mesa" })).not.toHaveProperty("description");
  });

  it("nulo não é aceito onde o banco não aceita nulo", () => {
    expect(() => updateProductSchema.parse({ active: null })).toThrow();
    expect(() => updateProductSchema.parse({ category: null })).toThrow();
    expect(() => updateProductSchema.parse({ stockQuantity: -1 })).toThrow();
  });

  it("formulário completo do painel continua passando igual", () => {
    const completo = { name: "Mesa", description: "", category: "MOBILIARIO", unitPrice: 50, stockQuantity: 4, imageUrl: "", partnerId: "", active: true };
    expect(updateProductSchema.parse(completo)).toEqual({ ...completo, description: null, imageUrl: null, partnerId: null });
  });
});

describe("criação de produto", () => {
  it("continua com os padrões de um produto novo", () => {
    expect(createProductSchema.parse({ name: "Peça", unitPrice: 10 })).toMatchObject({ category: "OUTRO", stockQuantity: 0, active: true });
  });
});
