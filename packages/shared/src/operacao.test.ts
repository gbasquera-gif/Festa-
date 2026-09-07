import { describe, expect, it } from "vitest";
import {
  RESERVATION_TASKS,
  diasAteAFesta,
  etapaDaRegua,
  etapaQueCobra,
  situacaoDaReserva,
} from "./operacao";

const TUDO = [...RESERVATION_TASKS];

describe("diasAteAFesta", () => {
  it("conta dias inteiros, não horas", () => {
    const agora = new Date("2026-09-07T23:00:00-03:00");
    expect(diasAteAFesta(new Date("2026-09-08T08:00:00-03:00"), agora)).toBe(1);
  });

  // Uma festa que começa às 8h continua sendo "hoje" às 18h. Se a conta
  // fosse por horas, a festa do dia sairia do painel no meio da manhã —
  // justo quando a operação mais precisa dela na tela.
  it("a festa de hoje continua sendo hoje no fim do dia", () => {
    const agora = new Date("2026-09-07T18:00:00-03:00");
    expect(diasAteAFesta(new Date("2026-09-07T08:00:00-03:00"), agora)).toBe(0);
  });

  // Depois das 21h em Chapecó já é o dia seguinte em UTC. Contar em UTC
  // adiantaria a régua em um dia toda noite.
  it("usa o calendário de Chapecó, não o de Greenwich", () => {
    const agora = new Date("2026-09-07T22:00:00-03:00");
    expect(diasAteAFesta(new Date("2026-09-07T10:00:00-03:00"), agora)).toBe(0);
  });

  it("devolve negativo depois da festa", () => {
    const agora = new Date("2026-09-09T10:00:00-03:00");
    expect(diasAteAFesta(new Date("2026-09-07T10:00:00-03:00"), agora)).toBe(-2);
  });
});

describe("etapaDaRegua", () => {
  it("festa distante ainda não entrou no radar", () => {
    expect(etapaDaRegua(45).stage).toBe("FUTURA");
  });

  // O limite é fechado no fim: faltando exatamente 30 dias a festa já está
  // em D-30. Quem lê "D-30" espera que valha no dia 30, não no 29.
  it("entra no radar exatamente a 30 dias", () => {
    expect(etapaDaRegua(31).stage).toBe("FUTURA");
    expect(etapaDaRegua(30).stage).toBe("D30");
  });

  it("percorre a régua inteira", () => {
    expect(etapaDaRegua(16).stage).toBe("D30");
    expect(etapaDaRegua(15).stage).toBe("D15");
    expect(etapaDaRegua(8).stage).toBe("D15");
    expect(etapaDaRegua(7).stage).toBe("D7");
    expect(etapaDaRegua(4).stage).toBe("D7");
    expect(etapaDaRegua(3).stage).toBe("D3");
    expect(etapaDaRegua(2).stage).toBe("D3");
    expect(etapaDaRegua(1).stage).toBe("D1");
    expect(etapaDaRegua(0).stage).toBe("DIA_D");
    expect(etapaDaRegua(-1).stage).toBe("D_MAIS_1");
    expect(etapaDaRegua(-2).stage).toBe("ENCERRADA");
  });

  it("cada etapa acumula as tarefas da anterior", () => {
    expect(etapaDaRegua(30).tarefas).toEqual(["dados_conferidos"]);
    expect(etapaDaRegua(7).tarefas).toContain("dados_conferidos");
    expect(etapaDaRegua(7).tarefas).toContain("estoque_validado");
  });

  it("o dia da festa tem instruções para a operação", () => {
    expect(etapaDaRegua(0).acoes.length).toBeGreaterThan(0);
  });
});

describe("etapaQueCobra", () => {
  it("aponta o primeiro degrau que exige a tarefa", () => {
    expect(etapaQueCobra("dados_conferidos")).toBe("D30");
    expect(etapaQueCobra("estoque_validado")).toBe("D7");
    expect(etapaQueCobra("devolucao_concluida")).toBe("D_MAIS_1");
  });
});

