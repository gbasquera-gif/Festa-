import { describe, expect, it } from "vitest";
import { pendenciasDaReserva, type DadosDaReserva } from "./pendencias";

const base: DadosDaReserva = {
  telefone: "49999990000",
  entrega: false,
  endereco: null,
  sinalPago: true,
  temSinalRegistrado: true,
  saldoEmAberto: 0,
  dias: 20,
};

describe("pendenciasDaReserva", () => {
  it("reserva completa não tem pendência", () => {
    expect(pendenciasDaReserva(base)).toEqual([]);
  });

  it("sem telefone ninguém confirma a festa", () => {
    expect(pendenciasDaReserva({ ...base, telefone: null })).toContain(
      "Telefone do cliente faltando",
    );
  });

  // Endereço em branco só é problema quando alguém precisa chegar lá. Cobrar
  // endereço de quem vai retirar na sede encheria a tela de alarme falso.
  it("endereço só é cobrado quando há entrega", () => {
    expect(pendenciasDaReserva({ ...base, entrega: false, endereco: null })).toEqual([]);
    expect(pendenciasDaReserva({ ...base, entrega: true, endereco: null })).toContain(
      "Endereço faltando para a entrega",
    );
  });

  it("separa 'nenhum pagamento' de 'sinal não pago'", () => {
    expect(
      pendenciasDaReserva({ ...base, temSinalRegistrado: false, sinalPago: false }),
    ).toContain("Nenhum pagamento registrado");
    expect(pendenciasDaReserva({ ...base, sinalPago: false })).toContain("Sinal ainda não pago");
  });

  // Saldo em aberto com dois meses de antecedência é o combinado normal, não
  // pendência. Perto da festa, vira.
  it("saldo só cobra perto da festa", () => {
    expect(pendenciasDaReserva({ ...base, saldoEmAberto: 300, dias: 30 })).toEqual([]);
    expect(pendenciasDaReserva({ ...base, saldoEmAberto: 300, dias: 2 })).toContain(
      "Saldo a receber antes da entrega",
    );
  });

  it("junta tudo que estiver faltando de uma vez", () => {
    const tudo = pendenciasDaReserva({
      telefone: null,
      entrega: true,
      endereco: null,
      sinalPago: false,
      temSinalRegistrado: false,
      saldoEmAberto: 500,
      dias: 1,
    });
    expect(tudo).toHaveLength(4);
  });
});
