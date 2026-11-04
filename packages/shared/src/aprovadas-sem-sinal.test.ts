import { describe, expect, it } from "vitest";
import {
  ALERTA_APROVADAS_HORAS_PADRAO,
  aguardoDoSinal,
  limiarDoAlerta,
  textoDoAguardo,
} from "./aprovadas-sem-sinal";

const H = 3_600_000;
const agora = new Date("2026-11-10T15:00:00.000Z"); // 12:00 em Chapecó
const festa = (dia: string) => new Date(`${dia}T12:00:00.000Z`);

describe("prazo do alerta", () => {
  it("padrão de 48 horas quando não configurado", () => {
    expect(ALERTA_APROVADAS_HORAS_PADRAO).toBe(48);
    expect(limiarDoAlerta(undefined)).toBe(48);
    expect(limiarDoAlerta(null)).toBe(48);
    expect(limiarDoAlerta("")).toBe(48);
  });

  it("aceita um número inteiro de horas entre 1 e 720", () => {
    expect(limiarDoAlerta("24")).toBe(24);
    expect(limiarDoAlerta(" 72 ")).toBe(72);
    expect(limiarDoAlerta("1")).toBe(1);
    expect(limiarDoAlerta("720")).toBe(720);
  });

  it("texto inválido não desliga o alerta: volta ao padrão", () => {
    for (const t of ["0", "-5", "721", "2,5", "48h", "abc"]) expect(limiarDoAlerta(t)).toBe(48);
  });
});

describe("aguardo do sinal", () => {
  it("abaixo do prazo: não está em alerta", () => {
    const a = aguardoDoSinal(agora, new Date(agora.getTime() - 47 * H - 59 * 60_000), festa("2026-12-01"), 48);
    expect(a.horasAguardando).toBe(47);
    expect(a.emAlerta).toBe(false);
  });

  it("exatamente no prazo: entra em alerta", () => {
    const a = aguardoDoSinal(agora, new Date(agora.getTime() - 48 * H), festa("2026-12-01"), 48);
    expect(a.horasAguardando).toBe(48);
    expect(a.emAlerta).toBe(true);
  });

  it("sem data de aprovação registrada: entra em alerta por precaução", () => {
    const a = aguardoDoSinal(agora, null, festa("2026-12-01"), 48);
    expect(a.horasAguardando).toBeNull();
    expect(a.emAlerta).toBe(true);
  });

  it("conta os dias até a festa pelo calendário de Chapecó", () => {
    expect(aguardoDoSinal(agora, agora, festa("2026-11-10"), 48).diasAteAFesta).toBe(0);
    expect(aguardoDoSinal(agora, agora, festa("2026-11-13"), 48).diasAteAFesta).toBe(3);
    const passada = aguardoDoSinal(agora, agora, festa("2026-11-08"), 48);
    expect(passada.diasAteAFesta).toBe(-2);
    expect(passada.festaJaPassou).toBe(true);
  });

  it("sem data de festa: dias nulos, não conta como passada", () => {
    const a = aguardoDoSinal(agora, agora, null, 48);
    expect(a.diasAteAFesta).toBeNull();
    expect(a.festaJaPassou).toBe(false);
  });
});

describe("texto do aguardo", () => {
  it("horas, dias e dias com horas", () => {
    expect(textoDoAguardo(18)).toBe("18 h");
    expect(textoDoAguardo(48)).toBe("2 dias");
    expect(textoDoAguardo(53)).toBe("2 dias e 5 h");
    expect(textoDoAguardo(25)).toBe("1 dia e 1 h");
    expect(textoDoAguardo(null)).toBe("sem data de aprovação registrada");
  });
});
