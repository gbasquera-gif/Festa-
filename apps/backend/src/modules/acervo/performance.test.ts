import { describe, expect, it } from "vitest";
import { janelaPassada } from "@festae/shared";
import {
  detalharProduto,
  montarPerformance,
  type ConflitoRegistrado,
  type ProdutoDoAcervo,
  type ReservaDoAcervo,
} from "./performance";
import { lerJanela } from "./acervo.controller";

// Quarta, 23/09/2026, meio-dia em Chapecó.
const AGORA = new Date("2026-09-23T15:00:00.000Z");
const CONGELADO = new Date("2026-09-01T12:00:00.000Z");

const PRODUTOS: ProdutoDoAcervo[] = [
  { id: "painel", nome: "Painel redondo", estoque: 8, ativo: true },
  { id: "mesa", nome: "Mesa provençal", estoque: 4, ativo: true },
  { id: "arco", nome: "Arco de balões", estoque: 2, ativo: true },
  { id: "parado", nome: "Cilindro dourado", estoque: 3, ativo: true },
  { id: "inativo", nome: "Boleira antiga", estoque: 1, ativo: false },
];

let seq = 0;
function reserva(festaEm: string, o: Partial<ReservaDoAcervo> = {}): ReservaDoAcervo {
  seq += 1;
  return {
    id: `r${seq}`,
    numero: seq,
    status: "CONFIRMED",
    cancelada: false,
    festaEm,
    cliente: `Cliente ${seq}`,
    total: 1000,
    kitId: null,
    kitNome: null,
    kitCongeladoEm: CONGELADO,
    itensDoKitCongelado: [],
    itensDoKitAtual: [],
    extras: [],
    temaId: null,
    temaNome: null,
    ...o,
  };
}

function conflito(registradoEm: string, productId: string | null, extra: Partial<ConflitoRegistrado> = {}): ConflitoRegistrado {
  seq += 1;
  return {
    id: `c${seq}`,
    registradoEm: new Date(registradoEm),
    productId,
    dataDaFesta: "2026-10-10",
    solicitado: 2,
    disponivel: 1,
    contexto: "VENDA_MANUAL",
    ...extra,
  };
}

const linha = (p: ReturnType<typeof montarPerformance>, id: string) => p.produtos.find((l) => l.productId === id)!;

describe("uso rastreável por produto", () => {
  const kitCongelado = reserva("2026-09-10", {
    total: 1500,
    kitId: "k1",
    kitNome: "Kit Essencial",
    itensDoKitCongelado: [{ productId: "painel", quantity: 1 }, { productId: "mesa", quantity: 2 }],
    extras: [{ productId: "mesa", quantity: 1 }],
  });
  const soExtra = reserva("2026-09-05", { total: 400, extras: [{ productId: "arco", quantity: 2 }] });
  const cancelada = reserva("2026-09-12", {
    total: 9999,
    cancelada: true,
    status: "CANCELLED",
    extras: [{ productId: "parado", quantity: 1 }],
  });
  const p = montarPerformance([kitCongelado, soExtra, cancelada], PRODUTOS, [], 90, AGORA);

  it("produto via OrderKitItem (kit congelado)", () => {
    expect(linha(p, "painel")).toMatchObject({ festas: 1, quantidade: 1, contratos: 1500 });
  });

  it("produto via OrderItem (extra)", () => {
    expect(linha(p, "arco")).toMatchObject({ festas: 1, quantidade: 2, contratos: 400 });
  });

  it("Kit + Extra na mesma festa: quantidade soma, festa e contrato contam uma vez", () => {
    expect(linha(p, "mesa")).toMatchObject({ festas: 1, quantidade: 3, contratos: 1500 });
  });

  it("reserva cancelada não conta", () => {
    expect(linha(p, "parado")).toMatchObject({ festas: 0, quantidade: 0, contratos: 0, ultimaUtilizacao: null });
  });

  it("KPI de contratos conta cada contrato uma vez, não produto por produto", () => {
    // Somar as linhas daria 1500 (painel) + 1500 (mesa) + 400 (arco).
    expect(p.kpis.contratos).toEqual({ valor: 1900, festas: 2 });
  });

  it("produtos utilizados entre os ativos", () => {
    expect(p.kpis.produtosAtivos).toBe(4);
    expect(p.kpis.produtosUtilizados).toBe(3);
  });

  it("produto inativo sem uso não aparece; nunca utilizado aparece como tal", () => {
    expect(p.produtos.find((l) => l.productId === "inativo")).toBeUndefined();
    expect(linha(p, "parado")).toMatchObject({ nuncaUtilizado: true, semUsoRecente: true });
  });
});

