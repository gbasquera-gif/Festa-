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
  const ambiente = { NODE_ENV: process.env.NODE_ENV, MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.MP_WEBHOOK_SECRET = SEGREDO;
    processar = vi.fn().mockResolvedValue(undefined);
    controller = new PaymentsController(
      { processarNotificacao: processar } as unknown as PaymentsService,
      {} as EventsService,
    );
    vi.spyOn((controller as unknown as { logger: { warn: () => void; error: () => void } }).logger, "warn").mockImplementation(() => {});
    vi.spyOn((controller as unknown as { logger: { warn: () => void; error: () => void } }).logger, "error").mockImplementation(() => {});
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

  it("notificação assinada que não é de pagamento não processa nada", async () => {
    await controller.webhook({ type: "merchant_order", data: { id: "7" } }, assinar("7", "r2"), "r2", "7", "merchant_order");
    expect(processar).not.toHaveBeenCalled();
  });
});
