import { describe, expect, it, vi } from "vitest";
import { chaveDaTravaDaData, travarDatas } from "./trava-da-data";

/** Uma transação de mentira que só anota as travas pedidas, na ordem. */
function transacao() {
  const chaves: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (_partes: TemplateStringsArray, ...valores: unknown[]) => {
      chaves.push(String(valores[0]));
      return 1;
    }),
  };
  return { tx: tx as never, chaves };
}

describe("trava do acervo do dia", () => {
  it("usa exatamente a chave que a aprovação de proposta já usava", () => {
    // Se o texto mudar, a loja e a aprovação passam a travar coisas
    // diferentes e voltam a vender a mesma peça ao mesmo tempo.
    expect(chaveDaTravaDaData("2026-12-05")).toBe("aprovacao-de-proposta:2026-12-05");
  });

  it("trava pelo dia da festa, não pelo horário", async () => {
    const { tx, chaves } = transacao();
    await travarDatas(tx, [new Date("2026-12-05T12:00:00.000Z")]);
    expect(chaves).toEqual(["aprovacao-de-proposta:2026-12-05"]);
  });

  it("trava os dias em ordem crescente e uma vez cada, venha a lista como vier", async () => {
    const { tx, chaves } = transacao();
    const dias = await travarDatas(tx, [
      new Date("2026-12-09T12:00:00.000Z"),
      new Date("2026-12-05T12:00:00.000Z"),
      new Date("2026-12-09T15:00:00.000Z"),
    ]);
    expect(dias).toEqual(["2026-12-05", "2026-12-09"]);
    expect(chaves).toEqual(["aprovacao-de-proposta:2026-12-05", "aprovacao-de-proposta:2026-12-09"]);
  });

  it("sem datas, não trava nada", async () => {
    const { tx, chaves } = transacao();
    expect(await travarDatas(tx, [])).toEqual([]);
    expect(chaves).toEqual([]);
  });
});
