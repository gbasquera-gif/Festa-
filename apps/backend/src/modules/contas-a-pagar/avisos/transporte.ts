import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Um e-mail de aviso: só texto, sem HTML — nada do que foi digitado vira marcação. */
export type EmailDeAviso = { para: string; assunto: string; texto: string };

/**
 * Falha ao enviar. `motivo` é curto e seguro para guardar e mostrar (código
 * HTTP e nome do erro do provedor): nunca o conteúdo, o destinatário ou a
 * chave de acesso. `repetivel` diz se tentar de novo pode dar certo.
 */
export class FalhaNoEnvio extends Error {
  constructor(
    readonly motivo: string,
    readonly repetivel: boolean,
  ) {
    super(motivo);
    this.name = "FalhaNoEnvio";
  }
}

export interface TransporteDeEmail {
  readonly nome: string;
  /**
   * Envia. A mesma `chave` repetida não entrega duas vezes (o provedor
   * reconhece a chave por 24 horas).
   */
  enviar(email: EmailDeAviso, chave: string): Promise<{ idNoProvedor: string | null }>;
}

const TEMPO_LIMITE_MS = 10_000;

/**
 * Resend (https://resend.com): API HTTP, com chave de idempotência no
 * cabeçalho `Idempotency-Key`, guardada pelo provedor por 24 horas.
 */
export class TransporteResend implements TransporteDeEmail {
  readonly nome = "resend";

  constructor(
    private readonly chaveDeAcesso: string,
    private readonly remetente: string,
    private readonly buscar: typeof fetch = fetch,
  ) {}

  async enviar(email: EmailDeAviso, chave: string) {
    let resposta: Response;
    try {
      resposta = await this.buscar("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.chaveDeAcesso}`,
          "Content-Type": "application/json",
          "Idempotency-Key": chave,
        },
        body: JSON.stringify({ from: this.remetente, to: [email.para], subject: email.assunto, text: email.texto }),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (e) {
      const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new FalhaNoEnvio(tempo ? "tempo esgotado" : "falha de rede", true);
    }

    if (resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as { id?: unknown } | null;
      return { idNoProvedor: typeof corpo?.id === "string" ? corpo.id.slice(0, 100) : null };
    }

    const corpo = (await resposta.json().catch(() => null)) as { name?: unknown } | null;
    const tipo = typeof corpo?.name === "string" ? corpo.name.replace(/[^a-z_]/gi, "").slice(0, 60) : "";
    const repetivel =
      resposta.status === 429 ||
      resposta.status >= 500 ||
      (resposta.status === 409 && tipo === "concurrent_idempotent_requests");
    throw new FalhaNoEnvio(`HTTP ${resposta.status}${tipo ? ` ${tipo}` : ""}`, repetivel);
  }
}

/**
 * Grava cada e-mail num arquivo, em vez de enviar. Só para desenvolvimento,
 * testes e demonstração — recusado em produção. Imita o provedor no que
 * importa: a mesma chave não grava de novo.
 *
 * `falha` simula o provedor fora do ar ("503", "429", "timeout").
 */
export class TransporteArquivo implements TransporteDeEmail {
  readonly nome = "arquivo";

  constructor(
    private readonly diretorio: string,
    private readonly falha: string | null = null,
  ) {
    mkdirSync(diretorio, { recursive: true });
  }

  async enviar(email: EmailDeAviso, chave: string) {
    if (this.falha === "timeout") throw new FalhaNoEnvio("tempo esgotado", true);
    if (this.falha) {
      const status = Number(this.falha);
      throw new FalhaNoEnvio(`HTTP ${status}`, status === 429 || status >= 500);
    }
    const arquivo = join(this.diretorio, `${chave.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
    if (!existsSync(arquivo)) {
      writeFileSync(arquivo, JSON.stringify({ ...email, chave, gravadoEm: new Date().toISOString() }, null, 2));
    }
    return { idNoProvedor: `arquivo:${chave}` };
  }
}

export type ConfiguracaoDoTransporte = { transporte: TransporteDeEmail | null; motivo: string | null };

/**
 * O transporte que o ambiente pede.
 *
 * AVISOS_EMAIL_PROVEDOR=resend  usa RESEND_API_KEY e AVISOS_EMAIL_REMETENTE
 * AVISOS_EMAIL_PROVEDOR=arquivo usa AVISOS_EMAIL_DIRETORIO (fora de produção)
 * ausente                       e-mail desligado; os avisos ficam só no painel
 *
 * Configuração incompleta desliga o e-mail com um motivo legível, em vez de
 * derrubar a API ou a tarefa: o painel e o financeiro seguem funcionando.
 */
export function transporteDoAmbiente(env: NodeJS.ProcessEnv = process.env): ConfiguracaoDoTransporte {
  const provedor = (env.AVISOS_EMAIL_PROVEDOR ?? "").trim().toLowerCase();
  if (provedor === "" || provedor === "desligado") {
    return { transporte: null, motivo: "Envio de e-mail não configurado." };
  }
  if (provedor === "resend") {
    const chave = env.RESEND_API_KEY?.trim();
    const remetente = env.AVISOS_EMAIL_REMETENTE?.trim();
    if (!chave || !remetente) {
      return { transporte: null, motivo: "Envio por Resend sem chave de acesso ou sem remetente configurado." };
    }
    return { transporte: new TransporteResend(chave, remetente), motivo: null };
  }
  if (provedor === "arquivo") {
    if (env.NODE_ENV === "production") {
      return { transporte: null, motivo: "O transporte de teste não é aceito em produção." };
    }
    const diretorio = env.AVISOS_EMAIL_DIRETORIO?.trim();
    if (!diretorio) return { transporte: null, motivo: "Diretório dos e-mails de teste não configurado." };
    return { transporte: new TransporteArquivo(diretorio, env.AVISOS_EMAIL_SIMULAR_FALHA?.trim() || null), motivo: null };
  }
  return { transporte: null, motivo: "Provedor de e-mail desconhecido." };
}
