import { describe, expect, it } from "vitest";
import type { CompromissoDeReserva } from "../availability/availability.service";
import { conflitosDoPedido, type PedidoComprometido } from "../availability/item-commitment";
import { detalharFaltas, type CompromissoDeProposta, type ProdutoParaConferir } from "./disponibilidade-da-proposta";

/**
 * O aviso detalhado da proposta. A decisão é a da reserva
 * (`conflitosDoPedido`); estes testes cobram o detalhamento: todos os itens,
 * quanto falta, por quê e quem segura.
 */

const produtos = new Map<string, ProdutoParaConferir>([
  ["painel", { nome: "Painel Redondo Branco", identificador: "painel-redondo-branco", estoque: 2 }],
  ["cilindro", { nome: "Cilindro Dourado G", identificador: "cilindro-dourado-g", estoque: 1 }],
  ["suporte", { nome: "Suporte de Flores Branco", identificador: "suporte-de-flores-branco", estoque: 3 }],
  ["mesa", { nome: "Mesa Provençal", identificador: "mesa-provencal", estoque: 4 }],
  ["boleira", { nome: "Boleira Espelhada", identificador: "boleira-espelhada", estoque: 0 }],
]);

const reserva = (numero: number, itens: Record<string, number>, parcial: Partial<CompromissoDeReserva> = {}): CompromissoDeReserva => ({
  id: `r${numero}`,
  numero,
  status: "CONFIRMED",
  semSinalVencida: false,
  itens: new Map(Object.entries(itens)),
  ...parcial,
});
const proposta = (numero: number, opcao: string, itens: Record<string, number>): CompromissoDeProposta => ({
  id: `o${numero}`,
  numero,
  opcao,
  itens: new Map(Object.entries(itens)),
});
const avulsos = (itens: Record<string, number>): PedidoComprometido => ({
  itensDoKit: [],
  itensAvulsos: Object.entries(itens).map(([productId, quantity]) => ({ productId, quantity })),
});
const conferir = (
  demanda: PedidoComprometido,
  reservas: CompromissoDeReserva[] = [],
  propostas: CompromissoDeProposta[] = [],
  kit: string | null = null,
) => detalharFaltas({ demanda, reservas, propostas, produtos, kit });

describe("uma opção com um item indisponível", () => {
  it("mostra o item, as quantidades, o motivo e a reserva responsável", () => {
    const { faltas } = conferir(avulsos({ painel: 2, mesa: 1 }), [reserva(42, { painel: 1 })]);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toMatchObject({
      nome: "Painel Redondo Branco",
      identificador: "painel-redondo-branco",
      necessario: 2,
      disponivel: 1,
      faltante: 1,
      motivo: "RESERVADO_EM_OUTRA_FESTA",
      natureza: "OUTRA_FESTA",
    });
    expect(faltas[0].responsaveis).toEqual([
      { tipo: "RESERVA", id: "r42", numero: "FE-0042", detalhe: "confirmada", quantidade: 1, semSinalVencida: false },
    ]);
  });
});

describe("uma opção com vários itens indisponíveis", () => {
  it("lista todos, não só o primeiro", () => {
    const { faltas } = conferir(avulsos({ painel: 2, cilindro: 1, suporte: 3 }), [
      reserva(42, { painel: 1 }),
      reserva(43, { cilindro: 1, suporte: 1 }),
    ]);
    expect(faltas.map((f) => f.nome)).toEqual(["Painel Redondo Branco", "Cilindro Dourado G", "Suporte de Flores Branco"]);
    expect(faltas.find((f) => f.nome === "Cilindro Dourado G")).toMatchObject({ necessario: 1, disponivel: 0, faltante: 1 });
  });
});

