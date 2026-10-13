import { formatarDiaDoMomento } from "./data-da-festa";
import { primeiroNome } from "./orcamento";
import { fromCentsInt, toCentsInt } from "./pricing";

/**
 * Crédito Festaê: o valor que uma cliente já pagou e que a Festaê passou a
 * dever a ela, para usar numa festa futura.
 *
 * Nasce de um cancelamento, quando a cliente prefere deixar o dinheiro com a
 * Festaê em vez de recebê-lo de volta. Não é dinheiro novo — o dinheiro já
 * entrou, e está no caixa na data em que entrou — e não é desconto: quando a
 * cliente usa o crédito, a festa nova continua valendo o que vale, e o
 * crédito só abate o que ela ainda tem a pagar.
 *
 * O saldo não existe como número guardado. Ele é sempre a soma do extrato,
 * e as regras aqui leem o extrato. É o que impede o saldo de discordar da
 * própria história.
 */

export const TIPOS_DE_MOVIMENTO_DE_CREDITO = [
  "CREDITO_GERADO_CANCELAMENTO",
  "CREDITO_UTILIZADO",
  "ESTORNO_CREDITO_POR_CANCELAMENTO",
  "CREDITO_ESTORNADO",
] as const;
export type TipoDeMovimentoDeCredito = (typeof TIPOS_DE_MOVIMENTO_DE_CREDITO)[number];

export const TIPO_DE_MOVIMENTO_LABEL: Record<TipoDeMovimentoDeCredito, string> = {
  CREDITO_GERADO_CANCELAMENTO: "Crédito gerado por cancelamento",
  CREDITO_UTILIZADO: "Crédito utilizado",
  ESTORNO_CREDITO_POR_CANCELAMENTO: "Crédito devolvido por cancelamento",
  CREDITO_ESTORNADO: "Utilização estornada",
};

/** R$ 1.450,00 — escrito à mão para sair igual no navegador, no servidor e no PDF. */
export function formatarReais(valor: number): string {
  const centavos = Math.abs(toCentsInt(valor));
  const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fracao = String(centavos % 100).padStart(2, "0");
  return `${valor < 0 && centavos > 0 ? "−" : ""}R$ ${inteiro},${fracao}`;
}

/**
 * O número de referência do crédito, como sai no voucher: "00012".
 *
 * É só referência para conversa ("o crédito nº 12"), não código de resgate:
 * quem usa o crédito é a operação, pelo cadastro da cliente.
 */
export function numeroDoCredito(numero: number): string {
  return String(numero).padStart(5, "0");
}

/** Um movimento do extrato, como o painel o recebe. */
export type MovimentoDeCredito = {
  id: string;
  numero: number;
  tipo: TipoDeMovimentoDeCredito;
  /** Com sinal: positivo entra no saldo, negativo sai. */
  valor: number;
  criadoEm: string | Date;
  reservaOrigem: { id: string; numero: number } | null;
  reservaDestino: { id: string; numero: number } | null;
  /** A utilização que este movimento desfaz, quando é um estorno. */
  movimentoReferenciaId: string | null;
  observacao: string | null;
  criadoPor: string | null;
};

const somar = (valores: readonly number[]) =>
  fromCentsInt(valores.reduce((total, v) => total + toCentsInt(v), 0));

/** O saldo de crédito: a soma do extrato. Nunca outro número. */
export function saldoDeCredito(movimentos: readonly { valor: number }[]): number {
  return somar(movimentos.map((m) => m.valor));
}

/**
 * Quanto crédito está abatendo uma reserva agora.
 *
 * Recebe os movimentos que apontam para a reserva como destino: utilizações
 * (negativas no saldo da cliente) e o que voltou delas (estornos, positivos).
 * O aplicado é o que saiu e não voltou.
 */
export function creditoAplicadoNaReserva(movimentosDaReserva: readonly { valor: number }[]): number {
  return fromCentsInt(Math.max(0, -toCentsInt(saldoDeCredito(movimentosDaReserva))));
}

/**
 * O que a linha do extrato diz, em português de quem lê o extrato.
 *
 * `numero` escreve o número da reserva: no painel basta "21"; no papel que
 * vai para a cliente, o número do contrato como ela o conhece ("FE-0021").
 */
