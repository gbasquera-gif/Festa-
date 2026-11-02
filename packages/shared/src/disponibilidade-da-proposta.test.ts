import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DA_FALTA,
  MOTIVO_DA_FALTA_LABEL,
  NATUREZA_DO_MOTIVO,
  mensagemDeEnvioBloqueado,
  seloDasOpcoes,
  seloSemVerificacao,
  simulacaoDeDisponibilidadeSchema,
  textoDoResponsavel,
  textoDoSelo,
  unidades,
  type FaltaDeItem,
  type OpcaoConferida,
} from "./disponibilidade-da-proposta";

const falta = (nome: string, parcial: Partial<FaltaDeItem> = {}): FaltaDeItem => ({
  productId: `p-${nome}`,
  nome,
  identificador: nome.toLowerCase().replace(/\s+/g, "-"),
  necessario: 2,
  disponivel: 1,
  faltante: 1,
  estoque: 3,
  comprometido: 2,
  motivo: "RESERVADO_EM_OUTRA_FESTA",
  natureza: "OUTRA_FESTA",
  responsaveis: [],
  noKit: 0,
  avulso: 2,
  kit: null,
  ...parcial,
});
const opcao = (ordem: number, nome: string, faltas: FaltaDeItem[]): OpcaoConferida => ({
  id: `o${ordem}`,
  chave: null,
  ordem,
  nome,
  disponivel: faltas.length === 0,
  faltas,
});

describe("vocabulário da falta", () => {
  it("todo motivo tem frase e natureza", () => {
    for (const m of MOTIVOS_DA_FALTA) {
      expect(MOTIVO_DA_FALTA_LABEL[m].length).toBeGreaterThan(5);
      expect(NATUREZA_DO_MOTIVO[m]).toBeTruthy();
    }
  });

  it("separa conflito de estoque de inconsistência", () => {
    expect(NATUREZA_DO_MOTIVO.RESERVADO_EM_OUTRA_FESTA).toBe("OUTRA_FESTA");
    expect(NATUREZA_DO_MOTIVO.SEM_UNIDADES_NO_ACERVO).toBe("CADASTRO");
    expect(NATUREZA_DO_MOTIVO.RESERVA_SEM_SINAL_VENCIDA).toBe("TECNICA");
  });

  it("unidades no singular e no plural", () => {
    expect(unidades(0)).toBe("0 unidades");
    expect(unidades(1)).toBe("1 unidade");
    expect(unidades(3)).toBe("3 unidades");
  });

  it("nomeia quem segura a peça", () => {
    expect(
      textoDoResponsavel({ tipo: "RESERVA", id: "r", numero: "FE-0042", detalhe: "confirmada", quantidade: 1, semSinalVencida: false }),
    ).toBe("Reserva FE-0042 (confirmada) — 1 unidade");
    expect(
      textoDoResponsavel({ tipo: "PROPOSTA", id: "p", numero: "Proposta nº 12", detalhe: "opção Premium", quantidade: 2, semSinalVencida: false }),
    ).toBe("Proposta nº 12 (opção Premium) — 2 unidades");
    expect(
      textoDoResponsavel({ tipo: "RESERVA", id: "r", numero: "FE-0007", detalhe: "aguardando sinal", quantidade: 1, semSinalVencida: true }),
    ).toContain("prazo do sinal vencido");
  });
});

describe("mensagem do envio bloqueado", () => {
  it("lista todas as opções com falta e todos os itens, não só o primeiro", () => {
    const texto = mensagemDeEnvioBloqueado("2026-12-05", [
      opcao(1, "Essencial", []),
      opcao(2, "Decoração Premium", [falta("Painel Redondo Branco"), falta("Cilindro Dourado G")]),
      opcao(3, "Jardim Encantado", [falta("Suporte de Flores Branco")]),
    ]);
    expect(texto).toContain("2 opções têm falta de material para 05/12/2026");
    expect(texto).toContain("Decoração Premium: Painel Redondo Branco, Cilindro Dourado G");
    expect(texto).toContain("Jardim Encantado: Suporte de Flores Branco");
    expect(texto).not.toContain("Essencial");
  });

  it("uma opção só, no singular", () => {
    expect(mensagemDeEnvioBloqueado("2026-12-05", [opcao(1, "Única", [falta("Mesa")])])).toContain("1 opção tem falta");
  });
});

describe("selo da lista", () => {
  it("disponível quando todas as opções cabem", () => {
    const s = seloDasOpcoes([{ disponivel: true }, { disponivel: true }]);
    expect(s).toEqual({ situacao: "DISPONIVEL", opcoes: 2, comConflito: 0, motivo: null });
    expect(textoDoSelo(s)).toBe("Disponível");
  });

  it("com conflito diz quantas opções", () => {
    const s = seloDasOpcoes([{ disponivel: true }, { disponivel: false }, { disponivel: true }]);
    expect(s.situacao).toBe("COM_CONFLITO");
    expect(textoDoSelo(s)).toBe("Com conflito · 1 de 3 opções");
    expect(textoDoSelo(seloDasOpcoes([{ disponivel: false }]))).toBe("Com conflito");
  });

  it("não verificado diz por quê", () => {
    expect(textoDoSelo(seloSemVerificacao("SEM_DATA"))).toBe("Não verificado · sem data");
    expect(textoDoSelo(seloSemVerificacao("VIROU_RESERVA"))).toBe("Não verificado · virou reserva");
  });
});

describe("pedido de simulação do editor", () => {
  const base = {
    data: "2026-12-05",
    opcoes: [{ chave: "op1", nome: "Premium", kitId: "", itens: [{ productId: "ckabc0000000000000000000a", quantidade: 2 }] }],
  };

  it("aceita as opções como estão na tela, com linha manual sem peça", () => {
    const r = simulacaoDeDisponibilidadeSchema.safeParse({
      ...base,
      opcoes: [{ ...base.opcoes[0], itens: [...base.opcoes[0].itens, { productId: null, quantidade: 1 }] }],
    });
    expect(r.success).toBe(true);
  });

  it("recusa data fora do formato e opção vazia de chave", () => {
    expect(simulacaoDeDisponibilidadeSchema.safeParse({ ...base, data: "05/12/2026" }).success).toBe(false);
    expect(simulacaoDeDisponibilidadeSchema.safeParse({ ...base, opcoes: [] }).success).toBe(false);
  });
});
