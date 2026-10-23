import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import type { PaymentsService } from "./payments.service";
import type { EventsService } from "../events/events.service";

const SEGREDO = "segredo-de-teste-do-webhook";

function assinar(dataId: string, requestId: string, ts = String(Date.now())) {
  const v1 = createHmac("sha256", SEGREDO).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

describe("webhook do Mercado Pago (controller)", () => {
  let processar: ReturnType<typeof vi.fn>;
  let controller: PaymentsController;
  let logs: string[];
  const ambiente = { NODE_ENV: process.env.NODE_ENV, MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.MP_WEBHOOK_SECRET = SEGREDO;
    processar = vi.fn().mockResolvedValue(undefined);
    controller = new PaymentsController(
      { processarNotificacao: processar } as unknown as PaymentsService,
      {} as EventsService,
    );
    const logger = (controller as unknown as { logger: Record<"warn" | "error" | "log", (m: string) => void> }).logger;
    logs = [];
    for (const nivel of ["warn", "error", "log"] as const) {
      vi.spyOn(logger, nivel).mockImplementation((m: string) => void logs.push(m));
    }
  });

  afterEach(() => {
    process.env.NODE_ENV = ambiente.NODE_ENV;
    if (ambiente.MP_WEBHOOK_SECRET === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = ambiente.MP_WEBHOOK_SECRET;
  });

  const corpo = (id: string) => ({ type: "payment", action: "payment.updated", data: { id } });

  it("processa exatamente o id que foi assinado", async () => {
    await controller.webhook(corpo("555"), assinar("555", "r1"), "r1", "555", "payment");
    expect(processar).toHaveBeenCalledTimes(1);
    expect(processar).toHaveBeenCalledWith("555");
  });

  it("recusa URL com um id e corpo com outro, sem processar nada", async () => {
    await expect(
      controller.webhook(corpo("999"), assinar("555", "r1"), "r1", "555", "payment"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(processar).not.toHaveBeenCalled();
  });

  it("sem segredo em produção, recusa e não processa", async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    await expect(
      controller.webhook(corpo("555"), assinar("555", "r1"), "r1", "555", "payment"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(processar).not.toHaveBeenCalled();
  });

  it("assinatura fora da janela é recusada", async () => {
    const velha = String(Date.now() - 60 * 60_000);
    await expect(
      controller.webhook(corpo("555"), assinar("555", "r1", velha), "r1", "555", "payment"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(processar).not.toHaveBeenCalled();
  });

  it("a mesma notificação reapresentada não é processada de novo", async () => {
    const assinatura = assinar("555", "r1");
    await controller.webhook(corpo("555"), assinatura, "r1", "555", "payment");
    await controller.webhook(corpo("555"), assinatura, "r1", "555", "payment");
    expect(processar).toHaveBeenCalledTimes(1);
  });

  it("se o processamento falhou, o reenvio passa (não é marcada como processada)", async () => {
    processar.mockRejectedValueOnce(new Error("Mercado Pago fora do ar"));
    const assinatura = assinar("555", "r1");
    await expect(controller.webhook(corpo("555"), assinatura, "r1", "555", "payment")).rejects.toThrow();
    await controller.webhook(corpo("555"), assinatura, "r1", "555", "payment");
    expect(processar).toHaveBeenCalledTimes(2);
  });

  describe("logs de diagnóstico (P1)", () => {
    const semSegredos = (linha: string, assinatura: string) => {
      const hash = assinatura.split("v1=")[1];
      expect(linha).not.toContain(hash);
      expect(linha).not.toContain(SEGREDO);
      expect(linha).not.toContain("r-diag");
      expect(linha).not.toMatch(/R\$|\d+,\d{2}/);
    };

    it("recusa por tempo: motivo, idade e tentativa, sem a assinatura", async () => {
      const assinatura = assinar("555", "r-diag", String(Date.now() - 20 * 60_000));
      await expect(
        controller.webhook(corpo("555"), assinatura, "r-diag", "555", "payment", undefined, "3"),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatch(/^Notificação do Mercado Pago recusada motivo=FORA_DA_JANELA idade=1[12]\d\ds tentativa=3$/);
      semSegredos(logs[0], assinatura);
    });

    it("recusa por assinatura que não confere", async () => {
      const assinatura = assinar("555", "r-diag").replace(/v1=./, "v1=0");
      await expect(
        controller.webhook(corpo("555"), assinatura, "r-diag", "555", "payment", undefined, "0"),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(logs[0]).toMatch(/motivo=NAO_CONFERE idade=-?\d+s tentativa=0$/);
      semSegredos(logs[0], assinatura);
    });

    it("ids divergentes: motivo e tentativa", async () => {
      await expect(
        controller.webhook(corpo("999"), assinar("555", "r-diag"), "r-diag", "555", "payment", undefined, "1"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(logs).toEqual(["Notificação do Mercado Pago recusada motivo=ID_DIVERGENTE tentativa=1"]);
    });

    it("reenvio aceito fica registrado: mostra se o Mercado Pago assina de novo", async () => {
      await controller.webhook(corpo("555"), assinar("555", "r-diag"), "r-diag", "555", "payment", undefined, "2");
      expect(logs).toEqual([expect.stringMatching(/^Notificação do Mercado Pago aceita idade=\d+s tentativa=2$/)]);
    });

    it("primeira entrega aceita não gera log", async () => {
      await controller.webhook(corpo("555"), assinar("555", "r-diag"), "r-diag", "555", "payment", undefined, "0");
      expect(logs).toEqual([]);
    });
  });

  it("notificação assinada que não é de pagamento não processa nada", async () => {
    await controller.webhook({ type: "merchant_order", data: { id: "7" } }, assinar("7", "r2"), "r2", "7", "merchant_order");
    expect(processar).not.toHaveBeenCalled();
  });
});