export function descricaoDoMovimento(
  m: MovimentoDeCredito,
  numero: (n: number) => string = (n) => String(n),
): string {
  const origem = m.reservaOrigem ? `reserva nº ${numero(m.reservaOrigem.numero)}` : "reserva";
  const destino = m.reservaDestino ? `reserva nº ${numero(m.reservaDestino.numero)}` : "reserva";
  switch (m.tipo) {
    case "CREDITO_GERADO_CANCELAMENTO":
      return `Cancelamento da ${origem}`;
    case "CREDITO_UTILIZADO":
      return `Usado na ${destino}`;
    case "ESTORNO_CREDITO_POR_CANCELAMENTO":
      return `Devolvido ao saldo: ${destino} cancelada`;
    case "CREDITO_ESTORNADO":
      return `Estorno da utilização na ${destino}`;
  }
}

export type LinhaDoExtrato = MovimentoDeCredito & {
  descricao: string;
  /** Quanto entrou no saldo nesta linha, ou nulo. */
  credito: number | null;
  /** Quanto saiu do saldo nesta linha, em valor positivo, ou nulo. */
  utilizacao: number | null;
  /** O saldo depois desta linha. */
  saldo: number;
  /** Utilização que já foi estornada — não pode ser estornada de novo. */
  estornada: boolean;
};

/**
 * O extrato em ordem de acontecimento, com o saldo linha a linha.
 *
 * O saldo corrente é recalculado aqui a partir do zero, e não lido de lugar
 * nenhum: é o que garante que a última linha do extrato e o "crédito
 * disponível" no alto da tela são o mesmo número.
 */
export function extratoDeCredito(movimentos: readonly MovimentoDeCredito[]): LinhaDoExtrato[] {
  const estornadas = new Set(
    movimentos.filter((m) => m.movimentoReferenciaId).map((m) => m.movimentoReferenciaId as string),
  );
  const ordenados = [...movimentos].sort((a, b) => {
    const t = new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime();
    return t !== 0 ? t : a.numero - b.numero;
  });

  let saldo = 0;
  return ordenados.map((m) => {
    saldo += toCentsInt(m.valor);
    return {
      ...m,
      descricao: descricaoDoMovimento(m),
      credito: m.valor > 0 ? m.valor : null,
      utilizacao: m.valor < 0 ? fromCentsInt(-toCentsInt(m.valor)) : null,
      saldo: fromCentsInt(saldo),
      estornada: estornadas.has(m.id),
    };
  });
}

/**
 * Quanto crédito ainda cabe numa reserva.
 *
 * O menor entre o que a cliente tem e o que falta pagar da festa. Crédito
 * acima do que falta seria pagar a festa a mais com dinheiro da própria
 * cliente — e esse excesso não teria para onde voltar.
 */
export function limiteDeAplicacao(entrada: {
  saldoDaCliente: number;
  total: number;
  recebido: number;
  creditoJaAplicado: number;
}): number {
  const falta =
    toCentsInt(entrada.total) - toCentsInt(entrada.recebido) - toCentsInt(entrada.creditoJaAplicado);
  return fromCentsInt(Math.max(0, Math.min(toCentsInt(entrada.saldoDaCliente), falta)));
}

/**
 * Por que este crédito não pode ser aplicado, ou nulo quando pode.
 *
 * As três barreiras de dinheiro: valor positivo, não mais do que a cliente
 * tem, não mais do que falta pagar. O servidor confere de novo sob trava —
 * esta função é a mesma regra, para a tela poder avisar antes.
 */
