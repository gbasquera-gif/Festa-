import { describe, expect, it } from "vitest";
import { aindaPodeSerPago, type PagamentoNoProvedor } from "./conferencia-do-provedor";
import { precisaConsultarOProvedor, triagemDoSinal, type CobrancaDoSinal } from "./liberacao-do-sinal";

const agora = new Date("2026-11-03T15:00:00.000Z");
const min = (m: number) => new Date(agora.getTime() + m * 60_000);
const pix = (parcial: Partial<CobrancaDoSinal> = {}): CobrancaDoSinal => ({
  id: "c1",
  status: "PENDING",
  method: "PIX",
  externalReference: "mp-1",
  expiresAt: min(-30),
  syncedAt: null,
  ...parcial,
});

describe("triagem do sinal antes de liberar a reserva", () => {
  it("sem cobrança nenhuma: liberável, como sempre foi", () => {
    expect(triagemDoSinal([], agora)).toEqual({ decisao: "LIBERAVEL", aConsultar: [] });
  });

  it("pagamento registrado: nunca libera", () => {
    expect(triagemDoSinal([pix({ status: "PAID" })], agora).decisao).toBe("PAGO");
  });

  it("Pix ainda dentro da validade: não libera (pode ser pago a qualquer momento)", () => {
    expect(triagemDoSinal([pix({ expiresAt: min(19) })], agora).decisao).toBe("COBRANCA_VIVA");
  });

  it("Pix sendo gerado agora (sem referência ainda) também segura", () => {
    expect(triagemDoSinal([pix({ externalReference: null, expiresAt: min(30) })], agora).decisao).toBe("COBRANCA_VIVA");
  });

  it("Pix vencido e não conferido: precisa perguntar ao Mercado Pago", () => {
    const r = triagemDoSinal([pix()], agora);
    expect(r.decisao).toBeNull();
    expect(r.aConsultar.map((c) => c.id)).toEqual(["c1"]);
  });

  it("Pix trocado por um novo (marcado recusado sem consulta): precisa perguntar", () => {
    expect(precisaConsultarOProvedor(pix({ status: "FAILED", syncedAt: null }), agora)).toBe(true);
    expect(precisaConsultarOProvedor(pix({ status: "FAILED", syncedAt: min(-40) }), agora)).toBe(true);
  });

  it("recusado e conferido depois de vencer: não precisa perguntar de novo", () => {
    expect(precisaConsultarOProvedor(pix({ status: "FAILED", syncedAt: min(-10) }), agora)).toBe(false);
    expect(triagemDoSinal([pix({ status: "FAILED", syncedAt: min(-10) })], agora).decisao).toBe("LIBERAVEL");
  });

  it("cobrança só do painel (sem provedor) não pede consulta", () => {
    expect(triagemDoSinal([pix({ externalReference: null, expiresAt: null })], agora).decisao).toBe("LIBERAVEL");
  });

  it("cartão pendente no provedor: precisa perguntar", () => {
    expect(precisaConsultarOProvedor(pix({ method: "CARTAO", expiresAt: null }), agora)).toBe(true);
  });
});

describe("o que ainda pode virar pagamento no Mercado Pago", () => {
  const p = (status: string): PagamentoNoProvedor => ({
    id: "mp-1", referencia: "c1", status, valor: 30, valorEstornado: 0, moeda: "BRL", producao: true,
  });
  it("pendente, em análise e autorizado: ainda pode", () => {
    for (const s of ["pending", "in_process", "authorized"]) expect(aindaPodeSerPago(p(s))).toBe(true);
  });
  it("aprovado, recusado, cancelado, estornado, contestado: não está pendente", () => {
    for (const s of ["approved", "rejected", "cancelled", "refunded", "charged_back"]) expect(aindaPodeSerPago(p(s))).toBe(false);
  });
});
