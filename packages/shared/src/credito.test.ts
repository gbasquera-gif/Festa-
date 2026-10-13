import { describe, expect, it } from "vitest";
import {
  mensagemDeReembolsoPendente,
  reembolsoPendente,
  conciliacaoDoCancelamento,
  creditoAplicadoNaReserva,
  mensagemDePagamentoTardio,
  pendenteDeTratamento,
  extratoDeCredito,
  formatarReais,
  frasesDoTratamento,
  limiteDeAplicacao,
  mensagemDoVoucher,
  motivoDeRecusaDaAplicacao,
  motivoDeRecusaDaDistribuicao,
  numeroDoCredito,
  saldoDeCredito,
  textoDoVoucher,
  type MovimentoDeCredito,
} from "./credito";

/** Valores inventados: o repositório é público. */
const mov = (parcial: Partial<MovimentoDeCredito> & Pick<MovimentoDeCredito, "id" | "tipo" | "valor">): MovimentoDeCredito => ({
  numero: 1,
  criadoEm: "2026-10-01T15:00:00.000Z",
  reservaOrigem: null,
  reservaDestino: null,
  movimentoReferenciaId: null,
  observacao: null,
  criadoPor: "Equipe",
  ...parcial,
});

const gerado = mov({
  id: "g1",
  numero: 7,
  tipo: "CREDITO_GERADO_CANCELAMENTO",
  valor: 300,
  reservaOrigem: { id: "r1", numero: 41 },
});
const usado = mov({
  id: "u1",
  numero: 8,
  tipo: "CREDITO_UTILIZADO",
  valor: -120,
  criadoEm: "2026-10-05T15:00:00.000Z",
  reservaDestino: { id: "r2", numero: 52 },
});
const estorno = mov({
  id: "e1",
  numero: 9,
  tipo: "CREDITO_ESTORNADO",
  valor: 120,
  criadoEm: "2026-10-06T15:00:00.000Z",
  reservaDestino: { id: "r2", numero: 52 },
  movimentoReferenciaId: "u1",
});

describe("saldo de crédito", () => {
  it("é a soma do extrato, em centavos", () => {
    expect(saldoDeCredito([gerado, usado])).toBe(180);
    expect(saldoDeCredito([{ valor: 0.1 }, { valor: 0.2 }])).toBe(0.3);
  });

  it("estorno devolve exatamente o que a utilização tirou", () => {
    expect(saldoDeCredito([gerado, usado, estorno])).toBe(300);
  });

  it("aplicado na reserva é o que saiu e não voltou", () => {
    expect(creditoAplicadoNaReserva([usado])).toBe(120);
    expect(creditoAplicadoNaReserva([usado, estorno])).toBe(0);
    expect(creditoAplicadoNaReserva([])).toBe(0);
  });
});

describe("extrato", () => {
  it("ordena pelo acontecimento e carrega o saldo linha a linha", () => {
    const linhas = extratoDeCredito([estorno, gerado, usado]);
    expect(linhas.map((l) => l.id)).toEqual(["g1", "u1", "e1"]);
    expect(linhas.map((l) => l.saldo)).toEqual([300, 180, 300]);
    expect(linhas[0]).toMatchObject({ credito: 300, utilizacao: null, descricao: "Cancelamento da reserva nº 41" });
    expect(linhas[1]).toMatchObject({ credito: null, utilizacao: 120, descricao: "Usado na reserva nº 52" });
    expect(linhas[2].descricao).toBe("Estorno da utilização na reserva nº 52");
  });

  it("marca a utilização já estornada, para não estornar duas vezes", () => {
    const linhas = extratoDeCredito([gerado, usado, estorno]);
    expect(linhas.find((l) => l.id === "u1")?.estornada).toBe(true);
    expect(linhas.find((l) => l.id === "g1")?.estornada).toBe(false);
  });

  it("a última linha do extrato é o saldo disponível", () => {
    const movimentos = [gerado, usado];
    const linhas = extratoDeCredito(movimentos);
    expect(linhas.at(-1)?.saldo).toBe(saldoDeCredito(movimentos));
  });
});

