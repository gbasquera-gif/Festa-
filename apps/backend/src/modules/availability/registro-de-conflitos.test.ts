import { describe, expect, it, vi } from "vitest";
import { registrarConflitosDeAcervo } from "./registro-de-conflitos";

// O módulo de banco não é carregado: o teste injeta o escritor. O vitest
// iça este mock para antes do import acima.
vi.mock("@festae/database", () => ({ prisma: { analyticsEvent: {} } }));

const conflito = {
  productId: "prod-painel",
  nome: "Painel redondo",
  estoque: 2,
  jaComprometido: 2,
  pedido: 1,
};

describe("registrarConflitosDeAcervo", () => {
  it("grava uma linha por produto em falta, com o mínimo objetivo", async () => {
    const gravado: unknown[] = [];
    await registrarConflitosDeAcervo(
      [conflito],
      new Date("2026-11-14T12:00:00Z"),
      "VENDA_MANUAL",
      undefined,
      { createMany: async (args) => { gravado.push(args); } },
    );
    expect(gravado).toEqual([
      {
        data: [
          {
            type: "CONFLITO_DE_ACERVO",
            metadata: {
              productId: "prod-painel",
              dataDaFesta: "2026-11-14",
              solicitado: 1,
              disponivel: 0,
              contexto: "VENDA_MANUAL",
            },
          },
        ],
      },
    ]);
  });

  it("disponível nunca fica negativo", async () => {
    const gravado: { data: { metadata: { disponivel: number } }[] }[] = [];
    await registrarConflitosDeAcervo(
      [{ ...conflito, estoque: 1, jaComprometido: 3 }],
      new Date("2026-11-14T12:00:00Z"),
      "REAGENDAMENTO",
      "res-1",
      { createMany: async (args) => { gravado.push(args as never); } },
    );
    expect(gravado[0].data[0].metadata.disponivel).toBe(0);
  });

  it("falha ao gravar não vira erro para quem estava vendendo", async () => {
    await expect(
      registrarConflitosDeAcervo(
        [conflito],
        new Date("2026-11-14T12:00:00Z"),
        "EDICAO_DE_RESERVA",
        "res-2",
        { createMany: async () => { throw new Error("tabela fora do ar"); } },
      ),
    ).resolves.toBeUndefined();
  });

  it("sem conflito não grava nada", async () => {
    let chamou = false;
    await registrarConflitosDeAcervo([], new Date(), "LOJA", undefined, {
      createMany: async () => { chamou = true; },
    });
    expect(chamou).toBe(false);
  });
});