describe("situacaoDaReserva", () => {
  const sem = { feitas: [], pendencias: [] };

  it("festa distante e sem pendência é normal", () => {
    expect(situacaoDaReserva({ dias: 60, ...sem })).toBe("NORMAL");
  });

  it("tudo feito é normal", () => {
    expect(situacaoDaReserva({ dias: 3, feitas: TUDO, pendencias: [] })).toBe("NORMAL");
  });

  it("tarefa da etapa de agora, com prazo, é atenção", () => {
    expect(situacaoDaReserva({ dias: 30, ...sem })).toBe("ATENCAO");
  });

  // Faltando um dia, tarefa aberta deixa de ser recado e vira corrida.
  it("véspera com a tarefa da própria véspera aberta é urgente", () => {
    const ateD3 = [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
    ];
    expect(situacaoDaReserva({ dias: 1, feitas: ateD3, pendencias: [] })).toBe("URGENTE");
  });

  // No dia da festa não existe meio-termo: ou o checklist da véspera está
  // fechado, ou ele venceu ontem. Chamar isso de "urgente" na manhã da festa
  // seria suavizar um atraso que já aconteceu.
  it("no dia da festa, checklist da véspera aberto já é atraso", () => {
    const ateD3 = [
      "dados_conferidos",
      "pagamento_conferido",
      "logistica_confirmada",
      "estoque_validado",
      "itens_separados",
    ];
    expect(situacaoDaReserva({ dias: 0, feitas: ateD3, pendencias: [] })).toBe("ATRASADO");
    expect(situacaoDaReserva({ dias: 0, feitas: TUDO, pendencias: [] })).toBe("NORMAL");
  });

  it("devolução pendente no dia seguinte é urgente, não atraso", () => {
    const semDevolucao = TUDO.filter((t) => t !== "devolucao_concluida");
    expect(situacaoDaReserva({ dias: -1, feitas: semDevolucao, pendencias: [] })).toBe("URGENTE");
  });

  // O caso que dói: a 3 dias da festa ninguém conferiu os dados, que era
  // tarefa de 30 dias atrás. Não é "atenção", é atraso.
  it("tarefa vencida numa etapa anterior é atraso", () => {
    expect(situacaoDaReserva({ dias: 3, feitas: [], pendencias: [] })).toBe("ATRASADO");
  });

  it("festa passada sem devolução registrada é atraso", () => {
    expect(
      situacaoDaReserva({ dias: -5, feitas: TUDO.filter((t) => t !== "devolucao_concluida"), pendencias: [] }),
    ).toBe("ATRASADO");
  });

  it("festa passada com devolução registrada está encerrada em paz", () => {
    expect(situacaoDaReserva({ dias: -5, feitas: TUDO, pendencias: [] })).toBe("NORMAL");
  });

  // Sinal não pago ou endereço faltando não trava a etapa, mas ninguém
  // deveria descobrir isso na véspera.
  it("pendência que não é tarefa puxa para atenção", () => {
    expect(situacaoDaReserva({ dias: 60, feitas: TUDO, pendencias: ["Sinal não pago"] })).toBe(
      "ATENCAO",
    );
  });

  it("atraso manda mais que pendência", () => {
    expect(situacaoDaReserva({ dias: 3, feitas: [], pendencias: ["Sinal não pago"] })).toBe(
      "ATRASADO",
    );
  });
});

describe("situacaoDaReserva · reserva recém-criada", () => {
  // O caso real: a Maria Luiza fecha no WhatsApp na quinta uma festa de
  // sábado. A reserva nasce em D-3. Cobrar dela as tarefas de D-30 marcaria
  // como atrasada uma venda registrada há cinco minutos — e uma tela que
  // acusa atraso onde não há atraso é uma tela que ninguém olha.
  it("não cobra prazo anterior ao dia em que a reserva nasceu", () => {
    expect(situacaoDaReserva({ dias: 2, feitas: [], pendencias: [], etapaNaCriacao: "D3" })).toBe(
      "ATENCAO",
    );
  });

  it("venda fechada para hoje é urgente, não atrasada", () => {
    expect(
      situacaoDaReserva({ dias: 0, feitas: [], pendencias: [], etapaNaCriacao: "DIA_D" }),
    ).toBe("URGENTE");
  });

  // Mas a carência não é eterna: passado o degrau em que ela nasceu, a
  // tarefa continua sendo cobrada normalmente.
  it("no dia seguinte a carência acaba", () => {
    expect(situacaoDaReserva({ dias: 1, feitas: [], pendencias: [], etapaNaCriacao: "D3" })).toBe(
      "ATRASADO",
    );
  });

  it("reserva antiga continua sendo cobrada desde o começo da régua", () => {
    expect(
      situacaoDaReserva({ dias: 3, feitas: [], pendencias: [], etapaNaCriacao: "FUTURA" }),
    ).toBe("ATRASADO");
  });
});
