import { describe, expect, it } from "vitest";
import { intervaloDoMes, montarFunil, taxa, ticketMedio, ultimosDias } from "./funnel";

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

describe("intervaloDoMes", () => {
  it("começa 1º às 00h de Chapecó, não de Greenwich", () => {
    const agosto = intervaloDoMes("2026-08")!;
    expect(agosto.inicio.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("termina no primeiro instante do mês seguinte", () => {
    expect(intervaloDoMes("2026-08")!.fim.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  // Uma visita das 22h do dia 31 de agosto em Chapecó já é 1º de setembro em
  // UTC. Se a janela fosse UTC, ela sairia de agosto e a soma das colunas do
  // painel não bateria com o que a loja viu acontecer.
  it("mantém no mês a visita da noite do último dia", () => {
    const agosto = intervaloDoMes("2026-08")!;
    const noite = new Date("2026-08-31T22:00:00-03:00");
    expect(noite >= agosto.inicio && noite < agosto.fim).toBe(true);
  });

  it("vira o ano em dezembro", () => {
    expect(intervaloDoMes("2026-12")!.fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("descreve o mês em português para o painel", () => {
    expect(intervaloDoMes("2026-03")!.rotulo).toBe("março de 2026");
  });

  // O mês chega por query string, então qualquer coisa pode vir. Virar
  // "desde 1970" mostraria um número errado com cara de certo.
  it("recusa o que não é mês", () => {
    for (const lixo of ["2026-13", "2026-00", "agosto", "2026-8", "", "2026-08-01"]) {
      expect(intervaloDoMes(lixo)).toBeNull();
    }
  });
});

describe("ultimosDias", () => {
  it("volta a quantidade de dias pedida a partir de agora", () => {
    const agora = new Date("2026-08-28T12:00:00Z");
    const periodo = ultimosDias(30, agora);
    expect(periodo.inicio.toISOString()).toBe("2026-07-29T12:00:00.000Z");
    expect(periodo.fim).toBe(agora);
  });
});