describe("pedido antigo com kit e sem congelamento", () => {
  const antigo = reserva("2026-09-15", {
    kitId: "k1",
    kitNome: "Kit Essencial",
    kitCongeladoEm: null,
    itensDoKitCongelado: [],
    itensDoKitAtual: [{ productId: "painel", quantity: 1 }],
    extras: [{ productId: "arco", quantity: 1 }],
  });
  const antigoFuturo = reserva("2026-10-05", {
    kitId: "k1",
    kitNome: "Kit Essencial",
    kitCongeladoEm: null,
    itensDoKitAtual: [{ productId: "painel", quantity: 3 }],
  });
  const p = montarPerformance([antigo, antigoFuturo], PRODUTOS, [], 90, AGORA);

  it("não ganha a composição atual do kit como histórico", () => {
    expect(linha(p, "painel")).toMatchObject({ festas: 0, ultimaUtilizacao: null });
  });

  it("o avulso dele continua rastreável", () => {
    expect(linha(p, "arco")).toMatchObject({ festas: 1, quantidade: 1 });
  });

  it("aparece na cobertura e no aviso da tabela", () => {
    expect(p.festasSemComposicaoHistorica).toBe(1);
    expect(p.cobertura).toEqual({ festas: 1, rastreaveis: 0, kitSemSnapshot: 1, semItensRegistrados: 0 });
  });

  it("continua na pressão futura pela regra operacional (kit de hoje)", () => {
    const painel = p.pressao.produtos.find((l) => l.productId === "painel")!;
    expect(painel).toMatchObject({ pico: 3, dataDoPico: "2026-10-05", estoque: 8 });
    expect(painel.percentual).toBeCloseTo(3 / 8);
  });

  it("e na próxima utilização", () => {
    expect(linha(p, "painel").proximaUtilizacao).toBe("2026-10-05");
  });

  it("impede afirmar 'sem uso' nos últimos 90 dias", () => {
    expect(p.kpis.semUsoRecente.determinavel).toBe(false);
    expect(p.kpis.semUsoRecente.festasSemComposicao).toBe(1);
  });
});

describe("histórico sem item nenhum (migrado)", () => {
  const migrado = reserva("2026-08-20", { kitCongeladoEm: null, total: 700 });
  const p = montarPerformance([migrado], PRODUTOS, [], 90, AGORA);
  it("entra na cobertura como sem itens e também trava o 'sem uso'", () => {
    expect(p.cobertura).toMatchObject({ festas: 1, semItensRegistrados: 1, rastreaveis: 0 });
    expect(p.kpis.semUsoRecente.determinavel).toBe(false);
    expect(p.kpis.contratos.festas).toBe(0);
  });
});

describe("com cobertura completa, 'sem uso' é determinável", () => {
  const p = montarPerformance(
    [reserva("2026-09-01", { extras: [{ productId: "painel", quantity: 1 }] })],
    PRODUTOS,
    [],
    90,
    AGORA,
  );
  it("conta sem uso e nunca utilizados entre os ativos", () => {
    expect(p.kpis.semUsoRecente).toMatchObject({ determinavel: true, total: 3, nunca: 3, dias: 90 });
  });
});

