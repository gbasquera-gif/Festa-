import { describe, expect, it } from "vitest";
import {
  ajustesComerciais,
  canalDaVenda,
  diaDaSemanaDaFesta,
  distribuir,
  funilDePropostas,
  janelaFutura,
  mesDaFesta,
  modeloDeAtendimento,
  periodoComercial,
  rotuloDoCanal,
  taxa,
  ultimosDozeMeses,
  type PropostaDoFunil,
} from "./comercial";
import { diaEmChapeco } from "./data-da-festa";

describe("período", () => {
  it("um mês e o ano inteiro", () => {
    expect(periodoComercial(2026, "2026-09")).toEqual({
      rotulo: "2026-09",
      meses: ["2026-09"],
      de: "2026-09-01",
      ate: "2026-10-01",
    });
    const ano = periodoComercial(2026, null);
    expect(ano.meses).toHaveLength(12);
    expect(ano.de).toBe("2026-01-01");
    expect(ano.ate).toBe("2027-01-01");
  });

  it("competência pela data da festa, no último dia do mês", () => {
    expect(mesDaFesta("2026-09-30")).toBe("2026-09");
    expect(mesDaFesta("2026-10-01")).toBe("2026-10");
  });

  it("últimos doze meses atravessam a virada do ano", () => {
    const meses = ultimosDozeMeses(new Date("2026-02-10T15:00:00.000Z"));
    expect(meses[0]).toBe("2025-03");
    expect(meses[11]).toBe("2026-02");
  });

  it("carteira futura começa no dia de Chapecó, não no de UTC", () => {
    // 01h UTC do dia 24 ainda é 22h do dia 23 em Chapecó.
    const janela = janelaFutura(new Date("2026-09-24T01:00:00.000Z"), 30);
    expect(janela).toEqual({ de: "2026-09-23", ate: "2026-10-23" });
  });
});

describe("dia da semana", () => {
  it("segunda primeiro, domingo por último", () => {
    expect(diaDaSemanaDaFesta("2026-09-26")).toBe("SAB");
    expect(diaDaSemanaDaFesta("2026-09-27")).toBe("DOM");
    expect(diaDaSemanaDaFesta("2026-09-28")).toBe("SEG");
  });

  it("festa às 22h30 de sábado em Chapecó continua sábado", () => {
    // Já é domingo em UTC; o dia da festa é o de Chapecó.
    const instante = new Date("2026-09-27T01:30:00.000Z");
    expect(diaDaSemanaDaFesta(diaEmChapeco(instante))).toBe("SAB");
  });
});

describe("atendimento", () => {
  it("vem de entrega e montagem do pedido", () => {
    expect(modeloDeAtendimento("PICKUP", false)).toBe("RETIRADA");
    expect(modeloDeAtendimento("DELIVERY", false)).toBe("ENTREGA");
    expect(modeloDeAtendimento("DELIVERY", true)).toBe("ENTREGA_MONTAGEM");
    expect(modeloDeAtendimento("PICKUP", true)).toBe("RETIRADA_MONTAGEM");
  });
});

describe("canal", () => {
  it("migrado vira histórico, nunca Outros", () => {
    const chave = canalDaVenda({ migrado: true, canal: "OUTRO" });
    expect(rotuloDoCanal(chave)).toBe("Histórico sem canal");
  });

  it("OUTRO operacional continua Outros", () => {
    const chave = canalDaVenda({ migrado: false, canal: "OUTRO" });
    expect(chave).toBe("OUTRO");
    expect(rotuloDoCanal(chave)).toBe("Outros");
  });

  it("sem canal é Não informado", () => {
    expect(rotuloDoCanal(canalDaVenda({ migrado: false, canal: null }))).toBe("Não informado");
  });
});

describe("distribuir", () => {
  it("com ordem fixa mantém zeros e a sequência", () => {
    const fatias = distribuir(["SAB", "SAB", "DOM"], (d) => d, () => 100, ["SEX", "SAB", "DOM"]);
    expect(fatias.map((f) => [f.chave, f.quantidade])).toEqual([
      ["SEX", 0],
      ["SAB", 2],
      ["DOM", 1],
    ]);
    expect(fatias[1].valor).toBe(200);
    expect(fatias.reduce((s, f) => s + f.participacao, 0)).toBeCloseTo(1);
  });

  it("sem itens, participação zero e não NaN", () => {
    expect(distribuir([], () => "x", () => 0, ["x"])[0].participacao).toBe(0);
  });
});