export function motivoDeRecusaDaAplicacao(entrada: {
  valor: number;
  saldoDaCliente: number;
  faltaPagar: number;
}): string | null {
  const valor = toCentsInt(entrada.valor);
  if (!Number.isFinite(entrada.valor) || valor <= 0) {
    return "Informe um valor de crédito maior que zero.";
  }
  if (valor > toCentsInt(entrada.saldoDaCliente)) {
    return `A cliente tem ${formatarReais(entrada.saldoDaCliente)} de crédito disponível.`;
  }
  if (valor > toCentsInt(entrada.faltaPagar)) {
    return `O crédito não pode passar do que falta pagar nesta festa (${formatarReais(
      Math.max(0, entrada.faltaPagar),
    )}).`;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Tratamento financeiro do cancelamento
 * ------------------------------------------------------------------ */

/** Como o valor pago de uma reserva cancelada é distribuído. */
export type DistribuicaoDoCancelamento = {
  /** Vira crédito Festaê da cliente. */
  credito: number;
  /** Volta para a cliente em dinheiro. É saída de caixa na data do reembolso. */
  reembolso: number;
  /** Fica com a Festaê. Receita de retenção por cancelamento. */
  retencao: number;
};

/**
 * Por que esta distribuição não vale, ou nulo quando vale.
 *
 * A soma tem de ser exatamente o pago — em centavos, sem tolerância. Sobra
 * seria dinheiro sem destino no relatório; falta seria crédito ou reembolso
 * de um valor que nunca entrou.
 */
export function motivoDeRecusaDaDistribuicao(
  recebido: number,
  d: DistribuicaoDoCancelamento,
): string | null {
  const partes = [d.credito, d.reembolso, d.retencao];
  if (partes.some((v) => !Number.isFinite(v) || toCentsInt(v) < 0)) {
    return "Nenhum valor da distribuição pode ser negativo.";
  }
  const soma = partes.reduce((t, v) => t + toCentsInt(v), 0);
  if (soma !== toCentsInt(recebido)) {
    return (
      `A distribuição precisa somar exatamente o valor pago (${formatarReais(recebido)}). ` +
      `Hoje soma ${formatarReais(fromCentsInt(soma))}.`
    );
  }
  return null;
}

/** O tratamento gravado de um cancelamento, como o painel o recebe. */
export type TratamentoDoCancelamento = {
  motivo: string;
  contratado: number;
  recebido: number;
  creditoAplicadoDevolvido: number;
  creditoGerado: number;
  reembolsado: number;
  reembolsadoEm: string | Date | null;
  retido: number;
  definidoEm: string | Date;
};

/**
 * O tratamento em frases, na ordem em que a cliente perguntaria.
 *
 * É o que aparece no detalhe da reserva cancelada: quem abre a reserva daqui
 * a seis meses precisa saber, sem fazer conta, o que foi feito com o dinheiro.
 */
export function frasesDoTratamento(t: TratamentoDoCancelamento): string[] {
  const frases: string[] = [];
  if (toCentsInt(t.creditoGerado) > 0) {
    frases.push(`${formatarReais(t.creditoGerado)} transformados em crédito Festaê`);
  }
  if (toCentsInt(t.reembolsado) > 0) {
    frases.push(
      `${formatarReais(t.reembolsado)} reembolsados à cliente` +
        (t.reembolsadoEm ? ` em ${formatarDiaDoMomento(t.reembolsadoEm)}` : ""),
    );
  }
  if (toCentsInt(t.retido) > 0) {
    frases.push(`${formatarReais(t.retido)} retidos (receita de retenção por cancelamento)`);
  }
  if (toCentsInt(t.creditoAplicadoDevolvido) > 0) {
    frases.push(
      `${formatarReais(t.creditoAplicadoDevolvido)} de crédito Festaê usado nesta festa voltaram ao saldo da cliente`,
    );
  }
  if (frases.length === 0) frases.push("Nenhum valor pago: não houve dinheiro a tratar.");
  return frases;
}

/* ------------------------------------------------------------------ *
 * Voucher de Crédito
 * ------------------------------------------------------------------ */

/**
 * A frase central do voucher.
 *
 * Fala do valor concedido, nunca do saldo atual: o voucher é a prova do que
 * foi registrado naquele dia, e continua valendo o mesmo depois que parte do
 * crédito for usada. Não promete prazo nem condição que o sistema não guarda.
 */
export function textoDoVoucher(valor: number): string {
  return (
    `Este documento confirma que a Festaê registrou um crédito de ${formatarReais(valor)} ` +
    "em favor da cliente acima identificada, disponível para utilização em uma futura " +
    "contratação, conforme as condições comerciais aplicáveis."
  );
}

export const NOTA_DO_VOUCHER =
  "O crédito está vinculado ao cadastro da cliente e sua utilização será registrada no sistema Festaê.";

/**
 * A mensagem que acompanha o voucher no WhatsApp.
 *
 * Só o que está registrado: o valor e que ele está no cadastro. Validade ou
 * regra de uso que o sistema não guarda ficam de fora — prometer por escrito
 * o que ninguém vai conferir depois é criar uma discussão futura.
 */
export function mensagemDoVoucher(nomeDaCliente: string, valor: number): string {
  const nome = primeiroNome(nomeDaCliente);
  return [
    `Oi${nome ? `, ${nome}` : ""}! 💛`,
    "",
    `Conforme combinado, registramos um crédito de ${formatarReais(valor)} em seu cadastro na Festaê para utilização em uma futura festa.`,
    "",
    "Estou enviando também o Voucher de Crédito como comprovante.",
    "",
    "Quando quiser utilizar, é só falar com a gente. ✨",
  ].join("\n");
}
