import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { novaChave } from "./chave";

// O backend valida a chave com z.string().uuid(): a de reserva tem de passar.
const uuid = z.string().uuid();

describe("chave de idempotência", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("com randomUUID (HTTPS, localhost): usa ele", () => {
    const chave = novaChave();
    expect(uuid.safeParse(chave).success).toBe(true);
  });

  it("sem randomUUID (painel pelo IP da rede, sem TLS): não quebra e gera UUID v4 válido", () => {
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => real.getRandomValues(a) });
    const chaves = new Set(Array.from({ length: 200 }, () => novaChave()));
    expect(chaves.size).toBe(200);
    for (const chave of Array.from(chaves)) {
      expect(uuid.safeParse(chave).success).toBe(true);
      expect(chave).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
