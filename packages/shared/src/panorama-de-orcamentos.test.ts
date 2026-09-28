import { describe, expect, it } from "vitest";
import { funilDePropostas } from "./comercial";
import {
  mesDeReferenciaDaProposta,
  mesesAte,
  panoramaDeOrcamentos,
  type PropostaDoPanorama,
} from "./panorama-de-orcamentos";

const AGORA = new Date("2026-09-20T15:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T15:00:00.000Z`);
let seq = 0;

function p(extra: Partial<PropostaDoPanorama> = {}): PropostaDoPanorama {
  seq += 1;
  return {
    id: `p${seq}`,
    createdAt: d("2026-09-02"),
    primeiroEnvioEm: d("2026-09-03"),
    enviadoEm: d("2026-09-03"),
    status: "ENVIADO",
    validoAte: d("2026-10-30"),
    reservationId: null,
    total: 1000,
    totalCalculado: 1000,
    valorFinalManual: false,
    aprovadoEm: null,
    valorAprovado: null,
    categoriaDaPerda: null,
    ...extra,
  };
}
const rascunho = (extra: Partial<PropostaDoPanorama> = {}) =>
  p({ status: "RASCUNHO", primeiroEnvioEm: null, enviadoEm: null, ...extra });
const aprovada = (valorAprovado: number, extra: Partial<PropostaDoPanorama> = {}) =>
  p({ status: "APROVADO", aprovadoEm: d("2026-09-08"), valorAprovado, total: valorAprovado, ...extra });
const perdida = (categoriaDaPerda: string | null, extra: Partial<PropostaDoPanorama> = {}) =>
  p({ status: "RECUSADO", categoriaDaPerda, ...extra });

const SET = ["2026-09"];

describe("panorama — contagens", () => {
  it("zero propostas: tudo zero, nada de divisão por zero", () => {
    const r = panoramaDeOrcamentos([], SET, AGORA);
    expect(r.propostas).toBe(0);
    expect(r.ticketMedioAprovado).toBeNull();
    expect(r.conversao).toEqual({ numerador: 0, denominador: 0, percentual: null, baseSuficiente: false });
    expect(r.tempoAteAprovacao).toEqual({ mediaEmDias: null, base: 0 });
    expect(r.motivosDaPerda).toEqual([]);
    expect(r.confere).toBe(true);
  });

  it("só rascunhos: contam como propostas, não entram no funil", () => {
    const r = panoramaDeOrcamentos([rascunho(), rascunho()], SET, AGORA);
    expect(r.propostas).toBe(2);
    expect(r.rascunhos.quantidade).toBe(2);
    expect(r.funil.enviadas).toBe(0);
    expect(r.conversao.denominador).toBe(0);
  });

  it("as fatias são as abas da lista e somam o total", () => {
    const lista = [
      rascunho(),
      p(),
      p({ validoAte: d("2026-09-10") }), // expirada
      aprovada(1200, { reservationId: "r1" }),
      aprovada(800),
      perdida("PRECO"),
    ];
    const r = panoramaDeOrcamentos(lista, SET, AGORA);
    expect(r.propostas).toBe(6);
    expect([r.rascunhos.quantidade, r.emNegociacao.quantidade, r.aprovadas.quantidade, r.perdidas.quantidade, r.semResposta.quantidade])
      .toEqual([1, 1, 2, 1, 1]);
    expect(r.aprovadas.convertidas).toBe(1);
    expect(r.confere).toBe(true);
  });
});

describe("panorama — valores", () => {
  it("aprovada vale o valor aprovado (a opção escolhida), nunca a soma das opções", () => {
    // Proposta de 3 opções (800 / 1.200 / 1.600), cliente escolheu a de 1.200:
    // é UMA linha de Orcamento, com valorAprovado 1.200.
    const r = panoramaDeOrcamentos([aprovada(1200, { opcoesNaoLidas: 3 } as never)], SET, AGORA);
    expect(r.aprovadas).toEqual({ quantidade: 1, valor: 1200, convertidas: 0 });
    expect(r.ticketMedioAprovado).toBe(1200);
  });

  it("aprovada antiga, sem opção registrada: valorAprovado continua sendo a fonte", () => {
    const antiga = aprovada(950, { total: 950, primeiroEnvioEm: null, createdAt: d("2026-09-01") });
    const r = panoramaDeOrcamentos([antiga], SET, AGORA);
    expect(r.aprovadas.valor).toBe(950);
  });

  it("antes do aceite, um valor de referência por proposta", () => {
    const r = panoramaDeOrcamentos([p({ total: 800 }), p({ total: 650.5 }), perdida(null, { total: 300 })], SET, AGORA);
    expect(r.emNegociacao).toEqual({ quantidade: 2, valor: 1450.5 });
    expect(r.perdidas).toEqual({ quantidade: 1, valor: 300 });
  });

  it("ticket médio em centavos: 100 em 3 dá 33,33", () => {
    const r = panoramaDeOrcamentos([aprovada(33.33), aprovada(33.33), aprovada(33.34)], SET, AGORA);
    expect(r.aprovadas.valor).toBe(100);
    expect(r.ticketMedioAprovado).toBe(33.33);
  });
});

describe("panorama — coorte e conversão (as regras da Visão Geral)", () => {
  it("enviada em agosto e aprovada em setembro conta em agosto", () => {
    const x = aprovada(1000, { createdAt: d("2026-08-20"), primeiroEnvioEm: d("2026-08-25"), aprovadoEm: d("2026-09-05") });
    expect(panoramaDeOrcamentos([x], ["2026-09"], AGORA).funil.enviadas).toBe(0);
    const ago = panoramaDeOrcamentos([x], ["2026-08"], AGORA);
    expect(ago.funil).toMatchObject({ enviadas: 1, aprovadas: 1 });
    expect(ago.aprovadas.quantidade).toBe(1);
  });

  it("mês de referência: primeiro envio, no fuso de Chapecó; sem envio, a criação", () => {
    expect(mesDeReferenciaDaProposta({ primeiroEnvioEm: new Date("2026-09-01T02:00:00Z"), createdAt: d("2026-07-01") })).toBe("2026-08");
    expect(mesDeReferenciaDaProposta({ primeiroEnvioEm: null, createdAt: "2026-07-10T12:00:00.000Z" })).toBe("2026-07");
  });

  it("base pequena: X de Y, sem percentual", () => {
    const r = panoramaDeOrcamentos([aprovada(1), aprovada(1), aprovada(1), aprovada(1), p(), p(), perdida("PRECO")], SET, AGORA);
    expect(r.conversao).toEqual({ numerador: 4, denominador: 7, percentual: null, baseSuficiente: false });
  });

  it("base suficiente: percentual", () => {
    const lista = [...Array.from({ length: 5 }, () => aprovada(1)), ...Array.from({ length: 5 }, () => p())];
    expect(panoramaDeOrcamentos(lista, SET, AGORA).conversao.percentual).toBe(0.5);
  });

  it("antiga sem primeiro envio aparece nos cards e fica fora da taxa, contada à parte", () => {
    const antiga = aprovada(900, { primeiroEnvioEm: null, createdAt: d("2026-09-01") });
    const r = panoramaDeOrcamentos([antiga, aprovada(100), p()], SET, AGORA);
    expect(r.aprovadas.quantidade).toBe(2);
    expect(r.funil).toMatchObject({ enviadas: 2, aprovadas: 1, semPrimeiroEnvio: 1 });
  });

  it("os números do funil são exatamente os da Visão Geral", () => {
    const lista = [
      rascunho(), p(), p({ validoAte: d("2026-09-10") }), aprovada(1, { reservationId: "r" }), aprovada(2), perdida("PRECO"),
      aprovada(3, { primeiroEnvioEm: null }), p({ primeiroEnvioEm: d("2026-08-03"), createdAt: d("2026-08-01") }),
    ];
    const f7c = funilDePropostas(lista, SET, AGORA);
    const r = panoramaDeOrcamentos(lista, SET, AGORA);
    expect(r.funil).toEqual({
      enviadas: f7c.enviadas, aprovadas: f7c.aprovadas, convertidas: f7c.convertidas,
      perdidas: f7c.perdidasDeclaradas, semPrimeiroEnvio: f7c.semPrimeiroEnvio,
    });
    expect(r.conversao).toEqual(f7c.aprovacao);
  });

  it("taxa de perda: perdas declaradas da coorte, com a mesma base mínima", () => {
    const r = panoramaDeOrcamentos([perdida("PRECO"), p(), aprovada(1)], SET, AGORA);
    expect(r.taxaDePerda).toEqual({ numerador: 1, denominador: 3, percentual: null, baseSuficiente: false });
  });

  it("tempo até a aprovação: do primeiro envio ao aceite, só com as duas datas", () => {
    const r = panoramaDeOrcamentos(
      [
        aprovada(1, { primeiroEnvioEm: d("2026-09-01"), aprovadoEm: d("2026-09-03") }),
        aprovada(1, { primeiroEnvioEm: d("2026-09-01"), aprovadoEm: d("2026-09-05") }),
        aprovada(1, { primeiroEnvioEm: null, createdAt: d("2026-09-01") }),
        aprovada(1, { primeiroEnvioEm: d("2026-09-09"), aprovadoEm: d("2026-09-08") }),
      ],
      SET,
      AGORA,
    );
    expect(r.tempoAteAprovacao).toEqual({ mediaEmDias: 3, base: 2 });
  });
});

describe("panorama — perdas, recorte e evolução", () => {
  it("motivos pela categoria; sem categoria é Não informado, sem ler o texto", () => {
    const r = panoramaDeOrcamentos(
      [perdida("PRECO"), perdida("PRECO"), perdida("SEM_RESPOSTA"), perdida(null, { motivoDaPerda: "achou caro" } as never)],
      SET,
      AGORA,
    );
    expect(r.motivosDaPerda).toEqual([
      { chave: "PRECO", rotulo: "Preço", quantidade: 2 },
      { chave: "NAO_INFORMADO", rotulo: "Não informado", quantidade: 1 },
      { chave: "SEM_RESPOSTA", rotulo: "Sem resposta", quantidade: 1 },
    ]);
  });

  it("recorte por mês e \"todos\"", () => {
    const lista = [p(), p({ primeiroEnvioEm: d("2026-07-03"), createdAt: d("2026-07-01") }), rascunho({ createdAt: d("2025-12-01") })];
    expect(panoramaDeOrcamentos(lista, ["2026-09"], AGORA).propostas).toBe(1);
    expect(panoramaDeOrcamentos(lista, ["2026-07", "2026-08", "2026-09"], AGORA).propostas).toBe(2);
    const todos = panoramaDeOrcamentos(lista, null, AGORA);
    expect(todos.propostas).toBe(3);
    expect(todos.funil.enviadas).toBe(2);
  });

  it("evolução: a coorte de cada mês", () => {
    const lista = [
      aprovada(1, { primeiroEnvioEm: d("2026-07-03"), createdAt: d("2026-07-01") }),
      p({ primeiroEnvioEm: d("2026-07-04"), createdAt: d("2026-07-01") }),
      aprovada(1),
    ];
    const r = panoramaDeOrcamentos(lista, SET, AGORA, mesesAte("2026-09", 3));
    expect(r.evolucao).toEqual([
      { mes: "2026-07", enviadas: 2, aprovadas: 1 },
      { mes: "2026-08", enviadas: 0, aprovadas: 0 },
      { mes: "2026-09", enviadas: 1, aprovadas: 1 },
    ]);
  });

  it("mesesAte atravessa a virada do ano", () => {
    expect(mesesAte("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