describe("taxa", () => {
  it("base pequena não vira percentual", () => {
    expect(taxa(3, 4)).toEqual({ numerador: 3, denominador: 4, percentual: null, baseSuficiente: false });
  });
  it("base de dez já tem percentual", () => {
    expect(taxa(5, 10).percentual).toBe(0.5);
  });
});

// ---------------------------------------------------------------- funil

const AGORA = new Date("2026-09-23T15:00:00.000Z");
const SETEMBRO = ["2026-09"];

function proposta(id: string, extra: Partial<PropostaDoFunil>): PropostaDoFunil {
  return {
    id,
    createdAt: new Date("2026-09-02T15:00:00.000Z"),
    primeiroEnvioEm: new Date("2026-09-03T15:00:00.000Z"),
    enviadoEm: new Date("2026-09-03T15:00:00.000Z"),
    status: "ENVIADO",
    validoAte: new Date("2026-10-30T15:00:00.000Z"),
    reservationId: null,
    total: 1000,
    totalCalculado: 1000,
    valorFinalManual: false,
    ...extra,
  };
}

describe("funil por coorte", () => {
  const propostas = [
    proposta("aberta", {}),
    proposta("aprovada", { status: "APROVADO" }),
    proposta("convertida", { status: "APROVADO", reservationId: "r1" }),
    proposta("perdida", { status: "RECUSADO" }),
    proposta("expirada", { validoAte: new Date("2026-09-10T15:00:00.000Z") }),
    // Enviada em agosto e aprovada em setembro: é da coorte de agosto.
    proposta("de-agosto", {
      createdAt: new Date("2026-08-20T15:00:00.000Z"),
      primeiroEnvioEm: new Date("2026-08-21T15:00:00.000Z"),
      status: "APROVADO",
    }),
    // De antes do campo existir: enviada, mas sem primeiro envio registrado.
    proposta("antiga", { primeiroEnvioEm: null, status: "APROVADO" }),
    // Rascunho: criada, não enviada.
    proposta("rascunho", { primeiroEnvioEm: null, enviadoEm: null, status: "RASCUNHO" }),
  ];
  const funil = funilDePropostas(propostas, SETEMBRO, AGORA);

  it("base = primeiro envio no período", () => {
    expect(funil.enviadas).toBe(5);
    expect(funil.idsDaCoorte).not.toContain("de-agosto");
    expect(funil.idsDaCoorte).not.toContain("antiga");
  });

  it("aprovadas contam só dentro da coorte", () => {
    expect(funil.aprovadas).toBe(2);
    expect(funil.aprovacao).toMatchObject({ numerador: 2, denominador: 5 });
  });

  it("aprovada → reserva dentro da mesma coorte", () => {
    expect(funil.convertidas).toBe(1);
    expect(funil.conversao).toMatchObject({ numerador: 1, denominador: 2 });
  });

  it("expirada separada de perdida declarada, e os estados fecham a conta", () => {
    expect(funil.perdidasDeclaradas).toBe(1);
    expect(funil.expiradas).toBe(1);
    expect(funil.emAberto).toBe(1);
    expect(funil.aprovadas + funil.perdidasDeclaradas + funil.expiradas + funil.emAberto).toBe(funil.enviadas);
  });

  it("proposta sem primeiro envio fica fora da taxa e é contada à parte", () => {
    expect(funil.semPrimeiroEnvio).toBe(1);
  });

  it("criadas é o conjunto do período, rascunho incluído", () => {
    expect(funil.criadas).toBe(7);
  });
});

describe("ajustes comerciais", () => {
  it("para baixo e para cima somados separadamente", () => {
    const a = ajustesComerciais([
      proposta("baixo", { total: 900, totalCalculado: 1000, valorFinalManual: true }),
      proposta("cima", { total: 1050.5, totalCalculado: 1000, valorFinalManual: true }),
      proposta("igual", { total: 1000, totalCalculado: 1000, valorFinalManual: true }),
      proposta("automatico", {}),
    ]);
    expect(a).toEqual({ negociadas: 2, base: 4, paraBaixo: 100, paraCima: 50.5 });
  });
});
