import { diasAte, formatarReais, textoDoPrazo } from "@festae/shared";
import type { EmailDeAviso } from "./transporte";

/**
 * O texto dos e-mails. Funções puras, testadas sem rede.
 *
 * O mínimo para a pessoa agir: o que é, quando vence, e o caminho no
 * painel. Fornecedor, categoria e observação não vão. O valor só vai se o
 * administrador ligar essa opção — caixa de e-mail é menos protegida que o
 * painel. O assunto não traz nem a descrição: ele aparece na tela bloqueada
 * do celular.
 */

export type ContaNoAviso = { descricao: string; vencimento: string; valor: number };

const LIMITE_DA_DESCRICAO = 120;

/** Sem quebra de linha nem caractere de controle: cada conta é uma linha. */
function limpar(texto: string): string {
  const limpo = texto.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return limpo.length > LIMITE_DA_DESCRICAO ? `${limpo.slice(0, LIMITE_DA_DESCRICAO - 1)}…` : limpo;
}

export function dataBrasileira(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function linkDaAba(painel: string | null): string | null {
  if (!painel) return null;
  try {
    const url = new URL("/financeiro", painel);
    url.searchParams.set("aba", "contas");
    return url.toString();
  } catch {
    return null;
  }
}

export function emailDeContas(opcoes: {
  para: string;
  contas: ContaNoAviso[];
  hoje: string;
  mostrarValor: boolean;
  painel: string | null;
}): EmailDeAviso {
  const contas = [...opcoes.contas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const assunto =
    contas.length === 1
      ? `Festaê · conta a pagar ${textoDoPrazo(diasAte(opcoes.hoje, contas[0].vencimento))}`
      : `Festaê · ${contas.length} contas a pagar pedem atenção`;
  const linhas = contas.map((c) => {
    const prazo = `${textoDoPrazo(diasAte(opcoes.hoje, c.vencimento))} (${dataBrasileira(c.vencimento)})`;
    return `• ${limpar(c.descricao)} — ${prazo}${opcoes.mostrarValor ? ` — ${formatarReais(c.valor)}` : ""}`;
  });
  const link = linkDaAba(opcoes.painel);
  const texto = [
    "Olá,",
    "",
    contas.length === 1 ? "Uma conta a pagar da Festaê pede atenção:" : "Contas a pagar da Festaê que pedem atenção:",
    "",
    ...linhas,
    "",
    link
      ? `Para ver os detalhes e registrar o pagamento, abra o painel: ${link}`
      : "Para ver os detalhes e registrar o pagamento, abra o painel em Financeiro › Contas a pagar.",
    "",
    "Este aviso não registra pagamento nenhum: a conta só sai de “a pagar” quando o pagamento é informado no painel.",
    "Para deixar de receber, peça a um administrador que desative este endereço em Financeiro › Contas a pagar › Avisos.",
  ].join("\n");
  return { para: opcoes.para, assunto, texto };
}

export function emailDoCodigo(para: string, codigo: string, minutos: number): EmailDeAviso {
  return {
    para,
    assunto: "Festaê · código para receber os avisos de contas",
    texto: [
      "Olá,",
      "",
      `O código para confirmar este endereço nos avisos de contas a pagar da Festaê é: ${codigo}`,
      "",
      `Ele vale por ${minutos} minutos. Se você não pediu, ignore este e-mail: sem o código, nada é enviado para cá.`,
    ].join("\n"),
  };
}