describe("última e próxima utilização, janelas", () => {
  const reservas = [
    reserva("2026-09-23", { extras: [{ productId: "painel", quantity: 1 }] }), // hoje: é uso
    reserva("2026-05-10", { extras: [{ productId: "painel", quantity: 1 }] }),
    reserva("2025-12-01", { extras: [{ productId: "mesa", quantity: 1 }] }),
    reserva("2026-09-24", { extras: [{ productId: "painel", quantity: 1 }] }), // amanhã
    reserva("2026-10-01", { extras: [{ productId: "painel", quantity: 1 }], status: "CANCELLED", cancelada: true }),
  ];

  it("última = a mais recente até hoje; próxima = a primeira depois de hoje", () => {
    const p = montarPerformance(reservas, PRODUTOS, [], 90, AGORA);
    expect(linha(p, "painel")).toMatchObject({ ultimaUtilizacao: "2026-09-23", proximaUtilizacao: "2026-09-24" });
  });

  it("uso fora da janela não conta nas festas, mas conta na última utilização", () => {
    const p30 = montarPerformance(reservas, PRODUTOS, [], 30, AGORA);
    expect(linha(p30, "mesa")).toMatchObject({ festas: 0, ultimaUtilizacao: "2025-12-01", semUsoRecente: true, nuncaUtilizado: false });
  });

  it.each([
    [30, 1],
    [90, 1],
    [180, 2],
    [365, 2],
  ])("janela de %i dias: %i festa(s) do painel", (dias, festas) => {
    expect(linha(montarPerformance(reservas, PRODUTOS, [], dias, AGORA), "painel").festas).toBe(festas);
  });

  it("a mesa entra só na janela de 365", () => {
    expect(linha(montarPerformance(reservas, PRODUTOS, [], 180, AGORA), "mesa").festas).toBe(0);
    expect(linha(montarPerformance(reservas, PRODUTOS, [], 365, AGORA), "mesa").festas).toBe(1);
  });

  it("janela em dias de calendário de Chapecó", () => {
    // 01h UTC do dia 24 ainda é dia 23 em Chapecó.
    expect(janelaPassada(new Date("2026-09-24T01:00:00.000Z"), 30)).toEqual({ de: "2026-08-25", ate: "2026-09-23" });
    const p = montarPerformance(reservas, PRODUTOS, [], 30, new Date("2026-09-24T01:00:00.000Z"));
    expect(linha(p, "painel").proximaUtilizacao).toBe("2026-09-24");
  });
});

describe("conflitos registrados", () => {
  const conflitos = [
    conflito("2026-09-20T14:00:00.000Z", "arco", { contexto: "LOJA" }),
    conflito("2026-09-22T14:00:00.000Z", "arco"),
    conflito("2026-09-21T14:00:00.000Z", "mesa", { contexto: "REAGENDAMENTO" }),
    conflito("2026-05-01T14:00:00.000Z", "mesa"), // fora de 90 dias
  ];

  it("por produto, no período, pelo dia de registro", () => {
    const p = montarPerformance([], PRODUTOS, conflitos, 90, AGORA);
    expect(p.kpis.conflitos).toBe(3);
    expect(linha(p, "arco").conflitos).toBe(2);
    expect(linha(p, "mesa").conflitos).toBe(1);
    expect(p.conflitos.porProduto[0]).toMatchObject({ productId: "arco", total: 2 });
    expect(p.conflitos.porProduto[0].registros[0].contexto).toBe("VENDA_MANUAL");
  });

  it("sem evento registrado, nenhum conflito é inventado", () => {
    const p = montarPerformance([reserva("2026-09-10", { extras: [{ productId: "arco", quantity: 2 }] })], PRODUTOS, [], 90, AGORA);
    expect(p.kpis.conflitos).toBe(0);
    expect(p.conflitos.porProduto).toEqual([]);
    expect(p.produtos.every((l) => l.conflitos === 0)).toBe(true);
  });
});

describe("kits e temas", () => {
  const reservas = [
    reserva("2026-09-10", { kitId: "k1", kitNome: "Kit Essencial", total: 1000, temaId: "t1", temaNome: "Safari" }),
    reserva("2026-09-11", { kitId: "k1", kitNome: "Kit Essencial", total: 800, kitCongeladoEm: null, temaId: "t1", temaNome: "Safari" }),
    reserva("2026-09-12", { kitId: "k2", kitNome: "Kit Luxo", total: 2000 }),
    reserva("2026-09-13", { total: 300 }),
    reserva("2026-09-14", { kitId: "k2", kitNome: "Kit Luxo", total: 5000, cancelada: true, status: "CANCELLED" }),
  ];
  const p = montarPerformance(reservas, PRODUTOS, [], 90, AGORA);

  it("kit pelo Order.kitId, com ou sem congelamento, sem canceladas", () => {
    expect(p.kits).toEqual([
      { kitId: "k1", nome: "Kit Essencial", festas: 2, contratos: 1800 },
      { kitId: "k2", nome: "Kit Luxo", festas: 1, contratos: 2000 },
    ]);
    expect(p.festasSemKit).toBe(1);
  });

  it("tema pelo Event.themeId, e sem tema não some", () => {
    expect(p.temas).toEqual([
      { temaId: "t1", nome: "Safari", festas: 2, contratos: 1800 },
      { temaId: null, nome: "Sem tema definido", festas: 2, contratos: 2300 },
    ]);
  });
});

