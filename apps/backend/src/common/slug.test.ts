import { describe, expect, it } from "vitest";
import { slugUnico, slugify } from "./slug";

/** Banco de mentira: um conjunto de slugs já ocupados, com o id de cada um. */
function bancoCom(ocupados: Record<string, string>) {
  return async (slug: string) => (ocupados[slug] ? { id: ocupados[slug] } : null);
}

describe("slugify", () => {
  it("tira acento, espaço e maiúscula", () => {
    expect(slugify("Kit Chá de Bebê")).toBe("kit-cha-de-bebe");
    expect(slugify("Painel & Arco — 2m")).toBe("painel-arco-2m");
  });

  it("não deixa traço sobrando nas pontas", () => {
    expect(slugify("  Safari!  ")).toBe("safari");
  });
});

describe("slugUnico", () => {
  it("usa o slug limpo quando ninguém ocupou", async () => {
    const slug = await slugUnico(bancoCom({}), "Kit Festaê Essencial");
    expect(slug).toBe("kit-festae-essencial");
  });

  it("numera a partir do segundo kit com o mesmo nome", async () => {
    const banco = bancoCom({ "kit-festae-essencial": "kit-1" });
    expect(await slugUnico(banco, "Kit Festaê Essencial")).toBe("kit-festae-essencial-2");
  });

  it("pula os números já usados", async () => {
    const banco = bancoCom({
      "kit-festae-essencial": "kit-1",
      "kit-festae-essencial-2": "kit-2",
      "kit-festae-essencial-3": "kit-3",
    });
    expect(await slugUnico(banco, "Kit Festaê Essencial")).toBe("kit-festae-essencial-4");
  });

  // O caso que quebrava o painel sem deixar rastro: kit removido some da tela
  // mas continua no banco com active = false, segurando o slug.
  it("desvia de slug preso por registro desativado", async () => {
    const banco = bancoCom({ "kit-apagado": "kit-inativo" });
    expect(await slugUnico(banco, "Kit Apagado")).toBe("kit-apagado-2");
  });

  it("deixa o próprio registro manter o slug que já é dele", async () => {
    const banco = bancoCom({ "kit-safari": "kit-7" });
    expect(await slugUnico(banco, "Kit Safari", "kit-7")).toBe("kit-safari");
  });

  it("não devolve vazio quando o nome só tem símbolo", async () => {
    expect(await slugUnico(bancoCom({}), "★★★")).toBe("item");
  });

  it("desiste dos números depois de muitas colisões, em vez de travar", async () => {
    const sempreOcupado = async () => ({ id: "outro" });
    const slug = await slugUnico(sempreOcupado, "Kit Repetido");
    expect(slug).toMatch(/^kit-repetido-[a-z0-9]+$/);
    expect(slug).not.toBe("kit-repetido");
  });
});
