import { describe, expect, it } from "vitest";
import {
  conflitosDoPedido,
  mensagemDeConflito,
  somarCompromisso,
  temPecaDisponivel,
  type PedidoComprometido,
} from "./item-commitment";

const painel = "prod-painel";
const mesa = "prod-mesa";

function estoque(entradas: Record<string, [string, number]>) {
  return new Map(
    Object.entries(entradas).map(([id, [nome, quantidade]]) => [id, { nome, estoque: quantidade }]),
  );
}

const pedidoDoPainel: PedidoComprometido = {
  itensDoKit: [{ productId: painel, quantity: 1 }],
  itensAvulsos: [],
};

describe("somarCompromisso", () => {
  it("soma item de kit com item avulso, porque saem do mesmo acervo", () => {
    const total = somarCompromisso([
      { itensDoKit: [{ productId: mesa, quantity: 1 }], itensAvulsos: [{ productId: mesa, quantity: 2 }] },
    ]);
    expect(total.get(mesa)).toBe(3);
  });

  it("soma pedidos diferentes do mesmo dia", () => {
    const total = somarCompromisso([pedidoDoPainel, pedidoDoPainel]);
    expect(total.get(painel)).toBe(2);
  });

  it("dia sem reserva não compromete nada", () => {
    expect(somarCompromisso([]).size).toBe(0);
  });
});

describe("conflitosDoPedido", () => {
  it("deixa passar quando cabe no estoque", () => {
    const conflitos = conflitosDoPedido(
      pedidoDoPainel,
      new Map([[painel, 1]]),
      estoque({ [painel]: ["Painel Redondo", 3] }),
    );
    expect(conflitos).toEqual([]);
  });

  it("barra quando o pedido passa do estoque somado ao já reservado", () => {
    const conflitos = conflitosDoPedido(
      pedidoDoPainel,
      new Map([[painel, 2]]),
      estoque({ [painel]: ["Painel Redondo", 2] }),
    );
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0]).toMatchObject({ nome: "Painel Redondo", estoque: 2, jaComprometido: 2, pedido: 1 });
  });

  it("usar a última unidade ainda passa", () => {
    const conflitos = conflitosDoPedido(
      pedidoDoPainel,
      new Map([[painel, 1]]),
      estoque({ [painel]: ["Painel Redondo", 2] }),
    );
    expect(conflitos).toEqual([]);
  });

  // Era o furo real: duas festas no mesmo sábado, cada uma pedindo 30 unidades
  // de um item com estoque 12, e as duas eram aceitas.
  it("barra o exagero mesmo com a agenda tendo vaga", () => {
    const conflitos = conflitosDoPedido(
      { itensDoKit: [], itensAvulsos: [{ productId: mesa, quantity: 30 }] },
      new Map(),
      estoque({ [mesa]: ["Mesa Provençal", 12] }),
    );
    expect(conflitos[0]).toMatchObject({ nome: "Mesa Provençal", pedido: 30 });
  });

  it("relata todos os itens em falta de uma vez, não só o primeiro", () => {
    const conflitos = conflitosDoPedido(
      {
        itensDoKit: [{ productId: painel, quantity: 1 }],
        itensAvulsos: [{ productId: mesa, quantity: 5 }],
      },
      new Map([
        [painel, 1],
        [mesa, 1],
      ]),
      estoque({ [painel]: ["Painel Redondo", 1], [mesa]: ["Mesa Provençal", 2] }),
    );
    expect(conflitos.map((c) => c.nome).sort()).toEqual(["Mesa Provençal", "Painel Redondo"]);
  });

  // Estoque em branco é cadastro incompleto, não item esgotado. Travar a venda
  // por causa de um campo que ninguém preencheu seria pior que o risco.
  it("não barra produto sem estoque cadastrado", () => {
    const conflitos = conflitosDoPedido(pedidoDoPainel, new Map([[painel, 99]]), new Map());
    expect(conflitos).toEqual([]);
  });

  // Com o acervo cadastrado, zero passou a significar "não tenho". O item é
  // reportado com estoque 0 para a loja poder dizer "esgotado" — e não
  // repetir o calendário vermelho sem explicação de antes.
  it("estoque zero é item esgotado e vira conflito", () => {
    const conflitos = conflitosDoPedido(
      pedidoDoPainel,
      new Map(),
      estoque({ [painel]: ["Painel Redondo", 0] }),
    );
    expect(conflitos).toHaveLength(1);
    expect(conflitos[0].estoque).toBe(0);
  });

  it("volta a conferir assim que o estoque é preenchido", () => {
    const conflitos = conflitosDoPedido(
      pedidoDoPainel,
      new Map([[painel, 1]]),
      estoque({ [painel]: ["Painel Redondo", 1] }),
    );
    expect(conflitos).toHaveLength(1);
  });
});

describe("temPecaDisponivel", () => {
  it("zero e negativo significam sem peça para alugar", () => {
    expect(temPecaDisponivel(0)).toBe(false);
    expect(temPecaDisponivel(-1)).toBe(false);
  });

  it("qualquer quantidade positiva tem peça", () => {
    expect(temPecaDisponivel(1)).toBe(true);
  });
});

describe("mensagemDeConflito", () => {
  const conflito = (nome: string) => ({ productId: nome, nome, estoque: 1, jaComprometido: 1, pedido: 1 });

  it("fala no singular com um item só", () => {
    expect(mensagemDeConflito([conflito("Painel Redondo")])).toContain("Painel Redondo já está reservado");
  });

  it("junta os nomes com 'e' quando são vários", () => {
    const texto = mensagemDeConflito([conflito("Painel"), conflito("Mesa"), conflito("Arco")]);
    expect(texto).toContain("Painel, Mesa e Arco já estão reservados");
  });

  it("não expõe o tamanho do acervo para o cliente", () => {
    expect(mensagemDeConflito([conflito("Painel Redondo")])).not.toMatch(/\d/);
  });
});
