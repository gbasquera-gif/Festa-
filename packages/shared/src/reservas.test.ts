import { describe, expect, it } from "vitest";
import {
  ehDaAba,
  grupoDeProximidade,
  ordenarParaOperacao,
  situacaoOperacional,
  type ReservaClassificavel,
} from "./reservas";
import type { ReservationStatus } from "./enums";

const AGORA = new Date("2026-09-20T15:00:00.000Z"); // 12h em Chapecó, dia 20

function reserva(
  status: ReservationStatus,
  dia: string,
  total = 1000,
  recebido = 1000,
): ReservaClassificavel {
  return { status, eventDate: `${dia}T12:00:00.000Z`, total, recebido };
}

describe("situacaoOperacional", () => {
  it("conta os dias pelo calendário de Chapecó, não pelo relógio UTC", () => {
    expect(situacaoOperacional(reserva("CONFIRMED", "2026-09-20"), AGORA).diasAteAFesta).toBe(0);
    expect(situacaoOperacional(reserva("CONFIRMED", "2026-09-21"), AGORA).diasAteAFesta).toBe(1);
    expect(situacaoOperacional(reserva("CONFIRMED", "2026-09-13"), AGORA).diasAteAFesta).toBe(-7);
  });

  it("saldo em centavos: contrato quitado não vira pendência eterna", () => {
    const quitado = situacaoOperacional(reserva("CONFIRMED", "2026-10-01", 219.99999, 220), AGORA);
    expect(quitado.pendenciaFinanceira).toBe(false);
  });

  it("marca pendência financeira e operacional separadamente", () => {
    const devendo = situacaoOperacional(reserva("CONFIRMED", "2026-10-01", 1000, 300), AGORA);
    expect(devendo.pendenciaFinanceira).toBe(true);
    expect(devendo.pendenciaOperacional).toBe(false);

    const festaPassouSemFechar = situacaoOperacional(reserva("READY", "2026-09-10"), AGORA);
    expect(festaPassouSemFechar.pendenciaOperacional).toBe(true);
    expect(festaPassouSemFechar.pendenciaFinanceira).toBe(false);
  });

  it("saldo antes da festa não é alarme — é o combinado", () => {
    const antes = situacaoOperacional(reserva("CONFIRMED", "2026-10-01", 1000, 300), AGORA);
    expect(antes.pendenciaFinanceira).toBe(true);
    expect(antes.vencido).toBe(false);
    expect(antes.temPendencia).toBe(false);
  });

  it("saldo depois da festa é atraso, e aí sim alarma", () => {
    const depois = situacaoOperacional(reserva("COMPLETED", "2026-09-10", 1000, 300), AGORA);
    expect(depois.vencido).toBe(true);
    expect(depois.temPendencia).toBe(true);
  });

  it("cancelada nunca tem pendência — não há o que cobrar nem entregar", () => {
    const s = situacaoOperacional(reserva("CANCELLED", "2026-09-10", 1000, 0), AGORA);
    expect(s.cancelada).toBe(true);
    expect(s.temPendencia).toBe(false);
  });
});

describe("ehDaAba", () => {
  it("cancelada e recusada saem de Ativas e Próximas e caem em Canceladas", () => {
    for (const status of ["CANCELLED", "REJECTED"] as ReservationStatus[]) {
      const r = reserva(status, "2026-10-01", 1000, 0);
      expect(ehDaAba(r, "CANCELADAS", AGORA)).toBe(true);
      expect(ehDaAba(r, "ATIVAS", AGORA)).toBe(false);
      expect(ehDaAba(r, "PROXIMAS", AGORA)).toBe(false);
      expect(ehDaAba(r, "CONCLUIDAS", AGORA)).toBe(false);
      expect(ehDaAba(r, "TODAS", AGORA)).toBe(true);
    }
  });

  it("festa entregue e quitada sai de Ativas e vira Concluída", () => {
    const r = reserva("COMPLETED", "2026-09-10", 1000, 1000);
    expect(ehDaAba(r, "CONCLUIDAS", AGORA)).toBe(true);
    expect(ehDaAba(r, "ATIVAS", AGORA)).toBe(false);
  });

  it("festa entregue com saldo aberto continua Ativa — alguém tem de cobrar", () => {
    const r = reserva("COMPLETED", "2026-09-10", 1000, 400);
    expect(ehDaAba(r, "ATIVAS", AGORA)).toBe(true);
    expect(ehDaAba(r, "CONCLUIDAS", AGORA)).toBe(false);
  });

  it("Próximas é hoje em diante, e inclui o dia da festa", () => {
    expect(ehDaAba(reserva("CONFIRMED", "2026-09-20"), "PROXIMAS", AGORA)).toBe(true);
    expect(ehDaAba(reserva("CONFIRMED", "2026-09-19"), "PROXIMAS", AGORA)).toBe(false);
  });

  it("toda reserva cai em exatamente uma entre Ativas, Concluídas e Canceladas", () => {
    const casos: ReservaClassificavel[] = [
      reserva("PENDING", "2026-10-05", 500, 0),
      reserva("CONFIRMED", "2026-09-25", 500, 150),
      reserva("READY", "2026-09-10", 500, 500),
      reserva("COMPLETED", "2026-09-01", 500, 500),
      reserva("COMPLETED", "2026-09-01", 500, 100),
      reserva("CANCELLED", "2026-09-30", 500, 0),
      reserva("REJECTED", "2026-10-30", 500, 0),
    ];
    for (const c of casos) {
      const quantas = (["ATIVAS", "CONCLUIDAS", "CANCELADAS"] as const).filter((aba) =>
        ehDaAba(c, aba, AGORA),
      ).length;
      expect(quantas).toBe(1);
    }
  });
});

describe("ordenarParaOperacao", () => {
  it("o que está em atraso sobe, mesmo com festa antiga", () => {
    const amanha = reserva("CONFIRMED", "2026-09-21", 500, 100);
    const daquiAUmMes = reserva("CONFIRMED", "2026-10-20", 500, 0);
    const atrasadoDeJulho = reserva("COMPLETED", "2026-07-04", 500, 100);
    const ordem = ordenarParaOperacao([amanha, daquiAUmMes, atrasadoDeJulho], AGORA);
    expect(ordem).toEqual([atrasadoDeJulho, amanha, daquiAUmMes]);
  });

  it("sem atraso, a ordem é a da agenda: a festa mais próxima primeiro", () => {
    const perto = reserva("CONFIRMED", "2026-09-22", 500, 100);
    const longe = reserva("CONFIRMED", "2026-12-20", 500, 0);
    expect(ordenarParaOperacao([longe, perto], AGORA)).toEqual([perto, longe]);
  });
});

describe("grupoDeProximidade", () => {
  it("hoje, esta semana e mais adiante", () => {
    expect(grupoDeProximidade(0)).toBe("HOJE");
    expect(grupoDeProximidade(1)).toBe("SEMANA");
    expect(grupoDeProximidade(7)).toBe("SEMANA");
    expect(grupoDeProximidade(8)).toBe("DEPOIS");
  });
});