describe("várias opções com conflitos diferentes", () => {
  it("cada opção tem as suas faltas", () => {
    const reservas = [reserva(42, { painel: 1, cilindro: 1 })];
    const premium = conferir(avulsos({ painel: 2, cilindro: 1 }), reservas).faltas.map((f) => f.nome);
    const jardim = conferir(avulsos({ suporte: 3, mesa: 1 }), [...reservas, reserva(50, { suporte: 1 })]).faltas.map((f) => f.nome);
    const essencial = conferir(avulsos({ mesa: 2 }), reservas).faltas;
    expect(premium).toEqual(["Painel Redondo Branco", "Cilindro Dourado G"]);
    expect(jardim).toEqual(["Suporte de Flores Branco"]);
    expect(essencial).toEqual([]);
  });
});

describe("itens compartilhados entre opções alternativas", () => {
  it("as opções não somam entre si: cada uma usa a última unidade e as duas cabem", () => {
    // Cilindro: 1 no acervo, nenhuma reserva. Três opções pedem o mesmo cilindro.
    const opcoes = [avulsos({ cilindro: 1 }), avulsos({ cilindro: 1, mesa: 1 }), avulsos({ cilindro: 1, painel: 1 })];
    for (const demanda of opcoes) expect(conferir(demanda).faltas).toEqual([]);
  });
});

describe("quantidades parcialmente disponíveis", () => {
  it("necessário 3, disponível 2, faltante 1", () => {
    const [f] = conferir(avulsos({ suporte: 3 }), [reserva(7, { suporte: 1 })]).faltas;
    expect(f).toMatchObject({ necessario: 3, disponivel: 2, faltante: 1, estoque: 3, comprometido: 1 });
  });

  it("comprometido além do acervo não vira disponível negativo", () => {
    const [f] = conferir(avulsos({ cilindro: 1 }), [reserva(7, { cilindro: 1 }), reserva(8, { cilindro: 1 })]).faltas;
    expect(f).toMatchObject({ disponivel: 0, faltante: 1, comprometido: 2 });
  });
});

describe("orçamento totalmente disponível", () => {
  it("nenhuma falta", () => {
    expect(conferir(avulsos({ painel: 1, mesa: 2 }), [reserva(1, { painel: 1 })]).faltas).toEqual([]);
  });

  it("peça que não está no catálogo passa, como na reserva", () => {
    expect(conferir(avulsos({ "nao-cadastrada": 5 })).faltas).toEqual([]);
  });
});

describe("motivos: conflito real ou inconsistência", () => {
  it("estoque cadastrado zero: inconsistência de cadastro, mesmo sem outra festa", () => {
    const [f] = conferir(avulsos({ boleira: 1 })).faltas;
    expect(f).toMatchObject({ motivo: "SEM_UNIDADES_NO_ACERVO", natureza: "CADASTRO", disponivel: 0, faltante: 1, responsaveis: [] });
  });

  it("a opção pede mais do que o acervo inteiro", () => {
    const [f] = conferir(avulsos({ cilindro: 2 })).faltas;
    expect(f).toMatchObject({ motivo: "PEDIDO_MAIOR_QUE_O_ACERVO", natureza: "ACERVO", faltante: 1 });
  });

  it("proposta aprovada aguardando sinal segura a peça", () => {
    const [f] = conferir(avulsos({ cilindro: 1 }), [], [proposta(12, "Premium", { cilindro: 1 })]).faltas;
    expect(f.motivo).toBe("SEGURADO_POR_PROPOSTA_APROVADA");
    expect(f.responsaveis).toEqual([
      { tipo: "PROPOSTA", id: "o12", numero: "Proposta nº 12", detalhe: "opção Premium", quantidade: 1, semSinalVencida: false },
    ]);
  });

  it("reserva e proposta juntas", () => {
    const [f] = conferir(avulsos({ painel: 1 }), [reserva(3, { painel: 1 })], [proposta(9, "Jardim", { painel: 1 })]).faltas;
    expect(f.motivo).toBe("RESERVA_E_PROPOSTA");
    expect(f.responsaveis.map((r) => r.numero)).toEqual(["FE-0003", "Proposta nº 9"]);
  });

  it("só falta por reserva sem sinal com prazo vencido: inconsistência técnica", () => {
    const vencida = reserva(5, { cilindro: 1 }, { status: "PENDING", semSinalVencida: true });
    const [f] = conferir(avulsos({ cilindro: 1 }), [vencida]).faltas;
    expect(f).toMatchObject({ motivo: "RESERVA_SEM_SINAL_VENCIDA", natureza: "TECNICA" });
    expect(f.responsaveis[0]).toMatchObject({ numero: "FE-0005", detalhe: "aguardando sinal", semSinalVencida: true });
  });

  it("reserva vencida que não muda o resultado não vira a causa", () => {
    // Painel: 2 no acervo. Uma reserva válida segura 2; a vencida, mais 1.
    const reservas = [reserva(1, { painel: 2 }), reserva(2, { painel: 1 }, { status: "PENDING", semSinalVencida: true })];
    const [f] = conferir(avulsos({ painel: 1 }), reservas).faltas;
    expect(f.motivo).toBe("RESERVADO_EM_OUTRA_FESTA");
  });
});

