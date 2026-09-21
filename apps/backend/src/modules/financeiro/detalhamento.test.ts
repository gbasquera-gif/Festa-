import { describe, expect, it } from "vitest";
import { receitaPorCompetencia, totalAReceber } from "@festae/shared";
import { montarLinha, type ReservaCrua } from "./contratos";
import { detalhar, mesesDoEscopo } from "./detalhamento";

const AGORA = new Date("2026-09-20T15:00:00.000Z");

function reserva(
  n: number,
  dia: string,
  total: number,
  pago: number,
  status = "CONFIRMED",
  cancelada = false,
): ReservaCrua {
  return {
    id: `r${n}`,
    contractSeq: n,
    status,
    eventDate: new Date(`${dia}T12:00:00.000Z`),
    requestedAt: new Date("2026-08-01T12:00:00.000Z"),
    confirmedAt: new Date("2026-08-01T12:00:00.000Z"),
    cancelledAt: cancelada ? new Date("2026-08-15T12:00:00.000Z") : null,
    rescheduledFrom: null,
    origemDoRegistro: "PAINEL",
    referenciaExterna: null,
    order: {
      total,
      fulfillment: "PICKUP",
      assembly: false,
      kit: null,
      event: {
        city: "Chapecó",
        saleChannel: "WHATSAPP",
        guestCount: null,
        type: "ANIVERSARIO",
        theme: null,
        user: { name: `Cliente ${n}`, email: null, phone: null },
      },
      payments:
        pago > 0
          ? [
              {
                id: `p${n}`,
                type: "DEPOSIT",
                status: "PAID",
                method: "PIX",
                amount: pago,
                paidAt: new Date("2026-08-10T12:00:00.000Z"),
              },
            ]
          : [],
    },
  };
}

const CARTEIRA = [
  reserva(1, "2026-09-05", 1000, 1000), // setembro, quitada
  reserva(2, "2026-09-25", 800, 300), // setembro, saldo 500
  reserva(3, "2026-10-10", 1200, 0), // outubro, saldo 1200
  reserva(4, "2026-08-15", 500, 500), // agosto, quitada
  reserva(5, "2026-09-30", 900, 0, "CANCELLED", true), // cancelada: fora de tudo
].map((r) => montarLinha(r, AGORA));

const APURADOS = CARTEIRA.filter((l) => l.comercial.vigente).map((l) => l.apurado);

describe("detalhar — A receber", () => {
  const d = detalhar(CARTEIRA, "A_RECEBER", "MES", "2026-09");

  it("fecha exatamente com totalAReceber da regra compartilhada", () => {
    expect(d.totais.saldo).toBe(totalAReceber(APURADOS));
    expect(d.confere).toBe(true);
  });

  it("lista só quem tem saldo, e a cancelada fica de fora", () => {
    expect(d.linhas.map((l) => l.numero)).toEqual([3, 2]); // maior saldo primeiro
    expect(d.linhas.some((l) => l.numero === 5)).toBe(false);
  });

  it("ignora o período: saldo é de hoje, não de um mês", () => {
    expect(d.periodo).toBeNull();
    const outroMes = detalhar(CARTEIRA, "A_RECEBER", "MES", "2026-12");
    expect(outroMes.totais.saldo).toBe(d.totais.saldo);
  });
});

describe("detalhar — Faturamento", () => {
  it("competência é o mês da festa, e bate com receitaPorCompetencia", () => {
    const d = detalhar(CARTEIRA, "FATURAMENTO", "MES", "2026-09");
    expect(d.totais.contratado).toBe(receitaPorCompetencia(APURADOS, "2026-09"));
    expect(d.totais.contratado).toBe(1800);
    expect(d.linhas.map((l) => l.numero)).toEqual([1, 2]);
    expect(d.confere).toBe(true);
  });

  it("no ano acumula de janeiro até o mês escolhido", () => {
    const d = detalhar(CARTEIRA, "FATURAMENTO", "ANO", "2026-09");
    expect(d.totais.contratado).toBe(2300); // agosto 500 + setembro 1800
    expect(d.periodo).toBe("2026");
    expect(d.linhas.map((l) => l.numero)).toEqual([4, 1, 2]);
    expect(d.confere).toBe(true);
  });

  it("outubro não entra no acumulado até setembro", () => {
    const d = detalhar(CARTEIRA, "FATURAMENTO", "ANO", "2026-09");
    expect(d.linhas.some((l) => l.numero === 3)).toBe(false);
  });

  it("mês sem festa devolve lista vazia e total zero, sem quebrar", () => {
    const d = detalhar(CARTEIRA, "FATURAMENTO", "MES", "2026-02");
    expect(d.linhas).toEqual([]);
    expect(d.totais.contratado).toBe(0);
    expect(d.confere).toBe(true);
  });
});

describe("detalhar — Festas", () => {
  it("a contagem é o número de linhas do mesmo recorte", () => {
    const d = detalhar(CARTEIRA, "FESTAS", "MES", "2026-09");
    expect(d.totais.festas).toBe(2);
    expect(d.linhas).toHaveLength(2);
    expect(d.confere).toBe(true);
  });

  it("cancelada não conta como festa do mês", () => {
    const d = detalhar(CARTEIRA, "FESTAS", "MES", "2026-09");
    expect(d.linhas.some((l) => l.numero === 5)).toBe(false);
  });
});

describe("mesesDoEscopo", () => {
  it("um mês, ou janeiro até ele", () => {
    expect(mesesDoEscopo("MES", "2026-09")).toEqual(["2026-09"]);
    expect(mesesDoEscopo("ANO", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});
