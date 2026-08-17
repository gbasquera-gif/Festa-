import { describe, expect, it } from "vitest";
import { montarFunil, taxa, ticketMedio } from "./funnel";

describe("taxa", () => {
  it("calcula a conversão com uma casa decimal", () => {
    expect(taxa(4, 15)).toBe(26.7);
  });

  // 0 de 0 não é 0% — é "ainda não dá para dizer". Mostrar 0% faria a loja
  // parecer um fracasso antes de a primeira pessoa entrar.
  it("devolve nulo quando não há base para dividir", () => {
    expect(taxa(0, 0)).toBeNull();
  });

  it("aceita conversão total", () => {
    expect(taxa(3, 3)).toBe(100);
  });
});

describe("montarFunil", () => {
  it("começa na visita e termina no pagamento", () => {
    const degraus = montarFunil(new Map());
    expect(degraus[0].type).toBe("VISITA_LOJA");
    expect(degraus[degraus.length - 1].type).toBe("PAGAMENTO_REALIZADO");
  });

  it("etapa sem evento aparece como zero, e não some da lista", () => {
    const degraus = montarFunil(new Map([["VISITA_LOJA", 10]]));
    expect(degraus.find((d) => d.type === "RESERVA_CRIADA")?.count).toBe(0);
  });

  it("calcula a queda de um degrau para o outro", () => {
    const degraus = montarFunil(
      new Map([
        ["VISITA_LOJA", 100],
        ["ESCOLHA_TEMA", 40],
      ]),
    );
    expect(degraus[0].dropoffRate).toBeNull();
    expect(degraus[1].dropoffRate).toBe(60);
  });
});

describe("ticketMedio", () => {
  it("média das festas pagas", () => {
    expect(ticketMedio([450, 520, 890])).toBe(620);
  });

  // Sem venda o ticket não é R$ 0,00 — ele não existe ainda.
  it("devolve nulo quando ninguém pagou", () => {
    expect(ticketMedio([])).toBeNull();
  });

  it("arredonda para centavos", () => {
    expect(ticketMedio([100, 100, 101])).toBe(100.33);
  });
});
