import { describe, expect, it } from "vitest";
import {
  configuracaoDeAvisosSchema,
  confirmarDestinatarioSchema,
  criarRecorrenciaSchema,
  destinatarioDeAvisoSchema,
  editarRecorrenciaSchema,
  registrarPagamentoDeContaSchema,
  resolverConferenciaSchema,
} from "./contas-a-pagar";

const cadastro = {
  descricao: "Aluguel do galpão",
  natureza: "CUSTEIO",
  tipoDeValor: "FIXO",
  valorPrevisto: "1500",
  diaDoVencimento: 10,
  ajusteDiaInexistente: "ULTIMO_DIA_DO_MES",
  ajusteDiaNaoUtil: "MANTER",
  intervaloMeses: 1,
  dataInicial: "2026-10-01",
  chave: "6f1c2a8e-3b7d-4c1e-9a2b-5d6e7f8a9b0c",
};

describe("cadastro de despesa recorrente", () => {
  it("campos opcionais em branco viram nulo", () => {
    const c = criarRecorrenciaSchema.parse({ ...cadastro, categoria: "", fornecedor: "  " });
    expect(c.categoria).toBeNull();
    expect(c.fornecedor).toBeNull();
    expect(c.dataFinal).toBeNull();
    expect(c.valorPrevisto).toBe(1500);
  });

  it("recusa frequência fora da lista, dia fora de 1–31 e data final antes da inicial", () => {
    expect(criarRecorrenciaSchema.safeParse({ ...cadastro, intervaloMeses: 4 }).success).toBe(false);
    expect(criarRecorrenciaSchema.safeParse({ ...cadastro, diaDoVencimento: 32 }).success).toBe(false);
    expect(criarRecorrenciaSchema.safeParse({ ...cadastro, diaDoVencimento: 0 }).success).toBe(false);
    expect(criarRecorrenciaSchema.safeParse({ ...cadastro, dataFinal: "2026-09-30" }).success).toBe(false);
    expect(criarRecorrenciaSchema.safeParse({ ...cadastro, chave: "x" }).success).toBe(false);
  });

  it("edição parcial não apaga o que não veio", () => {
    expect(editarRecorrenciaSchema.parse({ valorPrevisto: 10 })).toEqual({ valorPrevisto: 10 });
    expect(editarRecorrenciaSchema.parse({ categoria: "" })).toEqual({ categoria: null });
    expect(editarRecorrenciaSchema.parse({ dataFinal: null })).toEqual({ dataFinal: null });
    // Cadência e início não se editam: chegam, são ignorados.
    expect(editarRecorrenciaSchema.parse({ intervaloMeses: 3, dataInicial: "2020-01-01" })).toEqual({});
  });
});

describe("pagamento, conferência e avisos", () => {
  it("pagamento exige dia e valor positivo", () => {
    expect(registrarPagamentoDeContaSchema.safeParse({ pagoEm: "2026-10-28", valor: 0 }).success).toBe(false);
    expect(registrarPagamentoDeContaSchema.safeParse({ pagoEm: "28/10/2026", valor: 10 }).success).toBe(false);
    expect(registrarPagamentoDeContaSchema.parse({ pagoEm: "2026-10-28", valor: "10.5" })).toMatchObject({ valor: 10.5 });
  });

  it("vincular exige o lançamento; gerar e dispensar não", () => {
    expect(resolverConferenciaSchema.safeParse({ acao: "VINCULAR" }).success).toBe(false);
    expect(resolverConferenciaSchema.safeParse({ acao: "VINCULAR", gastoId: "g1" }).success).toBe(true);
    expect(resolverConferenciaSchema.safeParse({ acao: "GERAR" }).success).toBe(true);
    expect(resolverConferenciaSchema.safeParse({ acao: "APAGAR" }).success).toBe(false);
  });

  it("marcos: só os previstos, sem repetição, do mais distante ao vencido", () => {
    const base = { horaDoAviso: 8, emailAtivo: false, mostrarValorNoEmail: false };
    expect(configuracaoDeAvisosSchema.parse({ ...base, marcos: [0, 7, 7, -1] }).marcos).toEqual([7, 0, -1]);
    expect(configuracaoDeAvisosSchema.safeParse({ ...base, marcos: [5] }).success).toBe(false);
    expect(configuracaoDeAvisosSchema.safeParse({ ...base, marcos: [], horaDoAviso: 24 }).success).toBe(false);
  });

  it("destinatário: e-mail válido, em minúsculas; código de 6 dígitos", () => {
    expect(destinatarioDeAvisoSchema.parse({ email: " Financeiro@Exemplo.com " }).email).toBe("financeiro@exemplo.com");
    expect(destinatarioDeAvisoSchema.safeParse({ email: "sem-arroba" }).success).toBe(false);
    expect(confirmarDestinatarioSchema.safeParse({ codigo: "12345" }).success).toBe(false);
    expect(confirmarDestinatarioSchema.safeParse({ codigo: "123456" }).success).toBe(true);
  });
});