describe("pressão futura", () => {
  const reservas = [
    reserva("2026-10-12", { extras: [{ productId: "painel", quantity: 4 }] }),
    reserva("2026-10-12", {
      kitId: "k1",
      itensDoKitCongelado: [{ productId: "painel", quantity: 2 }],
      extras: [],
    }),
    reserva("2026-10-01", { extras: [{ productId: "arco", quantity: 3 }] }), // acima do estoque (2)
    reserva("2026-10-30", { extras: [{ productId: "mesa", quantity: 4 }] }), // fora da janela de 30 dias
    reserva("2026-10-05", { extras: [{ productId: "mesa", quantity: 4 }], status: "CANCELLED", cancelada: true }),
  ];
  const p = montarPerformance(reservas, PRODUTOS, [], 90, AGORA);

  it("pico do dia contra o estoque atual", () => {
    const painel = p.pressao.produtos.find((l) => l.productId === "painel")!;
    expect(painel).toMatchObject({ estoque: 8, pico: 6, dataDoPico: "2026-10-12", acimaDoEstoque: false });
    expect(painel.percentual).toBe(0.75);
  });

  it("acima do estoque é sinalizado e vem primeiro", () => {
    expect(p.pressao.produtos[0]).toMatchObject({ productId: "arco", pico: 3, estoque: 2, acimaDoEstoque: true });
  });

  it("janela de 30 dias a partir de hoje; cancelada não compromete", () => {
    expect(p.pressao).toMatchObject({ de: "2026-09-23", ate: "2026-10-23", dias: 30 });
    expect(p.pressao.produtos.find((l) => l.productId === "mesa")).toBeUndefined();
  });
});

describe("detalhe do produto reconcilia com a tabela", () => {
  const reservas = [
    reserva("2026-09-10", {
      total: 1500,
      kitId: "k1",
      itensDoKitCongelado: [{ productId: "mesa", quantity: 2 }],
      extras: [{ productId: "mesa", quantity: 1 }],
    }),
    reserva("2026-09-01", { total: 350.5, extras: [{ productId: "mesa", quantity: 1 }] }),
    reserva("2026-08-01", { total: 900, itensDoKitCongelado: [{ productId: "mesa", quantity: 2 }], kitId: "k1" }),
  ];

  it("mesmas festas, quantidade e contratos da linha", () => {
    const p = montarPerformance(reservas, PRODUTOS, [], 90, AGORA);
    const d = detalharProduto(reservas, PRODUTOS, [], "mesa", 90, AGORA)!;
    const l = linha(p, "mesa");
    expect(d.totais).toEqual({ festas: l.festas, quantidade: l.quantidade, contratos: l.contratos });
    expect(d.totais).toEqual({ festas: 3, quantidade: 6, contratos: 2750.5 });
    expect(d.confere).toBe(true);
    expect(d.festas.map((f) => f.origem)).toEqual(["KIT_EXTRA", "EXTRA", "KIT"]);
  });

  it("produto inexistente devolve null", () => {
    expect(detalharProduto(reservas, PRODUTOS, [], "nao-existe", 90, AGORA)).toBeNull();
  });
});

describe("período da requisição", () => {
  it("30, 90, 180 ou 365; padrão 90", () => {
    expect(lerJanela(undefined)).toBe(90);
    expect(lerJanela("365")).toBe(365);
    expect(() => lerJanela("60")).toThrow();
    expect(() => lerJanela("abc")).toThrow();
  });
});
