import { describe, expect, it } from "vitest";
import { FICHA_NOVA, decidirFicha, type FichaCandidata } from "./ficha-da-cliente";

const ficha = (id: string, mudar: Partial<FichaCandidata> = {}): FichaCandidata => ({
  id,
  nome: `Cliente ${id}`,
  email: null,
  telefone: "00000000001",
  criadaEm: new Date("2026-01-01T12:00:00Z"),
  porEmail: false,
  porTelefone: true,
  ...mudar,
});

describe("qual ficha a venda usa", () => {
  it("nenhuma ficha parecida: ficha nova", () => {
    expect(decidirFicha({ candidatas: [] })).toEqual({ tipo: "NOVA" });
  });

  it("uma ficha pelo e-mail: é ela", () => {
    const a = ficha("a", { email: "ana@exemplo.invalid", porEmail: true, porTelefone: false });
    expect(decidirFicha({ emailDigitado: "ANA@exemplo.invalid", candidatas: [a] })).toEqual({ tipo: "EXISTENTE", id: "a" });
  });

  it("uma ficha só pelo telefone, sem e-mail dos dois lados: é ela", () => {
    expect(decidirFicha({ candidatas: [ficha("a")] })).toEqual({ tipo: "EXISTENTE", id: "a" });
  });

  it("ficha antiga só com telefone e venda nova com e-mail: é ela (antes virava ficha nova e o crédito sumia)", () => {
    expect(decidirFicha({ emailDigitado: "nova@exemplo.invalid", candidatas: [ficha("a")] })).toEqual({
      tipo: "EXISTENTE",
      id: "a",
    });
  });

  it("mesmo telefone, e-mails diferentes: pode ser outra pessoa, a operação escolhe", () => {
    const d = decidirFicha({
      emailDigitado: "filha@exemplo.invalid",
      candidatas: [ficha("mae", { email: "mae@exemplo.invalid" })],
    });
    expect(d).toMatchObject({ tipo: "AMBIGUA", podeCriarNova: true });
  });

  it("duas fichas com o mesmo telefone: a operação escolhe (antes valia a mais antiga, em silêncio)", () => {
    const d = decidirFicha({ candidatas: [ficha("a"), ficha("b")] });
    expect(d.tipo).toBe("AMBIGUA");
  });

  it("e-mail de uma ficha e telefone de outra: a operação escolhe", () => {
    const porEmail = ficha("e", { email: "ana@exemplo.invalid", porEmail: true, porTelefone: false });
    const porTelefone = ficha("t", { telefone: "00000000002" });
    const d = decidirFicha({ emailDigitado: "ana@exemplo.invalid", candidatas: [porTelefone, porEmail] });
    expect(d).toMatchObject({ tipo: "AMBIGUA", podeCriarNova: false });
    // A que bate pelo e-mail aparece primeiro.
    expect(d.tipo === "AMBIGUA" && d.candidatas[0].id).toBe("e");
  });

  it("e-mail com outra capitalização em duas fichas antigas: a operação escolhe", () => {
    const d = decidirFicha({
      emailDigitado: "ana@exemplo.invalid",
      candidatas: [
        ficha("a", { email: "Ana@exemplo.invalid", porEmail: true, porTelefone: false }),
        ficha("b", { email: "ana@exemplo.invalid", porEmail: true, porTelefone: false }),
      ],
    });
    expect(d.tipo).toBe("AMBIGUA");
  });

  describe("escolha explícita", () => {
    const candidatas = [ficha("a"), ficha("b")];

    it("uma das fichas possíveis: é ela", () => {
      expect(decidirFicha({ candidatas, escolhida: "b" })).toEqual({ tipo: "EXISTENTE", id: "b" });
    });

    it("uma ficha que não bate com o contato: recusada (não se tira crédito de quem não está na tela)", () => {
      expect(decidirFicha({ candidatas, escolhida: "outra-cliente" })).toEqual({ tipo: "ESCOLHA_INVALIDA" });
      expect(decidirFicha({ candidatas: [], escolhida: "qualquer" })).toEqual({ tipo: "ESCOLHA_INVALIDA" });
    });

    it("ficha nova: permitida quando nenhuma tem o e-mail digitado", () => {
      expect(decidirFicha({ candidatas, escolhida: FICHA_NOVA })).toEqual({ tipo: "NOVA" });
    });

    it("ficha nova com o e-mail de uma existente: recusada", () => {
      const comEmail = [ficha("a", { email: "ana@exemplo.invalid", porEmail: true })];
      expect(decidirFicha({ candidatas: comEmail, escolhida: FICHA_NOVA })).toEqual({ tipo: "ESCOLHA_INVALIDA" });
    });
  });
});
