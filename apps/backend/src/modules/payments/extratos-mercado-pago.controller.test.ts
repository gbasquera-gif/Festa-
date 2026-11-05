import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { BadRequestException, Logger, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { ExtratosMercadoPagoController, nomeDoArquivo } from "./extratos-mercado-pago.controller";

// Arquivo fictício.
const EXTRATO = `RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-10-2026;Transferência Pix recebida Cliente Exemplo;90000000001;500,00;600,00
02-10-2026;Dinheiro reservado Reserva Festaê;90000000002;-550,00;50,00
`;

const upload = (originalname: string, texto: string) =>
  ({ originalname, buffer: Buffer.from(texto, "utf8") }) as Express.Multer.File;

describe("extratos do Mercado Pago: permissões", () => {
  const guarda = new RolesGuard(new Reflector());
  const contexto = (role: string) =>
    ({
      getHandler: () => ExtratosMercadoPagoController.prototype.analisar,
      getClass: () => ExtratosMercadoPagoController,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;

  it("só ADMIN importa: OPS e CUSTOMER são barrados", () => {
    expect(guarda.canActivate(contexto("ADMIN"))).toBe(true);
    expect(guarda.canActivate(contexto("OPS"))).toBe(false);
    expect(guarda.canActivate(contexto("CUSTOMER"))).toBe(false);
    expect(guarda.canActivate(contexto(undefined as unknown as string))).toBe(false);
  });

  it("exige login antes do papel", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ExtratosMercadoPagoController)).toEqual([JwtAuthGuard, RolesGuard]);
  });
});

describe("extratos do Mercado Pago: análise", () => {
  const controller = new ExtratosMercadoPagoController();

  it("sem arquivo, pede um", () => {
    expect(() => controller.analisar([])).toThrow(BadRequestException);
    expect(() => controller.analisar(undefined)).toThrow(BadRequestException);
  });

  it("calcula o SHA-256 do conteúdo e reconhece o arquivo repetido", () => {
    const r = controller.analisar([upload("outubro.csv", EXTRATO), upload("copia.csv", EXTRATO)]);
    expect(r.arquivos[0]).toMatchObject({
      situacao: "ACEITO",
      hash: createHash("sha256").update(EXTRATO).digest("hex"),
    });
    expect(r.arquivos[1].situacao).toBe("REPETIDO");
    expect(r.movimentacoes.map((m) => m.categoria)).toEqual(["RECEBIMENTO", "TRANSFERENCIA_PARA_COFRINHO"]);
  });

  it("não escreve nada do extrato em log", () => {
    const espioes = (["log", "warn", "error", "debug", "verbose"] as const).map((m) =>
      vi.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
    );
    const console_ = vi.spyOn(console, "log").mockImplementation(() => undefined);
    controller.analisar([upload("outubro.csv", EXTRATO)]);
    controller.analisar([upload("ruim.csv", "Fulano;123.456.789-00\n")]);
    for (const e of espioes) expect(e).not.toHaveBeenCalled();
    expect(console_).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("nome com acento chega certo; caracteres de controle saem", () => {
    expect(nomeDoArquivo(Buffer.from("extrato-março.csv", "utf8").toString("latin1"))).toBe("extrato-março.csv");
    expect(nomeDoArquivo("a\u0000b.csv")).toBe("ab.csv");
  });
});
