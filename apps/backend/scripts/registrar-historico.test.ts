import { describe, expect, it } from "vitest";
import { conferirIntegridade, type ContratoHistorico } from "./registrar-historico";

/**
 * A carga histórica não aplica política comercial — mas aplica integridade
 * inteira. Estes testes fixam essa fronteira: o que é fato consumado passa,
 * o que é dado incoerente não.
 */
const base: ContratoHistorico = {
  referenciaExterna: "legado:contrato:001/2026",
  cliente: "Cliente de Teste",
  fechadoEm: new Date("2026-08-26T15:00:00.000Z"),
  festaEm: new Date("2026-08-29T15:00:00.000Z"),
  cidade: "Outra Cidade",
  tipoDeEvento: "BATIZADO",
  entrega: true,
  montagem: true,
  valor: 400,
  recebimentos: [{ valor: 400, tipo: "INDETERMINADO" }],
  excecoes: [],
};

describe("integridade da carga histórica", () => {
  it("aceita entrega fora da cidade atendida", () => {
    // É exatamente o caso que a regra comercial bloquearia numa venda nova.
    // Sobre fato consumado a pergunta não se aplica: a entrega já foi feita.
    expect(conferirIntegridade(base)).toEqual([]);
  });

  it("aceita contrato quitado cujo recebido não se decompõe", () => {
    expect(conferirIntegridade({ ...base, recebimentos: [{ valor: 400, tipo: "INDETERMINADO" }] })).toEqual([]);
  });

  it("recusa recebido maior que o contrato", () => {
    const erro = conferirIntegridade({ ...base, recebimentos: [{ valor: 500, tipo: "DEPOSIT" }] });
    expect(erro).toContain("recebido maior que o valor do contrato");
  });

  it("recusa festa anterior ao contrato", () => {
    const erro = conferirIntegridade({ ...base, festaEm: new Date("2026-08-01T15:00:00.000Z") });
    expect(erro).toContain("data da festa anterior à data do contrato");
  });

  it("recusa contrato sem valor e sem cliente", () => {
    const erro = conferirIntegridade({ ...base, valor: 0, cliente: "  " });
    expect(erro).toContain("valor do contrato não é positivo");
    expect(erro).toContain("contrato sem nome de cliente");
  });

  it("soma as parcelas antes de comparar com o contrato", () => {
    const partido = {
      ...base,
      recebimentos: [
        { valor: 200, tipo: "DEPOSIT" as const },
        { valor: 200, tipo: "INDETERMINADO" as const },
      ],
    };
    expect(conferirIntegridade(partido)).toEqual([]);
    expect(conferirIntegridade({ ...partido, valor: 300 })).toContain(
      "recebido maior que o valor do contrato",
    );
  });
});
