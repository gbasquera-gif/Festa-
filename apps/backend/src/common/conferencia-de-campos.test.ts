import { describe, expect, it } from "vitest";
import {
  cadastroAlterado,
  camposAlteradosPorOutro,
  dia,
  exigirAntes,
  numero,
  telefone,
  texto,
} from "./conferencia-de-campos";

const N = { telefone, guestCount: numero, date: dia, endereco: texto };

describe("conferência campo a campo", () => {
  it("ninguém mexeu: sem conflito", () => {
    expect(camposAlteradosPorOutro(["endereco"], { endereco: "Rua A" }, { endereco: "Rua A" }, { endereco: "Rua B" }, N)).toEqual([]);
  });

  it("outra pessoa mudou o mesmo campo para outro valor: conflito", () => {
    expect(camposAlteradosPorOutro(["endereco"], { endereco: "Rua A" }, { endereco: "Rua C" }, { endereco: "Rua B" }, N)).toEqual(["endereco"]);
  });

  it("outra pessoa mudou para o mesmo valor que esta tela quer: sem conflito", () => {
    expect(camposAlteradosPorOutro(["endereco"], { endereco: "Rua A" }, { endereco: "Rua B" }, { endereco: "Rua B" }, N)).toEqual([]);
  });

  it("só os campos enviados são conferidos (mudança em outro campo não é conflito)", () => {
    const atual = { endereco: "Rua C", telefone: "49999990000" };
    expect(camposAlteradosPorOutro(["telefone"], { telefone: "49999990000" }, atual, { telefone: "49988887777" }, N)).toEqual([]);
  });

  it("normaliza antes de comparar: espaços, vazio e nulo, telefone, número e dia", () => {
    expect(camposAlteradosPorOutro(["endereco"], { endereco: " Rua A " }, { endereco: "Rua A" }, { endereco: "x" }, N)).toEqual([]);
    expect(camposAlteradosPorOutro(["endereco"], { endereco: "" }, { endereco: null }, { endereco: "x" }, N)).toEqual([]);
    expect(camposAlteradosPorOutro(["guestCount"], { guestCount: "50" }, { guestCount: 50 }, { guestCount: 60 }, N)).toEqual([]);
    expect(camposAlteradosPorOutro(["guestCount"], { guestCount: null }, { guestCount: 80 }, { guestCount: 60 }, N)).toEqual(["guestCount"]);
    expect(
      camposAlteradosPorOutro(["date"], { date: "2027-01-23" }, { date: new Date("2027-01-23T12:00:00.000Z") }, { date: "2027-01-24" }, N),
    ).toEqual([]);
  });

  it("painel sem os valores de antes é recusado, com orientação", () => {
    expect(() => exigirAntes(["telefone"], undefined)).toThrow(/Recarregue/);
    expect(() => exigirAntes(["telefone", "endereco"], { telefone: "x" })).toThrow(/Recarregue/);
    expect(exigirAntes(["endereco"], { endereco: null })).toEqual({ endereco: null });
  });

  it("a recusa nomeia os campos, sem os valores", () => {
    const r = cadastroAlterado(["telefone", "endereco"], { telefone: "o telefone", endereco: "o endereço" }).getResponse() as Record<string, unknown>;
    expect(r.codigo).toBe("CADASTRO_ALTERADO");
    expect(r.campos).toEqual(["telefone", "endereco"]);
    expect(String(r.message)).toContain("o telefone e o endereço");
  });
});
