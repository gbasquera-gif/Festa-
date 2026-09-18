import { describe, expect, it } from "vitest";
import {
  apurar,
  filtrarLinhas,
  montarContrato,
  montarLinha,
  ordenarLinhas,
  resumir,
  type ReservaCrua,
} from "./contratos";

/**
 * O que estes testes protegem:
 *
 *   1. pagamento pendente contado como recebido — faria a carteira exibir
 *      como dinheiro um Pix que ainda pode expirar;
 *   2. reserva cancelada somando no total — foi assim que o painel antigo
 *      inflava o faturamento;
 *   3. a situação de pagamento calculada de um jeito aqui e de outro na tela;
 *   4. Decimal do Prisma somado como string, o que concatena em vez de somar.
 */

const BASE: ReservaCrua = {
  id: "res_1",
  contractSeq: 7,
  status: "CONFIRMED",
  eventDate: new Date("2026-10-20T12:00:00.000Z"),
  requestedAt: new Date("2026-09-02T18:34:11.000Z"),
  confirmedAt: new Date("2026-09-02T19:00:00.000Z"),
  cancelledAt: null,
  rescheduledFrom: null,
  origemDoRegistro: "OPERACAO",
  referenciaExterna: null,
  order: {
    total: "920.00",
    fulfillment: "DELIVERY",
    assembly: true,
    kit: { name: "Kit Encanto" },
    event: {
      city: "Chapecó",
      saleChannel: "WHATSAPP",
      guestCount: 40,
      type: "ANIVERSARIO_INFANTIL",
      theme: { name: "Jardim Encantado" },
      user: { name: "Cliente Um", email: null, phone: "49999990000" },
    },
    payments: [
      { id: "p1", type: "DEPOSIT", status: "PAID", method: "PIX", amount: "400.00", paidAt: null },
      { id: "p2", type: "BALANCE", status: "PENDING", method: "PIX", amount: "520.00", paidAt: null },
    ],
  },
};

const reserva = (mudancas: Partial<ReservaCrua>): ReservaCrua => ({ ...BASE, ...mudancas });
const AGORA = new Date("2026-09-18T12:00:00.000Z");

describe("apurar", () => {
  it("lê Decimal como número, não concatena string", () => {
    const apurado = apurar(BASE);
    expect(apurado.valor).toBe(920);
    expect(apurado.recebimentos[0].valor).toBe(400);
  });

  it("só pagamento PAID vira recebimento — pendente é intenção, não dinheiro", () => {
    expect(apurar(BASE).recebimentos).toHaveLength(1);
  });

  it("status fora dos vigentes marca o contrato como cancelado", () => {
    expect(apurar(reserva({ status: "CANCELLED" })).cancelado).toBe(true);
    expect(apurar(reserva({ status: "REJECTED" })).cancelado).toBe(true);
    expect(apurar(reserva({ cancelledAt: new Date() })).cancelado).toBe(true);
    expect(apurar(BASE).cancelado).toBe(false);
  });

  it("PENDING ainda é vigente — solicitação não paga continua valendo dinheiro", () => {
    expect(apurar(reserva({ status: "PENDING" })).cancelado).toBe(false);
  });
});