describe("aplicação de crédito", () => {
  it("limite é o menor entre o saldo da cliente e o que falta pagar", () => {
    expect(limiteDeAplicacao({ saldoDaCliente: 300, total: 1000, recebido: 500, creditoJaAplicado: 0 })).toBe(300);
    expect(limiteDeAplicacao({ saldoDaCliente: 300, total: 1000, recebido: 800, creditoJaAplicado: 0 })).toBe(200);
    expect(limiteDeAplicacao({ saldoDaCliente: 300, total: 1000, recebido: 800, creditoJaAplicado: 200 })).toBe(0);
  });

  it("nunca negativo, nem com recebimento acima do contratado", () => {
    expect(limiteDeAplicacao({ saldoDaCliente: 300, total: 100, recebido: 150, creditoJaAplicado: 0 })).toBe(0);
  });

  it("recusa zero, mais que o saldo e mais que o que falta", () => {
    expect(motivoDeRecusaDaAplicacao({ valor: 0, saldoDaCliente: 300, faltaPagar: 500 })).toMatch(/maior que zero/);
    expect(motivoDeRecusaDaAplicacao({ valor: 300.01, saldoDaCliente: 300, faltaPagar: 500 })).toMatch(/R\$ 300,00 de crédito/);
    expect(motivoDeRecusaDaAplicacao({ valor: 250, saldoDaCliente: 300, faltaPagar: 200 })).toMatch(/R\$ 200,00/);
  });

  it("aceita uso parcial e uso exato", () => {
    expect(motivoDeRecusaDaAplicacao({ valor: 100, saldoDaCliente: 300, faltaPagar: 500 })).toBeNull();
    expect(motivoDeRecusaDaAplicacao({ valor: 300, saldoDaCliente: 300, faltaPagar: 300 })).toBeNull();
  });
});

describe("distribuição do cancelamento", () => {
  it("crédito + reembolso + retenção precisa ser exatamente o pago", () => {
    expect(motivoDeRecusaDaDistribuicao(450, { credito: 300, reembolso: 0, retencao: 150 })).toBeNull();
    expect(motivoDeRecusaDaDistribuicao(450, { credito: 300, reembolso: 0, retencao: 149.99 })).toMatch(
      /exatamente o valor pago \(R\$ 450,00\)\. Hoje soma R\$ 449,99/,
    );
    expect(motivoDeRecusaDaDistribuicao(450, { credito: 300, reembolso: 100, retencao: 150 })).not.toBeNull();
  });

  it("confere em centavos, sem o erro de ponto flutuante", () => {
    expect(motivoDeRecusaDaDistribuicao(0.3, { credito: 0.1, reembolso: 0.2, retencao: 0 })).toBeNull();
  });

  it("recusa valor negativo", () => {
    expect(motivoDeRecusaDaDistribuicao(100, { credito: 150, reembolso: -50, retencao: 0 })).toMatch(/negativo/);
  });

  it("sem nada pago, a única distribuição válida é zero", () => {
    expect(motivoDeRecusaDaDistribuicao(0, { credito: 0, reembolso: 0, retencao: 0 })).toBeNull();
    expect(motivoDeRecusaDaDistribuicao(0, { credito: 10, reembolso: 0, retencao: 0 })).not.toBeNull();
  });

  it("descreve o tratamento em frases", () => {
    const frases = frasesDoTratamento({
      motivo: "Mudança de cidade",
      contratado: 1000,
      recebido: 450,
      creditoAplicadoDevolvido: 200,
      creditoGerado: 300,
      reembolsado: 0,
      reembolsoRealizado: null,
      retido: 150,
      definidoEm: "2026-10-05T15:00:00.000Z",
    });
    expect(frases).toEqual([
      "R$ 300,00 transformados em crédito Festaê",
      "R$ 150,00 retidos (receita de retenção por cancelamento)",
      "R$ 200,00 de crédito Festaê usado nesta festa voltaram ao saldo da cliente",
    ]);
  });

  it("reembolso sai com a data em que saiu", () => {
    const [frase] = frasesDoTratamento({
      motivo: "x",
      contratado: 500,
      recebido: 150,
      creditoAplicadoDevolvido: 0,
      creditoGerado: 0,
      reembolsado: 150,
      reembolsoRealizado: { valor: 150, em: "2026-10-06T12:00:00.000Z" },
      retido: 0,
      definidoEm: "2026-10-05T15:00:00.000Z",
    });
    expect(frase).toBe("R$ 150,00 reembolsados à cliente em 06/10/2026");
  });

  it("reembolso ainda não feito aparece como pendente, sem data", () => {
    const [frase] = frasesDoTratamento({
      motivo: "x",
      contratado: 500,
      recebido: 300,
      creditoAplicadoDevolvido: 0,
      creditoGerado: 0,
      reembolsado: 300,
      reembolsoRealizado: null,
      retido: 0,
      definidoEm: "2026-10-13T15:00:00.000Z",
    });
    expect(frase).toBe("R$ 300,00 a reembolsar à cliente (reembolso pendente)");
  });
});

