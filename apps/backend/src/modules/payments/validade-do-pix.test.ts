import { describe, expect, it } from "vitest";
import { FOLGA_ATE_O_PROVEDOR_MS, horarioEmChapeco, prazoDaReserva, validadeDoPix } from "./validade-do-pix";

const MIN = 60_000;
const pedidoEm = new Date("2026-12-05T20:00:00.000Z"); // 17:00 em Chapecó
const reservaPendente = { status: "PENDING", requestedAt: pedidoEm };
const prazo = prazoDaReserva(reservaPendente)!; // 60 min depois: 18:00 em Chapecó
const aos = (minutos: number, extraMs = 0) => new Date(pedidoEm.getTime() + minutos * MIN + extraMs);

describe("prazo da reserva que aguarda o sinal", () => {
  it("é o pedido mais 60 minutos, só enquanto a reserva está pendente", () => {
    expect(prazo.toISOString()).toBe("2026-12-05T21:00:00.000Z");
    expect(prazoDaReserva({ status: "CONFIRMED", requestedAt: pedidoEm })).toBeNull();
    expect(prazoDaReserva(null)).toBeNull();
  });

  it("aparece para a cliente no horário de Chapecó", () => {
    expect(horarioEmChapeco(prazo)).toBe("18:00");
  });
});

describe("validade de um Pix novo", () => {
  it("sem prazo correndo (saldo de reserva confirmada), vale os 30 minutos de sempre", () => {
    const agora = aos(200);
    const r = validadeDoPix(agora, null);
    expect(r.ok && r.expiresAt.getTime() - agora.getTime()).toBe(30 * MIN);
  });

  it("logo depois do pedido: 30 minutos, terminando antes do prazo", () => {
    const r = validadeDoPix(aos(1), prazo);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.expiresAt.toISOString()).toBe(aos(31).toISOString());
      expect(r.expiresAt.getTime()).toBeLessThanOrEqual(prazo.getTime());
    }
  });

  it("no limite: 30 minutos mais a folga ainda cabem — vence exatamente antes do prazo", () => {
    const agora = new Date(prazo.getTime() - 30 * MIN - FOLGA_ATE_O_PROVEDOR_MS);
    const r = validadeDoPix(agora, prazo);
    expect(r.ok).toBe(true);
    if (r.ok) expect(prazo.getTime() - r.expiresAt.getTime()).toBe(FOLGA_ATE_O_PROVEDOR_MS);
  });

  it("um segundo depois do limite: recusado, sem prazo novo", () => {
    const agora = new Date(prazo.getTime() - 30 * MIN - FOLGA_ATE_O_PROVEDOR_MS + 1000);
    const r = validadeDoPix(agora, prazo);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.codigo).toBe("PRAZO_DO_SINAL_INSUFICIENTE");
      expect(r.prazo).toEqual(prazo);
      expect(r.mensagem).toContain("termina às 18:00");
      expect(r.mensagem).toContain("WhatsApp");
    }
  });

  it("regerar aos 31 minutos (o primeiro Pix venceu) é recusado: o prazo não aumenta", () => {
    const r = validadeDoPix(aos(31), prazo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("PRAZO_DO_SINAL_INSUFICIENTE");
  });

  it("no prazo e depois dele: encerrado, com orientação para quem já pagou", () => {
    for (const agora of [prazo, aos(61), aos(300)]) {
      const r = validadeDoPix(agora, prazo);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.codigo).toBe("PRAZO_DO_SINAL_ENCERRADO");
        expect(r.mensagem).toContain("terminou às 18:00");
        expect(r.mensagem).toContain("Se você já pagou");
      }
    }
  });

  it("nenhum Pix aceito vence depois do prazo, minuto a minuto da janela", () => {
    for (let m = 0; m <= 70; m++) {
      const r = validadeDoPix(aos(m), prazo);
      if (r.ok) expect(r.expiresAt.getTime()).toBeLessThanOrEqual(prazo.getTime() - FOLGA_ATE_O_PROVEDOR_MS);
    }
  });

  it("a mensagem não traz número de estoque nem dado da reserva além do horário", () => {
    const r = validadeDoPix(aos(45), prazo);
    expect(!r.ok && r.mensagem.replace("18:00", "").replace("30 minutos", "")).not.toMatch(/\d/);
  });
});

describe("prazo do sinal na tela de pagamento", () => {
  // Importado aqui para o bloco ficar autocontido.
  it("é a mesma conta da geração do Pix, minuto a minuto", async () => {
    const { prazoDoSinalParaTela } = await import("./validade-do-pix");
    for (let m = 0; m <= 70; m++) {
      const agora = aos(m);
      const tela = prazoDoSinalParaTela(reservaPendente, agora);
      const geracao = validadeDoPix(agora, prazo);
      expect(tela.temPrazo).toBe(true);
      if (!tela.temPrazo) continue;
      expect(tela.prazo).toBe(prazo.toISOString());
      expect(tela.horario).toBe("18:00");
      expect(tela.podeGerarNovoPix).toBe(geracao.ok);
      expect(tela.encerrado).toBe(m >= 60);
      if (geracao.ok) {
        expect(tela.mensagem).toBeNull();
        // Todo Pix que a tela deixa gerar vence antes do horário que ela mostra.
        expect(geracao.expiresAt.getTime()).toBeLessThan(prazo.getTime());
      } else {
        expect(tela.motivo).toBe(geracao.codigo);
        expect(tela.mensagem).toBe(geracao.mensagem);
      }
    }
  });

  it("sem prazo correndo (reserva confirmada ou sem reserva), a tela não mostra horário", async () => {
    const { prazoDoSinalParaTela } = await import("./validade-do-pix");
    expect(prazoDoSinalParaTela({ status: "CONFIRMED", requestedAt: pedidoEm }, aos(10))).toEqual({ temPrazo: false });
    expect(prazoDoSinalParaTela(null, aos(10))).toEqual({ temPrazo: false });
  });
});
