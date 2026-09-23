import { describe, expect, it } from "vitest";
import { periodoComercial, toCentsInt } from "@festae/shared";
import { montarLinha, type ReservaCrua } from "../financeiro/contratos";
import { detalharComercial, detalharPropostas, montarVisaoGeral, type PropostaComDados } from "./visao-geral";
import { lerPeriodo } from "./comercial.controller";

// Quarta, 23/09/2026, meio-dia em Chapecó.
const AGORA = new Date("2026-09-23T15:00:00.000Z");
const SETEMBRO = periodoComercial(2026, "2026-09");

type Opcoes = {
  total?: number;
  pagamentos?: { amount: number; status: string }[];
  cancelada?: boolean;
  migrada?: boolean;
  canal?: string | null;
  tipo?: string | null;
  entrega?: boolean;
  montagem?: boolean;
  confirmadaEm?: string;
};

let seq = 0;
function reserva(dia: string, o: Opcoes = {}): ReservaCrua {
  seq += 1;
  return {
    id: `r${seq}`,
    contractSeq: seq,
    status: o.cancelada ? "CANCELLED" : "CONFIRMED",
    eventDate: new Date(`${dia}T12:00:00.000Z`),
    requestedAt: new Date(`${o.confirmadaEm ?? "2026-08-01"}T12:00:00.000Z`),
    confirmedAt: new Date(`${o.confirmadaEm ?? "2026-08-01"}T12:00:00.000Z`),
    cancelledAt: o.cancelada ? new Date("2026-08-15T12:00:00.000Z") : null,
    rescheduledFrom: null,
    origemDoRegistro: o.migrada ? "MIGRACAO" : "PAINEL",
    referenciaExterna: o.migrada ? `legado-${seq}` : null,
    order: {
      total: o.total ?? 1000,
      fulfillment: o.entrega ? "DELIVERY" : "PICKUP",
      assembly: o.montagem ?? false,
      kit: null,
      event: {
        city: "Chapecó",
        saleChannel: o.canal === undefined ? "WHATSAPP" : o.canal,
        guestCount: null,
        type: o.tipo === undefined ? "ANIVERSARIO" : o.tipo,
        theme: null,
        user: { name: `Cliente ${seq}`, email: null, phone: null },
      },
      payments: (o.pagamentos ?? []).map((p, i) => ({
        id: `p${seq}-${i}`,
        type: "DEPOSIT",
        status: p.status,
        method: "PIX",
        amount: p.amount,
        paidAt: p.status === "PAID" ? new Date("2026-08-10T12:00:00.000Z") : null,
      })),
    },
  } as ReservaCrua;
}

const linhas = (rs: ReservaCrua[]) => rs.map((r) => montarLinha(r, AGORA));

describe("contratado e festas", () => {
  const carteira = linhas([
    reserva("2026-09-05", { total: 1000 }),
    reserva("2026-09-26", { total: 800 }),
    reserva("2026-09-12", { total: 5000, cancelada: true }),
    // Fechada em setembro, festa em outubro: é de outubro.
    reserva("2026-10-03", { total: 700, confirmadaEm: "2026-09-10" }),
  ]);
  const v = montarVisaoGeral(carteira, [], SETEMBRO, AGORA);

  it("cancelada fica fora do contratado e das festas", () => {
    expect(v.contratado.valor).toBe(1800);
    expect(v.festas.total).toBe(2);
    expect(v.contratado.confere).toBe(true);
  });

  it("competência pela data da festa, não do fechamento", () => {
    const outubro = montarVisaoGeral(carteira, [], periodoComercial(2026, "2026-10"), AGORA);
    expect(outubro.contratado.valor).toBe(700);
  });

  it("ticket médio = contratado ÷ festas", () => {
    expect(v.ticketMedio).toEqual({ valor: 900, contratos: 2 });
  });

  it("ticket em centavos, sem dízima", () => {
    const tres = linhas([reserva("2026-09-01", { total: 100 }), reserva("2026-09-02", { total: 100 }), reserva("2026-09-03", { total: 100.01 })]);
    expect(montarVisaoGeral(tres, [], SETEMBRO, AGORA).ticketMedio.valor).toBe(100);
  });

  it("realizadas pela data da festa, futuras o resto", () => {
    expect(v.festas).toEqual({ total: 2, realizadas: 1, futuras: 1 });
  });

  it("período vazio: zero, ticket sem valor", () => {
    const vazio = montarVisaoGeral(carteira, [], periodoComercial(2026, "2026-01"), AGORA);
    expect(vazio.contratado.valor).toBe(0);
    expect(vazio.ticketMedio.valor).toBeNull();
    expect(vazio.festas.total).toBe(0);
    expect(vazio.tiposDeFesta).toEqual([]);
    expect(vazio.canais).toEqual([]);
  });

  it("o ano inteiro soma os meses", () => {
    const ano = montarVisaoGeral(carteira, [], periodoComercial(2026, null), AGORA);
    expect(ano.contratado.valor).toBe(2500);
    expect(ano.festas.total).toBe(3);
  });
});