describe("peça do kit", () => {
  it("diz de onde vem a peça: quanto do kit, quanto avulso, e qual kit", () => {
    const demanda: PedidoComprometido = {
      itensDoKit: [{ productId: "painel", quantity: 1 }, { productId: "mesa", quantity: 1 }],
      itensAvulsos: [{ productId: "painel", quantity: 1 }],
    };
    const [f] = conferir(demanda, [reserva(1, { painel: 1 })], [], "Kit Jardim").faltas;
    expect(f).toMatchObject({ nome: "Painel Redondo Branco", necessario: 2, noKit: 1, avulso: 1, kit: "Kit Jardim", faltante: 1 });
  });
});

describe("a decisão é a mesma da reserva", () => {
  it("em 500 combinações aleatórias, os itens em falta são exatamente os de conflitosDoPedido", () => {
    let semente = 7;
    const aleatorio = (n: number) => {
      semente = (semente * 1103515245 + 12345) % 2 ** 31;
      return semente % n;
    };
    const ids = ["painel", "cilindro", "suporte", "mesa", "boleira", "fora"];
    for (let rodada = 0; rodada < 500; rodada++) {
      const pedido: Record<string, number> = {};
      for (const id of ids) if (aleatorio(2)) pedido[id] = 1 + aleatorio(3);
      const reservas = Array.from({ length: aleatorio(3) }, (_, i) =>
        reserva(i + 1, Object.fromEntries(ids.filter(() => aleatorio(2)).map((id) => [id, 1 + aleatorio(2)])), {
          semSinalVencida: aleatorio(4) === 0,
        }),
      );
      const propostas = Array.from({ length: aleatorio(2) }, (_, i) =>
        proposta(i + 100, "X", Object.fromEntries(ids.filter(() => aleatorio(3) === 0).map((id) => [id, 1]))),
      );
      const demanda = avulsos(pedido);
      const comprometido = new Map<string, number>();
      for (const fonte of [...reservas, ...propostas])
        for (const [id, q] of fonte.itens) comprometido.set(id, (comprometido.get(id) ?? 0) + q);
      const estoque = new Map([...produtos].map(([id, p]) => [id, { nome: p.nome, estoque: p.estoque }]));
      const esperado = conflitosDoPedido(demanda, comprometido, estoque).map((c) => c.productId);
      const { faltas } = conferir(demanda, reservas, propostas);
      expect(faltas.map((f) => f.productId)).toEqual(esperado);
      for (const f of faltas) {
        expect(f.faltante).toBeGreaterThan(0);
        expect(f.necessario).toBe(f.disponivel + f.faltante);
        expect(f.responsaveis.reduce((s, r) => s + r.quantidade, 0)).toBe(f.comprometido);
        expect(f.motivo).not.toBe("NAO_IDENTIFICADO");
      }
    }
  });
});