describe("montarContrato", () => {
  const contrato = montarContrato(BASE, AGORA);

  it("traz contratado, recebido e saldo coerentes entre si", () => {
    expect(contrato.valor).toBe(920);
    expect(contrato.recebido).toBe(400);
    expect(contrato.saldo).toBe(520);
    expect(contrato.valor - contrato.recebido).toBeCloseTo(contrato.saldo, 2);
  });

  it("usa a mesma regra de situação de pagamento do @festae/shared", () => {
    expect(contrato.situacao).toBe("PARCIAL");
    expect(montarContrato(reserva({ eventDate: new Date("2026-09-01T12:00:00Z") }), AGORA).situacao)
      .toBe("VENCIDO");
  });

  it("o saldo vence no dia da festa, porque é quando a cliente paga", () => {
    expect(contrato.venceEm).toBe("2026-10-20");
    expect(contrato.venceEm).toBe(contrato.festaEm);
  });

  it("exibe o dia da festa em UTC, sem o fuso do navegador puxar um dia a menos", () => {
    expect(contrato.festaEm).toBe("2026-10-20");
  });

  it("declara o recebimento sem data em vez de fingir que tem uma", () => {
    expect(contrato.temRecebimentoSemData).toBe(true);
  });

  it("marca como migrado o que veio do painel antigo", () => {
    expect(contrato.migrado).toBe(false);
    expect(montarContrato(reserva({ origemDoRegistro: "MIGRACAO" }), AGORA).migrado).toBe(true);
    expect(montarContrato(reserva({ referenciaExterna: "PF-003" }), AGORA).migrado).toBe(true);
  });

  it("carrega cliente, cidade e canal sem inventar e-mail que não existe", () => {
    expect(contrato.cliente.nome).toBe("Cliente Um");
    expect(contrato.cliente.email).toBeNull();
    expect(contrato.cidade).toBe("Chapecó");
    expect(contrato.canal).toBe("WHATSAPP");
  });

  it("lista só os pagamentos confirmados", () => {
    expect(contrato.pagamentos.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("filtrarLinhas", () => {
  const linhas = [
    montarLinha(BASE, AGORA),
    montarLinha(
      reserva({
        id: "res_2",
        contractSeq: 8,
        eventDate: new Date("2026-09-05T12:00:00.000Z"),
        order: {
          ...BASE.order,
          total: "500.00",
          event: { ...BASE.order.event, city: "Xanxerê", user: { name: "Cliente Dois", email: null, phone: null } },
          payments: [
            { id: "p3", type: "INDETERMINADO", status: "PAID", method: "PIX", amount: "500.00", paidAt: new Date("2026-09-01T12:00:00Z") },
          ],
        },
      }),
      AGORA,
    ),
    montarLinha(
      reserva({ id: "res_3", contractSeq: 9, status: "CANCELLED", cancelledAt: new Date("2026-09-10T12:00:00Z") }),
      AGORA,
    ),
  ];

  it("filtra pelo mês da festa, não pelo mês do contrato", () => {
    // Os três foram fechados em setembro; só um tem festa em setembro.
    expect(filtrarLinhas(linhas, { mes: "2026-09" }).map((l) => l.comercial.numero)).toEqual([8]);
  });

  it("filtra por situação de pagamento", () => {
    expect(filtrarLinhas(linhas, { situacao: "QUITADO" }).map((l) => l.comercial.numero)).toEqual([8]);
    expect(filtrarLinhas(linhas, { situacao: "CANCELADO" }).map((l) => l.comercial.numero)).toEqual([9]);
  });

  it("busca por cliente, cidade e número do contrato, sem diferenciar maiúscula", () => {
    expect(filtrarLinhas(linhas, { busca: "cliente dois" })).toHaveLength(1);
    expect(filtrarLinhas(linhas, { busca: "XANXERÊ" })).toHaveLength(1);
    expect(filtrarLinhas(linhas, { busca: "8" })).toHaveLength(1);
  });

  it("sem filtro devolve tudo, inclusive a cancelada", () => {
    expect(filtrarLinhas(linhas, {})).toHaveLength(3);
  });
});

describe("resumir", () => {
  const linhas = [
    montarLinha(BASE, AGORA), // 920 contratado, 400 recebido, festa futura
    montarLinha(
      reserva({
        id: "res_2",
        eventDate: new Date("2026-09-05T12:00:00.000Z"),
        order: {
          ...BASE.order,
          total: "500.00",
          payments: [
            { id: "p3", type: "DEPOSIT", status: "PAID", method: "PIX", amount: "200.00", paidAt: new Date("2026-09-01T12:00:00Z") },
          ],
        },
      }),
      AGORA,
    ), // vencido: 300 em aberto
    montarLinha(
      reserva({ id: "res_3", status: "CANCELLED", cancelledAt: new Date("2026-09-10T12:00:00Z"), order: { ...BASE.order, total: "9999.00" } }),
      AGORA,
    ),
  ];

  const resumo = resumir(linhas, AGORA);

  it("a cancelada aparece na lista mas não entra em total nenhum", () => {
    expect(linhas).toHaveLength(3);
    expect(resumo.contratos).toBe(2);
    expect(resumo.contratado).toBe(1420);
  });

  it("separa o que venceu do saldo em aberto", () => {
    expect(resumo.saldoEmAberto).toBe(820);
    expect(resumo.vencido).toBe(300);
    expect(resumo.contratosVencidos).toBe(1);
  });

  it("contratado menos recebido fecha com o saldo em aberto", () => {
    expect(resumo.contratado - resumo.recebido).toBeCloseTo(resumo.saldoEmAberto, 2);
  });

  it("conta o recebido sem data, que veio do painel antigo", () => {
    expect(resumo.recebidoSemData).toBe(400);
  });
});

describe("ordenarLinhas", () => {
  const linha = (numero: number, festa: string, total: string, pago: string | null, status = "CONFIRMED") =>
    montarLinha(
      reserva({
        id: `r${numero}`,
        contractSeq: numero,
        status,
        cancelledAt: status === "CANCELLED" ? new Date("2026-09-01T12:00:00Z") : null,
        eventDate: new Date(`${festa}T12:00:00.000Z`),
        order: {
          ...BASE.order,
          total,
          payments: pago
            ? [{ id: `pg${numero}`, type: "DEPOSIT", status: "PAID", method: "PIX", amount: pago, paidAt: new Date("2026-08-01T12:00:00Z") }]
            : [],
        },
      }),
      AGORA,
    );

  const ordenada = ordenarLinhas([
    linha(1, "2026-11-30", "500.00", null),        // aguardando, festa distante
    linha(2, "2026-09-02", "500.00", "100.00"),    // vencido antigo
    linha(3, "2026-08-10", "500.00", "500.00"),    // quitado
    linha(4, "2026-09-15", "500.00", null),        // vencido recente
    linha(5, "2026-09-25", "500.00", "200.00"),    // parcial, festa próxima
    linha(6, "2026-09-20", "500.00", null, "CANCELLED"), // cancelado
  ]);

  it("põe o que venceu no topo, do atraso mais antigo para o mais novo", () => {
    expect(ordenada.slice(0, 2).map((l) => l.comercial.numero)).toEqual([2, 4]);
  });

  it("depois o que ainda vem, da festa mais próxima para a mais distante", () => {
    expect(ordenada.slice(2, 4).map((l) => l.comercial.numero)).toEqual([5, 1]);
  });

  it("quitado e cancelado ficam por último — não pedem ação de ninguém", () => {
    expect(ordenada.slice(4).map((l) => l.comercial.situacao)).toEqual(["QUITADO", "CANCELADO"]);
  });

  it("não perde nem duplica linha ao ordenar", () => {
    expect(ordenada).toHaveLength(6);
    expect(new Set(ordenada.map((l) => l.comercial.numero)).size).toBe(6);
  });
});