describe("carteira futura", () => {
  const carteira = linhas([
    reserva("2026-09-23", { total: 1000, pagamentos: [{ amount: 300, status: "PAID" }] }), // hoje: entra
    reserva("2026-10-10", {
      total: 2000,
      pagamentos: [
        { amount: 500, status: "PAID" },
        { amount: 700, status: "PENDING" },
        { amount: 400, status: "FAILED" },
      ],
    }),
    reserva("2026-10-23", { total: 900 }), // dia 30 à frente: fora (janela fecha antes)
    reserva("2026-09-20", { total: 600 }), // passada: fora
    reserva("2026-10-01", { total: 999, cancelada: true }), // cancelada: fora
  ]);
  // O filtro de período não mexe na carteira futura.
  const v = montarVisaoGeral(carteira, [], periodoComercial(2026, "2026-01"), AGORA);

  it("de hoje até 30 dias, vigentes", () => {
    expect(v.carteiraFutura.festas).toBe(2);
    expect(v.carteiraFutura.contratado).toBe(3000);
  });

  it("só PAID conta como recebido; PENDING e FAILED não", () => {
    expect(v.carteiraFutura.recebido).toBe(800);
    expect(v.carteiraFutura.aReceber).toBe(2200);
  });
});

describe("distribuições", () => {
  const carteira = linhas([
    reserva("2026-09-26", { migrada: true, canal: "OUTRO", tipo: "BATIZADO" }), // sábado
    reserva("2026-09-27", { canal: "OUTRO", entrega: true, montagem: true }), // domingo
    reserva("2026-09-19", { canal: null, tipo: null, entrega: true }), // sábado
  ]);
  const v = montarVisaoGeral(carteira, [], SETEMBRO, AGORA);
  const por = (fatias: { chave: string; quantidade: number }[]) =>
    Object.fromEntries(fatias.map((f) => [f.chave, f.quantidade]));

  it("migrado não cai em Outros; OUTRO operacional sim", () => {
    expect(por(v.canais)).toEqual({ HISTORICO_SEM_CANAL: 1, OUTRO: 1, NAO_INFORMADO: 1 });
    expect(v.canais.find((c) => c.chave === "OUTRO")?.rotulo).toBe("Outros");
    expect(v.canais.find((c) => c.chave === "HISTORICO_SEM_CANAL")?.rotulo).toBe("Histórico sem canal");
  });

  it("dia da semana na ordem de segunda a domingo", () => {
    expect(v.diasDaSemana.map((d) => d.chave)).toEqual(["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"]);
    expect(por(v.diasDaSemana)).toMatchObject({ SAB: 2, DOM: 1, SEG: 0 });
  });

  it("atendimento pelo pedido; tipo ausente é Não informado", () => {
    expect(por(v.atendimento)).toEqual({ RETIRADA: 1, ENTREGA: 1, ENTREGA_MONTAGEM: 1 });
    expect(v.tiposDeFesta.find((t) => t.chave === "NAO_INFORMADO")?.rotulo).toBe("Não informado");
  });

  it("sazonalidade: doze meses terminando no corrente", () => {
    expect(v.sazonalidade).toHaveLength(12);
    expect(v.sazonalidade[11]).toMatchObject({ mes: "2026-09", festas: 3 });
  });
});

