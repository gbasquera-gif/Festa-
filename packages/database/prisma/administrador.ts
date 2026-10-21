/**
 * O que o seed faz com a conta de administrador a cada boot.
 *
 * O seed roda em todo boot do container: deploy, reinício manual, reinício
 * automático. Antes, ele regravava a senha de SEED_ADMIN_PASSWORD, devolvia
 * o papel ADMIN e reativava a conta toda vez — uma senha trocada no painel
 * voltava a ser a da variável no reinício seguinte, e um administrador
 * desativado ou rebaixado voltava sozinho.
 *
 * A regra agora:
 *
 * - **Instalação** (a conta não existe, nenhuma conta ADMIN existe — nem
 *   desativada — e nenhuma criação inicial foi registrada): cria.
 * - **Conta existente**: não toca em nada. Senha, papel e situação são do
 *   painel.
 * - **Recuperação**: só a pedido explícito, com SEED_ADMIN_RECUPERACAO =
 *   um identificador do pedido. Aplica uma vez por pedido (fica registrado em
 *   `recuperacoes_de_acesso`), troca a senha, devolve o papel ADMIN e marca
 *   `passwordChangedAt`, que derruba as sessões abertas. Conta excluída não é
 *   reativada.
 *
 * Fica em `prisma/`, e não em `src/`, porque a contingência leva só esta
 * pasta do commit publicado: o seed precisa achar tudo o que importa aqui.
 */

/** A conta de SEED_ADMIN_EMAIL como está no banco, ou null se não existe. */
export type ContaDoAdmin = { role: string; deletedAt: Date | null } | null;

export type EntradaDoAdmin = {
  email?: string;
  senha?: string;
  /** Valor de SEED_ADMIN_RECUPERACAO. */
  pedido?: string;
  conta: ContaDoAdmin;
  /**
   * Já houve instalação: existe outra conta ADMIN (ativa ou desativada) ou a
   * criação inicial já foi registrada. Então o seed não cria administrador sozinho.
   */
  instalacaoJaFeita: boolean;
  /** Este pedido de recuperação já foi aplicado a esta conta. */
  pedidoJaAplicado: boolean;
};

export type DecisaoDoAdmin =
  | { acao: "NADA"; motivo: string }
  | { acao: "CRIAR"; pedido: string }
  | { acao: "PRESERVAR"; motivo: string }
  | { acao: "RECUPERAR"; pedido: string; promover: boolean }
  | { acao: "RECUSAR"; motivo: string };

/** Identificador do pedido: curto, sem espaço, para virar chave e aparecer no log. */
export const FORMATO_DO_PEDIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;

/** O pedido gravado quando o seed cria o administrador da instalação. */
export const PEDIDO_DA_INSTALACAO = "criacao-inicial";

export function decidirAdministrador(e: EntradaDoAdmin): DecisaoDoAdmin {
  const pedido = e.pedido?.trim() || undefined;

  if (!e.email || !e.senha) {
    if (pedido) {
      return { acao: "RECUSAR", motivo: "SEED_ADMIN_RECUPERACAO precisa de SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD." };
    }
    return { acao: "NADA", motivo: "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD não definidos: nenhuma conta foi criada ou alterada." };
  }

  if (pedido !== undefined) {
    if (!FORMATO_DO_PEDIDO.test(pedido) || pedido === PEDIDO_DA_INSTALACAO) {
      return {
        acao: "RECUSAR",
        motivo: "SEED_ADMIN_RECUPERACAO inválido: use um identificador de 3 a 80 letras, números, ponto, hífen ou sublinhado (ex.: 2026-10-22-senha-perdida).",
      };
    }
    if (!e.conta) return { acao: "CRIAR", pedido };
    if (e.conta.deletedAt) {
      return { acao: "RECUSAR", motivo: "a conta foi excluída e não é reativada. Para um administrador novo, use outro e-mail em SEED_ADMIN_EMAIL." };
    }
    if (e.pedidoJaAplicado) {
      return { acao: "PRESERVAR", motivo: `o pedido de recuperação "${pedido}" já foi aplicado. Remova SEED_ADMIN_RECUPERACAO das variáveis.` };
    }
    return { acao: "RECUPERAR", pedido, promover: e.conta.role !== "ADMIN" };
  }

  if (!e.conta) {
    if (e.instalacaoJaFeita) {
      return {
        acao: "PRESERVAR",
        motivo: "já existe (ou existiu) administrador e esta conta não existe: o seed não cria outra. Use o painel, ou SEED_ADMIN_RECUPERACAO para criar por pedido explícito.",
      };
    }
    return { acao: "CRIAR", pedido: PEDIDO_DA_INSTALACAO };
  }

  const situacao = e.conta.deletedAt ? "excluída" : e.conta.role !== "ADMIN" ? `com papel ${e.conta.role}` : null;
  return {
    acao: "PRESERVAR",
    motivo: situacao
      ? `a conta existe, ${situacao}. O seed não muda isso; só um pedido explícito (SEED_ADMIN_RECUPERACAO) recupera o acesso.`
      : "a conta existe: senha, papel e situação preservados.",
  };
}
