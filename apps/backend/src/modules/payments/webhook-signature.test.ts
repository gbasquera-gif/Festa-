import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { isValidWebhookSignature } from "./webhook-signature";

const SECRET = "segredo-de-teste-do-webhook";
const DATA_ID = "1234567890";
const REQUEST_ID = "req-abc-123";
const TS = "1786140000";

/** Monta uma assinatura legítima, como o Mercado Pago faria. */
function assinar(secret: string, dataId = DATA_ID, requestId = REQUEST_ID, ts = TS) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

afterEach(() => {
  delete process.env.MP_WEBHOOK_SECRET;
});

describe("assinatura do webhook do Mercado Pago", () => {
  it("aceita uma notificação assinada com o segredo correto", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    expect(
      isValidWebhookSignature({
        xSignature: assinar(SECRET),
        xRequestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(true);
  });

  it("recusa assinatura feita com outro segredo", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    expect(
      isValidWebhookSignature({
        xSignature: assinar("segredo-errado"),
        xRequestId: REQUEST_ID,
        dataId: DATA_ID,
      }),
    ).toBe(false);
  });

  it("recusa quando o id do pagamento foi trocado depois de assinar", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    // O ataque que isto impede: pegar uma notificação real e trocar o id
    // para nos fazer consultar outro pagamento.
    expect(
      isValidWebhookSignature({
        xSignature: assinar(SECRET),
        xRequestId: REQUEST_ID,
        dataId: "9999999999",
      }),
    ).toBe(false);
  });

  it("recusa quando falta cabeçalho", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    expect(isValidWebhookSignature({ xRequestId: REQUEST_ID, dataId: DATA_ID })).toBe(false);
    expect(isValidWebhookSignature({ xSignature: assinar(SECRET), dataId: DATA_ID })).toBe(false);
    expect(isValidWebhookSignature({ xSignature: assinar(SECRET), xRequestId: REQUEST_ID })).toBe(
      false,
    );
  });

  it("recusa assinatura malformada", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    for (const xSignature of ["", "lixo", "ts=1786140000", "v1=abc", "ts=,v1="]) {
      expect(
        isValidWebhookSignature({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID }),
      ).toBe(false);
    }
  });

  it("reconhece o id em maiúsculas, como o Mercado Pago normaliza", () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;

    expect(
      isValidWebhookSignature({
        xSignature: assinar(SECRET, "ABC123"),
        xRequestId: REQUEST_ID,
        dataId: "ABC123",
      }),
    ).toBe(true);
  });

  it("sem segredo configurado, deixa passar — a proteção real é a consulta à API", () => {
    // Antes de a Festaê configurar MP_WEBHOOK_SECRET no Railway, o webhook
    // precisa funcionar. Forjar um "pago" continua impossível porque o
    // status é sempre buscado no Mercado Pago.
    expect(
      isValidWebhookSignature({ xSignature: "qualquer", xRequestId: "x", dataId: "1" }),
    ).toBe(true);
  });
});
