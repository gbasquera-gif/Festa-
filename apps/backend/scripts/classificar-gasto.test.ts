import { describe, expect, it } from "vitest";
import { classificarGasto } from "./classificar-gasto";

describe("classificarGasto", () => {
  it("manda para custeio o que não vira coisa nem festa", () => {
    expect(classificarGasto("Patrocinado Meta Ads")).toBe("CUSTEIO");
    expect(classificarGasto("Assinatura E-mail Zoho")).toBe("CUSTEIO");
    expect(classificarGasto("Registro do domínio")).toBe("CUSTEIO");
    expect(classificarGasto("DAS - MEI", "Taxas e Impostos")).toBe("CUSTEIO");
  });

  it("manda para consumo o que some na festa", () => {
    expect(classificarGasto("Balões")).toBe("CONSUMO");
    expect(classificarGasto("Fita de cetim")).toBe("CONSUMO");
    expect(classificarGasto("Compra de bomba encher balão")).toBe("CONSUMO");
  });

  it("o padrão é acervo, porque locação compra sobretudo patrimônio", () => {
    expect(classificarGasto("Painel Romano Toy Story")).toBe("ACERVO");
    expect(classificarGasto("Trio Cilindro Ripados")).toBe("ACERVO");
  });

  it("não confunde termo com pedaço de outra palavra", () => {
    // "Margaridas" contém "das", a sigla do imposto do MEI. Com `includes`
    // estas duas compras de acervo viravam custeio.
    expect(classificarGasto("Display Margaridas")).toBe("ACERVO");
    expect(classificarGasto("Margaridas e boleiras em MDF")).toBe("ACERVO");
    // E o termo de verdade continua casando.
    expect(classificarGasto("DAS - MEI")).toBe("CUSTEIO");
  });

  it("aceita o plural que a operação escreve", () => {
    expect(classificarGasto("Linhas para Tapete")).toBe("CONSUMO");
    expect(classificarGasto("Balões")).toBe("CONSUMO");
  });

  it("custeio ganha de consumo quando os dois termos aparecem", () => {
    // "Curso de balão" é formação, não material de festa.
    expect(classificarGasto("Curso de balão")).toBe("CUSTEIO");
  });
});
