import { describe, expect, it } from "vitest";
import { exigirVersao, reservaAlterada, dataDaReservaMudou, versaoDaReserva, type EstadoDaVersao } from "./versao-da-reserva";

const base = (): EstadoDaVersao =>
  ({
    eventDate: new Date("2027-01-23T12:00:00.000Z"),
    notes: null,
    order: {
      kitId: "kit-1",
      subtotalKit: 100,
      subtotalExtras: 0,
      fulfillment: "PICKUP",
      assembly: false,
      deliveryFee: 0,
      assemblyFee: 0,
      ajusteComercial: 0,
      total: 100,
      notes: null,
      kitItems: [
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 2 },
      ],
      items: [{ productId: "p3", quantity: 1 }],
      event: {
        type: "ANIVERSARIO",
        date: new Date("2027-01-23T12:00:00.000Z"),
        guestCount: null,
        themeId: null,
        nomeDoFestejado: null,
        address: "Rua A, 10",
        neighborhood: "Centro",
        city: "Chapecó",
        saleChannel: "WHATSAPP",
        user: { name: "Cliente", phone: "49999990000" },
      },
    },
  }) as unknown as EstadoDaVersao;

describe("versão da reserva", () => {
  it("mesmo estado, mesma versão", () => {
    expect(versaoDaReserva(base())).toBe(versaoDaReserva(base()));
    expect(versaoDaReserva(base())).toMatch(/^[0-9a-f]{32}$/);
  });

  it("a ordem das linhas não muda a versão", () => {
    const b = base();
    b.order.kitItems.reverse();
    expect(versaoDaReserva(b)).toBe(versaoDaReserva(base()));
  });

  it("valor gravado como 100 ou 100.00 é o mesmo valor", () => {
    const b = base();
    (b.order as { total: unknown }).total = "100.00";
    expect(versaoDaReserva(b)).toBe(versaoDaReserva(base()));
  });

  it("muda quando muda o que a edição reescreve", () => {
    const original = versaoDaReserva(base());
    const mudancas: ((b: EstadoDaVersao) => void)[] = [
      (b) => (b.eventDate = new Date("2027-01-24T12:00:00.000Z")), // remarcada
      (b) => (b.order.event.date = new Date("2027-01-24T12:00:00.000Z")),
      (b) => b.order.items.push({ productId: "p4", quantity: 1 }), // item acrescentado
      (b) => (b.order.kitItems[0].quantity = 3),
      (b) => (b.order.kitId = "kit-2"),
      (b) => ((b.order as { total: unknown }).total = 120),
      (b) => ((b.order as { deliveryFee: unknown }).deliveryFee = 30),
      (b) => (b.order.fulfillment = "DELIVERY" as never),
      (b) => (b.order.event.address = "Rua B, 20"),
      (b) => (b.order.event.user!.phone = "49988887777"),
      (b) => (b.notes = "Trocar a cor da toalha"),
    ];
    for (const mudar of mudancas) {
      const b = base();
      mudar(b);
      expect(versaoDaReserva(b)).not.toBe(original);
    }
  });

  it("painel sem versão é recusado com orientação, sem gravar", () => {
    expect(() => exigirVersao(undefined)).toThrow(/Recarregue/);
    expect(() => exigirVersao("")).toThrow(/Recarregue/);
    expect(exigirVersao("abc")).toBe("abc");
  });

  it("as recusas dizem a data atual da festa", () => {
    const a = reservaAlterada("2027-01-24").getResponse() as Record<string, string>;
    expect(a.codigo).toBe("RESERVA_ALTERADA");
    expect(a.dataAtual).toBe("2027-01-24");
    expect(a.message).toContain("24/01/2027");
    const d = dataDaReservaMudou("2027-01-26").getResponse() as Record<string, string>;
    expect(d.codigo).toBe("DATA_DA_RESERVA_MUDOU");
    expect(d.message).toContain("26/01/2027");
  });
});
