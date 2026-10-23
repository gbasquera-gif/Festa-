import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Um localStorage de mentira, como o do navegador. */
function armazenamento(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, String(v)),
    removeItem: (k: string) => void dados.delete(k),
    dados,
  };
}

/** Um window mínimo, só com o evento de outra aba. */
function janela() {
  const ouvintes: ((e: { key: string; newValue: string | null }) => void)[] = [];
  return {
    addEventListener: (_tipo: string, f: (e: { key: string; newValue: string | null }) => void) => void ouvintes.push(f),
    disparar: (key: string, newValue: string | null) => ouvintes.forEach((f) => f({ key, newValue })),
  };
}

async function carregar(inicial?: Record<string, string>, quebrado = false) {
  vi.resetModules();
  const ls = armazenamento(inicial);
  const w = janela();
  vi.stubGlobal(
    "localStorage",
    quebrado
      ? {
          getItem: () => {
            throw new Error("bloqueado");
          },
          setItem: () => {
            throw new Error("bloqueado");
          },
        }
      : ls,
  );
  vi.stubGlobal("window", w);
  const modulo = await import("./privacidade");
  return { ...modulo, ls, w };
}

describe("olho dos valores (privacidade visual)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("começa mostrando os valores", async () => {
    const { valoresOcultos, formatoPara } = await carregar();
    expect(valoresOcultos()).toBe(false);
    expect(formatoPara(false).brl(12450)).toMatch(/^R\$\s12\.450,00$/);
  });

  it("aceita o decimal que a API manda como texto", async () => {
    const { formatoPara, VALOR_OCULTO } = await carregar();
    expect(formatoPara(false).brl("350.00")).toMatch(/^R\$\s350,00$/);
    expect(formatoPara(true).brl("350.00")).toBe(VALOR_OCULTO);
  });

  it("escondido: dinheiro vira R$ •••••, nunca zero", async () => {
    const { formatoPara, VALOR_OCULTO } = await carregar();
    const f = formatoPara(true);
    expect(f.brl(12450)).toBe(VALOR_OCULTO);
    expect(f.brl(0)).toBe(VALOR_OCULTO);
    expect(f.brl(-300)).toBe(VALOR_OCULTO);
    expect(f.formatarReais(99.9)).toBe(VALOR_OCULTO);
    expect(VALOR_OCULTO).toBe("R$ •••••");
    expect(f.numero(1234.5)).toBe("•••••");
    expect(f.pct(0.125)).toBe("••%");
  });

  it("sem dado continua sem dado: o traço não vira máscara", async () => {
    const { formatoPara } = await carregar();
    expect(formatoPara(true).pct(null)).toBe("—");
    expect(formatoPara(false).pct(null)).toBe("—");
  });

  it("a máscara não muda o número: revelar mostra exatamente o valor de antes", async () => {
    const { formatoPara } = await carregar();
    const valor = 1234.56;
    const antes = formatoPara(false).brl(valor);
    formatoPara(true).brl(valor);
    expect(formatoPara(false).brl(valor)).toBe(antes);
  });

  it("a escolha fica no navegador e vale ao recarregar", async () => {
    const primeira = await carregar();
    primeira.definirValoresOcultos(true);
    expect(primeira.ls.dados.get("festae:valores-ocultos")).toBe("1");

    const recarregada = await carregar({ "festae:valores-ocultos": "1" });
    expect(recarregada.valoresOcultos()).toBe(true);
  });

  it("outra aba mudou: esta acompanha", async () => {
    const { valoresOcultos, w } = await carregar();
    w.disparar("festae:valores-ocultos", "1");
    expect(valoresOcultos()).toBe(true);
    w.disparar("outra-chave", "0");
    expect(valoresOcultos()).toBe(true);
    w.disparar("festae:valores-ocultos", "0");
    expect(valoresOcultos()).toBe(false);
  });

  it("armazenamento bloqueado não derruba a tela: começa mostrando e alterna mesmo assim", async () => {
    const { valoresOcultos, definirValoresOcultos } = await carregar(undefined, true);
    expect(valoresOcultos()).toBe(false);
    expect(() => definirValoresOcultos(true)).not.toThrow();
    expect(valoresOcultos()).toBe(true);
  });
});
