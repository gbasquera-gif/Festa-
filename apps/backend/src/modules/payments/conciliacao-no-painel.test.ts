import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEXTO_DO_ALERTA, type MotivoDoAlerta } from "./conferencia-do-provedor";
import type { SituacaoNaConciliacao } from "./payments.service";

/**
 * Toda situação que a conciliação devolve tem de existir na tela.
 *
 * O painel tem a própria lista de situações (rótulo, cor e explicação). Ela
 * ficou para trás de NAO_APROVADO_NO_PROVEDOR — recebido aqui, não aprovado
 * no Mercado Pago —, e a tela inteira ficava em branco justamente quando havia
 * esse alerta. Este teste compara as duas listas: situação nova no servidor
 * sem descrição no painel quebra aqui, não na mão de quem confere o caixa.
 */
const SEM_ALERTA = ["CONFERE", "PAGO_NAO_REGISTRADO", "SEM_PAGAMENTO", "NAO_ENCONTRADO", "ERRO_NA_CONSULTA"] as const;

// Na checagem de tipos (pnpm check): se o servidor ganhar uma situação que não
// está em SEM_ALERTA nem é motivo de alerta, isto deixa de compilar.
type Faltando = Exclude<SituacaoNaConciliacao, (typeof SEM_ALERTA)[number] | MotivoDoAlerta>;
const nenhumaFaltando: [Faltando] extends [never] ? true : false = true;

const SITUACOES: string[] = [...SEM_ALERTA, ...Object.keys(TEXTO_DO_ALERTA)];
const TELA = readFileSync(join(__dirname, "../../../../admin/src/components/financeiro/ConciliacaoMercadoPago.tsx"), "utf8");

describe("situações da conciliação na tela do painel", () => {
  it("a lista do servidor está completa", () => {
    expect(nenhumaFaltando).toBe(true);
    expect(SITUACOES).toContain("NAO_APROVADO_NO_PROVEDOR");
  });

  it.each(SITUACOES)("%s: no tipo, com rótulo e explicação, e na ordem de atenção", (situacao) => {
    expect(TELA).toMatch(new RegExp(`\\|\\s*"${situacao}"`));
    expect(TELA).toMatch(new RegExp(`\\n\\s+${situacao}:\\s*\\{`));
    expect(TELA.slice(TELA.indexOf("const ORDEM"))).toContain(`"${situacao}",`);
  });

  it("situação desconhecida não derruba a tela: vira alerta para conferir", () => {
    expect(TELA).toMatch(/SITUACAO\[situacao as Situacao\] \?\? SITUACAO_DESCONHECIDA/);
    expect(TELA).not.toMatch(/SITUACAO\[(?:i\.)?situacao\]\./);
  });
});