describe("detalhe reconcilia com o KPI", () => {
  const carteira = linhas([
    reserva("2026-09-05", { total: 1000.1, pagamentos: [{ amount: 1000.1, status: "PAID" }] }),
    reserva("2026-09-28", { total: 800, pagamentos: [{ amount: 300, status: "PAID" }] }),
    reserva("2026-10-02", { total: 1200 }),
    reserva("2026-09-15", { total: 900, cancelada: true }),
  ]);
  const v = montarVisaoGeral(carteira, [], SETEMBRO, AGORA);

  it("Contratado", () => {
    const d = detalharComercial(carteira, "CONTRATADO", SETEMBRO, AGORA);
    expect(toCentsInt(d.totais.contratado)).toBe(toCentsInt(v.contratado.valor));
    expect(d.linhas).toHaveLength(v.contratado.festas);
    expect(d.confere).toBe(true);
  });

  it("Festas", () => {
    const d = detalharComercial(carteira, "FESTAS", SETEMBRO, AGORA);
    expect(d.totais.festas).toBe(v.festas.total);
    expect(d.confere).toBe(true);
  });

  it("Carteira futura", () => {
    const d = detalharComercial(carteira, "CARTEIRA", SETEMBRO, AGORA);
    expect(d.totais.festas).toBe(v.carteiraFutura.festas);
    expect(d.totais.contratado).toBe(v.carteiraFutura.contratado);
    expect(d.totais.saldo).toBe(v.carteiraFutura.aReceber);
    expect(d.confere).toBe(true);
  });
});

describe("detalhe de Propostas", () => {
  const base = {
    createdAt: new Date("2026-09-02T15:00:00.000Z"),
    enviadoEm: new Date("2026-09-03T15:00:00.000Z"),
    validoAte: new Date("2026-10-30T15:00:00.000Z"),
    total: 1000,
    totalCalculado: 1000,
    valorFinalManual: false,
    reservationId: null,
  };
  const propostas: PropostaComDados[] = [
    { ...base, id: "a", numero: 1, cliente: "A", status: "APROVADO", reservationId: "r1", primeiroEnvioEm: new Date("2026-09-03T15:00:00.000Z") },
    { ...base, id: "b", numero: 2, cliente: "B", status: "ENVIADO", primeiroEnvioEm: new Date("2026-09-04T15:00:00.000Z") },
    { ...base, id: "c", numero: 3, cliente: "C", status: "ENVIADO", primeiroEnvioEm: null },
  ];

  it("lista a mesma coorte do KPI", () => {
    const v = montarVisaoGeral([], propostas, SETEMBRO, AGORA);
    const d = detalharPropostas(propostas, SETEMBRO, AGORA);
    expect(d.propostas).toHaveLength(v.funil.enviadas);
    expect(d.propostas.map((p) => p.situacao)).toEqual(["CONVERTIDA", "ENVIADO"]);
    expect(d.confere).toBe(true);
  });
});

describe("período da requisição", () => {
  it("aceita mês, ano inteiro e recusa formato inválido", () => {
    expect(lerPeriodo("2026", "2026-09")).toEqual({ ano: 2026, mes: "2026-09" });
    expect(lerPeriodo("2026", "todos")).toEqual({ ano: 2026, mes: null });
    expect(() => lerPeriodo("2026", "2026-13")).toThrow();
    expect(() => lerPeriodo("26", undefined)).toThrow();
    expect(() => lerPeriodo("2026", "2025-09")).toThrow();
  });
});