describe("voucher de crédito", () => {
  it("escreve o valor concedido no texto oficial", () => {
    expect(textoDoVoucher(450)).toBe(
      "Este documento confirma que a Festaê registrou um crédito de R$ 450,00 em favor da cliente acima identificada, disponível para utilização em uma futura contratação, conforme as condições comerciais aplicáveis.",
    );
  });

  it("número de referência com cinco dígitos", () => {
    expect(numeroDoCredito(12)).toBe("00012");
    expect(numeroDoCredito(123456)).toBe("123456");
  });

  it("mensagem chama pelo primeiro nome e não promete validade", () => {
    const msg = mensagemDoVoucher("Neiva Souza", 450);
    expect(msg).toBe(
      [
        "Oi, Neiva! 💛",
        "",
        "Conforme combinado, registramos um crédito de R$ 450,00 em seu cadastro na Festaê para utilização em uma futura festa.",
        "",
        "Estou enviando também o Voucher de Crédito como comprovante.",
        "",
        "Quando quiser utilizar, é só falar com a gente. ✨",
      ].join("\n"),
    );
    expect(msg).not.toMatch(/validade|vence|prazo/i);
  });

  it("formata reais com milhar e centavos", () => {
    expect(formatarReais(1450)).toBe("R$ 1.450,00");
    expect(formatarReais(0.5)).toBe("R$ 0,50");
    expect(formatarReais(1234567.89)).toBe("R$ 1.234.567,89");
  });
});

describe("conciliação do cancelamento com pagamento tardio", () => {
  const tardio = { valor: 200, tratado: false };

  it("pendência explícita enquanto o valor não tem destino", () => {
    expect(pendenteDeTratamento([tardio])).toBe(200);
    expect(mensagemDePagamentoTardio(200)).toBe(
      "Pagamento recebido após o cancelamento: R$ 200,00. Defina o tratamento financeiro.",
    );
    const c = conciliacaoDoCancelamento({
      pagos: [300, 200],
      tratadoNoCancelamento: 300,
      complementares: [],
      pagamentosAposCancelamento: [tardio],
    });
    expect(c).toEqual({ pago: 500, tratadoNoCancelamento: 300, tratadoDepois: 0, pendente: 200, confere: true });
  });

  it("depois do complementar: PAID = tratado no cancelamento + tratado depois", () => {
    const c = conciliacaoDoCancelamento({
      pagos: [300, 200],
      tratadoNoCancelamento: 300,
      complementares: [200],
      pagamentosAposCancelamento: [{ valor: 200, tratado: true }],
    });
    expect(c.pendente).toBe(0);
    expect(c.pago).toBe(c.tratadoNoCancelamento + c.tratadoDepois);
    expect(c.confere).toBe(true);
  });

  it("acusa pagamento que não passou por nenhum dos dois caminhos", () => {
    const c = conciliacaoDoCancelamento({
      pagos: [300, 200, 50],
      tratadoNoCancelamento: 300,
      complementares: [200],
      pagamentosAposCancelamento: [{ valor: 200, tratado: true }],
    });
    expect(c.confere).toBe(false);
  });
});

describe("reembolso a realizar", () => {
  it("pendente até a devolução ser registrada", () => {
    expect(reembolsoPendente([{ reembolsado: 300, realizado: false }])).toBe(300);
    expect(reembolsoPendente([{ reembolsado: 300, realizado: true }])).toBe(0);
    expect(reembolsoPendente([{ reembolsado: 300, realizado: true }, { reembolsado: 200, realizado: false }])).toBe(200);
    expect(reembolsoPendente([{ reembolsado: 0, realizado: false }])).toBe(0);
  });
  it("frase da pendência", () => {
    expect(mensagemDeReembolsoPendente(300)).toBe("Pendência financeira — reembolso de R$ 300,00");
  });
  it("crédito + retenção + reembolso pendente fecham com o pago", () => {
    expect(motivoDeRecusaDaDistribuicao(450, { credito: 100, reembolso: 300, retencao: 50 })).toBeNull();
  });
});
