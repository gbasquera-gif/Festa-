import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  JANELA_DA_ASSINATURA_MS,
  NotificacoesProcessadas,
  lerNotificacao,
  verificarAssinatura,
} from "./webhook-signature";

const SEGREDO = "segredo-de-teste-do-webhook";
const DATA_ID = "1234567890";
const REQUEST_ID = "req-abc-123";
/** Agora, em milissegundos, como o Mercado Pago manda o `ts`. */
const AGORA = 1_786_140_000_000;
const TS = String(AGORA);

/** Monta uma assinatura legítima, como o Mercado Pago faria. */
function assinar(segredo: string, dataId: string | undefined = DATA_ID, requestId = REQUEST_ID, ts = TS) {
  const manifesto = (dataId ? `id:${dataId.toLowerCase()};` : "") + `request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", segredo).update(manifesto).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

const emProducao = { agora: AGORA, producao: true, segredo: SEGREDO };

describe("assinatura do webhook do Mercado Pago", () => {
  it("aceita uma notificação assinada com o segredo correto e dentro da janela", () => {
    expect(
      verificarAssinatura({ xSignature: assinar(SEGREDO), xRequestId: REQUEST_ID, dataId: DATA_ID }, emProducao),
    ).toEqual({ valida: true, conferida: true });
  });

  it("recusa assinatura feita com outro segredo", () => {
    expect(
      verificarAssinatura(
        { xSignature: assinar("segredo-errado"), xRequestId: REQUEST_ID, dataId: DATA_ID },
        emProducao,
      ),
    ).toEqual({ valida: false, motivo: "NAO_CONFERE" });
  });

  it("recusa quando o id do pagamento foi trocado depois de assinar", () => {
    // O ataque que isto impede: pegar uma notificação real e trocar o id
    // para nos fazer consultar e registrar outro pagamento.
    expect(
      verificarAssinatura(
        { xSignature: assinar(SEGREDO), xRequestId: REQUEST_ID, dataId: "9999999999" },
        emProducao,
      ),
    ).toEqual({ valida: false, motivo: "NAO_CONFERE" });
  });

  it("recusa quando o id some depois de assinar (o manifesto muda)", () => {
    expect(
      verificarAssinatura({ xSignature: assinar(SEGREDO), xRequestId: REQUEST_ID }, emProducao),
    ).toEqual({ valida: false, motivo: "NAO_CONFERE" });
  });

  it("recusa quando falta cabeçalho", () => {
    expect(verificarAssinatura({ xRequestId: REQUEST_ID, dataId: DATA_ID }, emProducao)).toEqual({
      valida: false,
      motivo: "SEM_CABECALHO",
    });
    expect(verificarAssinatura({ xSignature: assinar(SEGREDO), dataId: DATA_ID }, emProducao)).toEqual({
      valida: false,
      motivo: "SEM_CABECALHO",
    });
  });

  it("recusa assinatura malformada", () => {
    for (const xSignature of ["lixo", `ts=${TS}`, "v1=abc", "ts=,v1=", "ts=12a,v1=abc"]) {
      expect(verificarAssinatura({ xSignature, xRequestId: REQUEST_ID, dataId: DATA_ID }, emProducao)).toEqual({
        valida: false,
        motivo: "MALFORMADA",
      });
    }
  });

  it("reconhece o id em maiúsculas, como o Mercado Pago normaliza", () => {
    expect(
      verificarAssinatura(
        { xSignature: assinar(SEGREDO, "ABC123"), xRequestId: REQUEST_ID, dataId: "ABC123" },
        emProducao,
      ).valida,
    ).toBe(true);
  });

  describe("janela de tempo (replay)", () => {
    it("aceita no limite da janela, para os dois lados", () => {
      for (const desvio of [JANELA_DA_ASSINATURA_MS, -JANELA_DA_ASSINATURA_MS]) {
        const ts = String(AGORA + desvio);
        expect(
          verificarAssinatura(
            { xSignature: assinar(SEGREDO, DATA_ID, REQUEST_ID, ts), xRequestId: REQUEST_ID, dataId: DATA_ID },
            emProducao,
          ).valida,
        ).toBe(true);
      }
    });

    it("recusa notificação verdadeira reapresentada depois da janela", () => {
      const ts = String(AGORA - JANELA_DA_ASSINATURA_MS - 1);
      expect(
        verificarAssinatura(
          { xSignature: assinar(SEGREDO, DATA_ID, REQUEST_ID, ts), xRequestId: REQUEST_ID, dataId: DATA_ID },
          emProducao,
        ),
      ).toEqual({ valida: false, motivo: "FORA_DA_JANELA" });
    });

    it("recusa horário no futuro além da janela", () => {
      const ts = String(AGORA + JANELA_DA_ASSINATURA_MS + 1);
      expect(
        verificarAssinatura(
          { xSignature: assinar(SEGREDO, DATA_ID, REQUEST_ID, ts), xRequestId: REQUEST_ID, dataId: DATA_ID },
          emProducao,
        ).valida,
      ).toBe(false);
    });

    it("entende ts em segundos sem recusar a notificação verdadeira", () => {
      const ts = String(Math.floor(AGORA / 1000));
      expect(
        verificarAssinatura(
          { xSignature: assinar(SEGREDO, DATA_ID, REQUEST_ID, ts), xRequestId: REQUEST_ID, dataId: DATA_ID },
          emProducao,
        ).valida,
      ).toBe(true);
    });
  });

  describe("sem segredo configurado", () => {
    it("em produção, recusa tudo", () => {
      for (const segredo of [undefined, "", "   "]) {
        expect(
          verificarAssinatura(
            { xSignature: assinar(SEGREDO), xRequestId: REQUEST_ID, dataId: DATA_ID },
            { agora: AGORA, producao: true, segredo },
          ),
        ).toEqual({ valida: false, motivo: "SEM_SEGREDO_EM_PRODUCAO" });
      }
    });

    it("fora de produção, deixa passar e diz que não conferiu", () => {
      expect(
        verificarAssinatura({ xSignature: "qualquer" }, { agora: AGORA, producao: false }),
      ).toEqual({ valida: true, conferida: false });
    });
  });
});

describe("id da notificação", () => {
  it("usa o da URL e confere com o do corpo", () => {
    expect(lerNotificacao({ dataId: "123", type: "payment" }, { type: "payment", data: { id: "123" } })).toEqual({
      ok: true,
      dataId: "123",
      ehPagamento: true,
    });
  });

  it("recusa URL e corpo com ids diferentes: o assinado tem de ser o processado", () => {
    expect(lerNotificacao({ dataId: "123" }, { type: "payment", data: { id: "999" } })).toEqual({ ok: false });
  });

  it("recusa id ilegível em vez de escolher um dos valores", () => {
    expect(lerNotificacao({ dataId: ["123", "999"] }, {})).toEqual({ ok: false });
    expect(lerNotificacao({ dataId: "" }, {})).toEqual({ ok: false });
    expect(lerNotificacao({}, { data: { id: { $ne: 1 } } })).toEqual({ ok: false });
  });

  it("aceita o id numérico do corpo como texto", () => {
    expect(lerNotificacao({}, { action: "payment.updated", data: { id: 123 } })).toEqual({
      ok: true,
      dataId: "123",
      ehPagamento: true,
    });
  });

  it("reconhece o que não é pagamento", () => {
    expect(lerNotificacao({ dataId: "1", topic: "merchant_order" }, {})).toMatchObject({ ok: true, ehPagamento: false });
  });
});

describe("notificações já processadas", () => {
  it("a mesma notificação não passa duas vezes dentro da janela", () => {
    const registro = new NotificacoesProcessadas();
    expect(registro.jaProcessada("r1", AGORA)).toBe(false);
    registro.marcar("r1", AGORA);
    expect(registro.jaProcessada("r1", AGORA + 1000)).toBe(true);
    expect(registro.jaProcessada("r2", AGORA + 1000)).toBe(false);
  });

  it("esquece depois da janela, quando a assinatura já recusa sozinha", () => {
    const registro = new NotificacoesProcessadas();
    registro.marcar("r1", AGORA);
    expect(registro.jaProcessada("r1", AGORA + 2 * JANELA_DA_ASSINATURA_MS + 1)).toBe(false);
  });

  it("não cresce sem limite", () => {
    const registro = new NotificacoesProcessadas(100);
    for (let i = 0; i < 1000; i++) registro.marcar(`r${i}`, AGORA);
    expect(registro.jaProcessada("r999", AGORA)).toBe(true);
    expect((registro as unknown as { vistas: Map<string, number> }).vistas.size).toBeLessThanOrEqual(100);
  });
});
