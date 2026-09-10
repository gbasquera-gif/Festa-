import { describe, expect, it } from "vitest";
import {
  dataDaFestaSchema,
  diaDaFesta,
  diaEmChapeco,
  formatarDataDaFesta,
  normalizarDataDaFesta,
} from "./data-da-festa";
import { diasAteAFesta } from "./operacao";

/**
 * O defeito que estes testes existem para não deixar voltar: a loja mandava
 * "2026-09-25", o servidor gravava meia-noite UTC, e todo mundo que lia
 * aquilo no fuso de Chapecó via 24/09 — a cliente no resumo do pedido, a
 * operação na tela de Reservas, e a régua, que dizia "hoje é a festa" na
 * véspera.
 */
describe("normalizarDataDaFesta", () => {
  it("grava o dia que a cliente tocou no calendário, ao meio-dia UTC", () => {
    expect(normalizarDataDaFesta("2026-09-25").toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });

  it("não move a data que já estava no formato certo", () => {
    const ancorada = new Date("2026-09-25T12:00:00.000Z");
    expect(normalizarDataDaFesta(ancorada).toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });

  /**
   * A entrada que a loja manda de verdade é uma string, e é aqui que o dia a
   * menos morre: "2026-09-25" nunca mais vira 24/09 em lugar nenhum.
   */
  it("a string da loja jamais escorrega para o dia anterior", () => {
    const gravado = normalizarDataDaFesta("2026-09-25");
    expect(gravado.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(diaEmChapeco(gravado)).toBe("2026-09-25");
    expect(formatarDataDaFesta(gravado)).toBe("25/09/2026");
  });

  /**
   * O espelho do caso acima: 22h em Chapecó já é o dia seguinte em UTC.
   * Gravar o dia UTC adiantaria a festa.
   */
  it("lê um instante com fuso pelo dia de Chapecó, não pelo de UTC", () => {
    expect(normalizarDataDaFesta("2026-09-25T22:00:00-03:00").toISOString()).toBe(
      "2026-09-25T12:00:00.000Z",
    );
    expect(normalizarDataDaFesta("2026-09-25T01:00:00.000Z").toISOString()).toBe(
      "2026-09-24T12:00:00.000Z",
    );
  });

  it("é idempotente: normalizar duas vezes não anda um dia", () => {
    const uma = normalizarDataDaFesta("2026-09-25");
    const duas = normalizarDataDaFesta(uma);
    expect(duas.toISOString()).toBe(uma.toISOString());
  });

  it("recusa data inválida em vez de gravar NaN", () => {
    expect(() => normalizarDataDaFesta("31 de fevereiro")).toThrow(RangeError);
  });

  /**
   * Meio-dia UTC é o mesmo dia do calendário em toda faixa habitada. É a
   * razão inteira de a âncora ser meio-dia e não meia-noite.
   */
  it("meio-dia UTC continua sendo o mesmo dia em qualquer fuso do mundo", () => {
    const ancora = normalizarDataDaFesta("2026-09-25").getTime();
    for (let offsetHoras = -11; offsetHoras <= 11; offsetHoras++) {
      const local = new Date(ancora + offsetHoras * 3_600_000);
      expect(local.toISOString().slice(0, 10)).toBe("2026-09-25");
    }
  });

  it("atravessa a virada de mês e de ano sem escorregar", () => {
    expect(normalizarDataDaFesta("2026-01-01").toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(normalizarDataDaFesta("2026-12-31").toISOString()).toBe("2026-12-31T12:00:00.000Z");
    expect(normalizarDataDaFesta("2028-02-29").toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });
});

describe("diaEmChapeco", () => {
  it("uma venda das 22h ainda é do dia que a loja viveu", () => {
    expect(diaEmChapeco(new Date("2026-10-01T01:00:00.000Z"))).toBe("2026-09-30");
  });

  it("meio-dia UTC é o mesmo dia lá e aqui", () => {
    expect(diaEmChapeco(new Date("2026-09-25T12:00:00.000Z"))).toBe("2026-09-25");
  });
});

describe("como as telas leem a data", () => {
  it("devolve o mesmo dia para as duas convenções que existiam no banco", () => {
    expect(diaDaFesta("2026-09-25T12:00:00.000Z")).toBe("2026-09-25");
    expect(diaDaFesta("2026-09-25T00:00:00.000Z")).toBe("2026-09-25");
  });

  it("escreve como se lê em voz alta", () => {
    expect(formatarDataDaFesta("2026-09-25T12:00:00.000Z")).toBe("25/09/2026");
    expect(formatarDataDaFesta("2026-09-25")).toBe("25/09/2026");
  });
});

describe("dataDaFestaSchema", () => {
  it("ancora o que a loja manda", () => {
    expect(dataDaFestaSchema.parse("2026-09-25").toISOString()).toBe("2026-09-25T12:00:00.000Z");
  });

  /**
   * Um dia do calendário e um instante são coisas diferentes, e o schema
   * trata cada um pelo que ele é. "2026-09-25" é o dia 25 em qualquer lugar
   * do mundo; "2026-09-25T00:00:00Z" é um instante que, em Chapecó, ainda é
   * a noite do dia 24. Os dois formulários da Festaê mandam a primeira forma
   * — `<input type="date">` nos dois casos — e é ela que precisa ser exata.
   */
  it("separa o dia do calendário do instante", () => {
    expect(dataDaFestaSchema.parse("2026-09-25").toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(dataDaFestaSchema.parse("2026-09-25T00:00:00.000Z").toISOString()).toBe(
      "2026-09-24T12:00:00.000Z",
    );
  });

  it("já ancorado, atravessa sem mexer — normalizar não acumula erro", () => {
    const uma = dataDaFestaSchema.parse("2026-09-25");
    expect(dataDaFestaSchema.parse(uma).toISOString()).toBe(uma.toISOString());
  });

  it("recusa lixo com mensagem em português, sem gravar NaN", () => {
    const r = dataDaFestaSchema.safeParse("amanhã de tarde");
    expect(r.success).toBe(false);
    expect(r.success === false && r.error.issues[0].message).toBe("Data da festa inválida.");
  });
});

/**
 * A parte cara do defeito não era a data errada na tela — era a régua.
 *
 * Uma festa vendida pela loja para o dia 25 aparecia como "hoje é a festa"
 * no dia 24 e como "devolução" no dia 25. A operação seria mandada separar o
 * material um dia antes, e no dia da festa o painel diria que ela já passou.
 */
describe("a régua lê o dia certo, venha a data de onde vier", () => {
  const DIA_25 = [
    ["gravada pela loja, à meia-noite UTC (linhas antigas)", "2026-09-25T00:00:00.000Z"],
    ["gravada ancorada, ao meio-dia UTC (como fica agora)", "2026-09-25T12:00:00.000Z"],
  ] as const;

  it("na véspera, faltando um dia — não 'hoje'", () => {
    const vespera = new Date("2026-09-24T18:00:00.000Z"); // 15h em Chapecó
    for (const [origem, iso] of DIA_25) {
      expect(diasAteAFesta(new Date(iso), vespera), origem).toBe(1);
    }
  });

  it("no dia da festa, faltando zero — não 'devolução'", () => {
    const noDia = new Date("2026-09-25T15:00:00.000Z"); // 12h em Chapecó
    for (const [origem, iso] of DIA_25) {
      expect(diasAteAFesta(new Date(iso), noDia), origem).toBe(0);
    }
  });

  it("às 22h em Chapecó ainda é o dia da festa, mesmo já sendo amanhã em UTC", () => {
    const noiteDaFesta = new Date("2026-09-26T01:00:00.000Z"); // 22h do dia 25 em Chapecó
    for (const [origem, iso] of DIA_25) {
      expect(diasAteAFesta(new Date(iso), noiteDaFesta), origem).toBe(0);
    }
  });

  it("no dia seguinte, é devolução", () => {
    const depois = new Date("2026-09-26T15:00:00.000Z");
    for (const [origem, iso] of DIA_25) {
      expect(diasAteAFesta(new Date(iso), depois), origem).toBe(-1);
    }
  });
});
