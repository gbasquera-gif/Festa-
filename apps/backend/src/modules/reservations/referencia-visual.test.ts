import { describe, expect, it } from "vitest";
import { referenciaVisual, type PropostaDaReserva } from "./referencia-visual";

const foto = (n: number) => `https://imagens.exemplo.invalid/festa-${n}.jpg`;
const proposta = (mudar: Partial<PropostaDaReserva> = {}): PropostaDaReserva => ({
  imagens: [],
  opcaoAprovadaId: null,
  opcaoAprovadaNome: null,
  opcoes: [],
  ...mudar,
});

describe("referência visual da reserva", () => {
  it("reserva sem proposta (feita no aplicativo) não tem referência", () => {
    expect(referenciaVisual(null)).toEqual({ opcao: null, imagens: [] });
  });

  it("opção aprovada com uma imagem", () => {
    const p = proposta({ opcaoAprovadaId: "o1", opcoes: [{ id: "o1", nome: "Opção 1", imagens: [foto(1)] }] });
    expect(referenciaVisual(p)).toEqual({ opcao: null, imagens: [foto(1)] });
  });

  it("várias imagens, na ordem da proposta", () => {
    const p = proposta({ opcaoAprovadaId: "o1", opcoes: [{ id: "o1", nome: "Opção 1", imagens: [foto(3), foto(1), foto(2)] }] });
    expect(referenciaVisual(p).imagens).toEqual([foto(3), foto(1), foto(2)]);
  });

  it("várias opções: só as imagens da aprovada, com o nome registrado no aceite", () => {
    const p = proposta({
      imagens: [foto(9)],
      opcaoAprovadaId: "o2",
      opcaoAprovadaNome: "Jardim encantado",
      opcoes: [
        { id: "o1", nome: "Clássica", imagens: [foto(1), foto(2)] },
        { id: "o2", nome: "Jardim (editado depois)", imagens: [foto(3), foto(4)] },
        { id: "o3", nome: "Completa", imagens: [foto(5)] },
      ],
    });
    expect(referenciaVisual(p)).toEqual({ opcao: "Jardim encantado", imagens: [foto(3), foto(4)] });
  });

  it("sem nome registrado no aceite, usa o nome da opção", () => {
    const p = proposta({
      opcaoAprovadaId: "o2",
      opcoes: [
        { id: "o1", nome: "Clássica", imagens: [foto(1)] },
        { id: "o2", nome: "Completa", imagens: [foto(2)] },
      ],
    });
    expect(referenciaVisual(p).opcao).toBe("Completa");
  });

  it("aprovada antes das opções existirem: a única opção é a que vale", () => {
    const p = proposta({ imagens: [foto(1)], opcoes: [{ id: "opc_x", nome: "Opção 1", imagens: [foto(1)] }] });
    expect(referenciaVisual(p)).toEqual({ opcao: null, imagens: [foto(1)] });
  });

  it("várias opções sem registro da aprovada: não adivinha", () => {
    const p = proposta({
      opcoes: [
        { id: "o1", nome: "Clássica", imagens: [foto(1)] },
        { id: "o2", nome: "Completa", imagens: [foto(2)] },
      ],
    });
    expect(referenciaVisual(p)).toEqual({ opcao: null, imagens: [] });
  });

  it("aprovada registrada que não existe mais: não troca por outra", () => {
    const p = proposta({ opcaoAprovadaId: "sumiu", opcoes: [{ id: "o1", nome: "Opção 1", imagens: [foto(1)] }] });
    expect(referenciaVisual(p).imagens).toEqual([]);
  });

  it("proposta sem opções usa as imagens da própria proposta", () => {
    expect(referenciaVisual(proposta({ imagens: [foto(1), foto(2)] })).imagens).toEqual([foto(1), foto(2)]);
  });

  it("proposta antiga sem imagem fica vazia, sem erro", () => {
    const p = proposta({ opcoes: [{ id: "o1", nome: "Opção 1", imagens: [] }] });
    expect(referenciaVisual(p)).toEqual({ opcao: null, imagens: [] });
  });

  it("descarta endereço vazio, repetido ou que não é de imagem web", () => {
    const p = proposta({
      opcoes: [{ id: "o1", nome: "Opção 1", imagens: [foto(1), " ", foto(1), "javascript:alert(1)", "data:image/png;base64,AA", "/uploads/kits/a.jpg"] }],
    });
    expect(referenciaVisual(p).imagens).toEqual([foto(1), "/uploads/kits/a.jpg"]);
  });
});
