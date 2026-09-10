import { describe, expect, it } from "vitest";
import { montarComprovante, numeroDoContrato, type EntradaDoComprovante } from "./comprovante";

const base: EntradaDoComprovante = {
  contractSeq: 42,
  requestedAt: "2026-09-01T14:00:00.000Z",
  eventDate: "2026-09-25T12:00:00.000Z",
  cliente: { nome: "Renata Alves", telefone: "49911112222", email: "renata@teste.com" },
  festa: {
    tipo: "ANIVERSARIO",
    tema: "Nuvem de Amor",
    convidados: 40,
    cidade: "Chapecó",
    endereco: "Rua das Flores, 100",
    bairro: "Centro",
  },
  logistica: { entrega: true, montagem: true },
  kit: { nome: "Kit Completo" },
  itens: [{ nome: "Placa de Nome Personalizada", quantidade: 2 }],
  valores: { total: 900, entrega: 60, montagem: 50, desconto: 100 },
  pagamentos: [
    { valor: 270, forma: "PIX", pagoEm: "2026-09-01T15:00:00.000Z", recebido: true },
  ],
  observacoes: "  Bolo chega às 15h.  ",
  emitidoEm: new Date("2026-09-10T12:00:00.000Z"),
};

describe("numeroDoContrato", () => {
  it("é legível e ditável por telefone", () => {
    expect(numeroDoContrato(1)).toBe("FE-0001");
    expect(numeroDoContrato(42)).toBe("FE-0042");
    expect(numeroDoContrato(1234)).toBe("FE-1234");
  });

  it("cresce sem quebrar quando passa de quatro dígitos", () => {
    expect(numeroDoContrato(10000)).toBe("FE-10000");
  });

  it("aceita o BigInt que vem do banco", () => {
    expect(numeroDoContrato(42n)).toBe("FE-0042");
  });
});

describe("montarComprovante", () => {
  const c = montarComprovante(base);

  it("traz o número do contrato e as três datas que a cliente confere", () => {
    expect(c.contrato).toBe("FE-0042");
    expect(c.reservadoEm).toBe("01/09/2026");
    expect(c.dataDaFesta).toBe("25/09/2026");
    expect(c.emitidoEm).toBe("10/09/2026");
  });

  /**
   * A conta que o papel afirma é a mesma que gera o Pix. Se divergissem, o
   * comprovante viraria motivo de discussão em vez de prova — e quem tem
   * razão numa discussão dessas é sempre quem está com o papel na mão.
   */
  it("o saldo é o total menos o que entrou, não uma fração do total", () => {
    expect(c.valores.total).toBe(900);
    expect(c.valores.pago).toBe(270);
    expect(c.valores.saldo).toBe(630);
  });

  it("quem pagou sinal de 50% antes da mudança tem o saldo certo", () => {
    const antigo = montarComprovante({
      ...base,
      valores: { ...base.valores, total: 600 },
      pagamentos: [{ valor: 300, forma: "PIX", pagoEm: null, recebido: true }],
    });
    expect(antigo.valores.saldo).toBe(300);
  });

  it("soma vários pagamentos recebidos", () => {
    const varios = montarComprovante({
      ...base,
      pagamentos: [
        { valor: 270, forma: "PIX", pagoEm: null, recebido: true },
        { valor: 200, forma: "PIX", pagoEm: null, recebido: true },
      ],
    });
    expect(varios.valores.pago).toBe(470);
    expect(varios.valores.saldo).toBe(430);
  });

  it("ignora pagamento que ainda não entrou", () => {
    const pendente = montarComprovante({
      ...base,
      pagamentos: [{ valor: 270, forma: "PIX", pagoEm: null, recebido: false }],
    });
    expect(pendente.valores.pago).toBe(0);
    expect(pendente.valores.saldo).toBe(900);
    expect(pendente.pagamentos).toHaveLength(0);
    // Sem dinheiro nenhum, não é comprovante de pagamento e a tela precisa saber.
    expect(pendente.temPagamento).toBe(false);
  });

  it("lista o kit junto dos itens avulsos: é o que vai na festa", () => {
    expect(c.itens).toEqual([
      { descricao: "Kit Completo", quantidade: 1 },
      { descricao: "Placa de Nome Personalizada", quantidade: 2 },
    ]);
  });

  it("funciona sem kit, só com itens avulsos", () => {
    const semKit = montarComprovante({ ...base, kit: null });
    expect(semKit.itens).toEqual([{ descricao: "Placa de Nome Personalizada", quantidade: 2 }]);
  });

  /**
   * Numa retirada, o endereço registrado é a casa da cliente — não tem por
   * que estar impresso num papel que ela vai guardar ou mostrar para alguém.
   */
  it("só imprime endereço de entrega quando há entrega", () => {
    expect(c.logistica.endereco).toBe("Rua das Flores, 100 — Centro");
    const retirada = montarComprovante({ ...base, logistica: { entrega: false, montagem: false } });
    expect(retirada.logistica.endereco).toBeNull();
  });

  it("limpa observação em branco em vez de imprimir espaço", () => {
    expect(c.observacoes).toBe("Bolo chega às 15h.");
    expect(montarComprovante({ ...base, observacoes: "   " }).observacoes).toBeNull();
  });

  it("não imprime saldo negativo para quem pagou a mais", () => {
    const aMais = montarComprovante({
      ...base,
      pagamentos: [{ valor: 1000, forma: "PIX", pagoEm: null, recebido: true }],
    });
    expect(aMais.valores.saldo).toBe(0);
  });
});
