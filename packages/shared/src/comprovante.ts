import { EMPRESA } from "./empresa";
import { formatarDataDaFesta, formatarDiaDoMomento } from "./data-da-festa";
import { saldoAPagar } from "./pricing";

/**
 * O comprovante que a cliente guarda.
 *
 * É o único papel que sai da Festaê e fica com outra pessoa. Ele responde,
 * sem que ninguém precise perguntar no WhatsApp: quanto eu paguei, quanto
 * falta, o que vem na minha festa, e em que dia. Uma dúvida dessas resolvida
 * no papel é uma conversa a menos na véspera — e a véspera é justamente
 * quando a operação tem menos tempo.
 *
 * A montagem dos dados mora aqui, e não na tela, porque o que ele afirma é
 * dinheiro e compromisso: merece teste, e teste não roda dentro de um
 * componente de impressão.
 */

/** Onde a cliente encontra a Festaê depois de fechar. Lido de `EMPRESA`. */
export const FESTAE_CONTATO = {
  telefone: EMPRESA.contato.telefone,
  /** Mesmo número no formato que o WhatsApp entende. */
  whatsapp: EMPRESA.contato.whatsapp,
  email: EMPRESA.contato.email,
  site: EMPRESA.contato.site,
  instagram: EMPRESA.contato.instagram,
} as const;

/**
 * O número da reserva, como a cliente lê e dita por telefone.
 *
 * Quatro dígitos com zero à esquerda enquanto couber, e cresce sozinho
 * depois. O ano não entra aqui: ele fica na data da reserva, ao lado. Um
 * número que carregasse o ano sem reiniciar todo janeiro ("FE-2027-0043")
 * diria que houve 43 reservas em 2027, o que seria falso.
 *
 * É o número da reserva, não de um contrato: o contrato digital terá
 * numeração própria (CT-0001).
 */
export function numeroDaReserva(seq: number | bigint): string {
  return `FE-${String(seq).padStart(4, "0")}`;
}

/**
 * Nome antigo de `numeroDaReserva`. Continua para o Financeiro e o
 * assistente, que não mudam nesta entrega.
 */
export const numeroDoContrato = numeroDaReserva;

/**
 * A linha do recibo sobre os Termos de Uso.
 *
 * Cita só a versão que a cliente aceitou de fato — a que ficou gravada no
 * cadastro dela — e só se o aceite for anterior à reserva. O recibo é montado
 * de novo a cada abertura; numa reimpressão, ele não pode afirmar sobre uma
 * reserva antiga um aceite que só aconteceu depois dela, nem atribuir uma
 * versão pela data ou pelo histórico de publicações.
 *
 * Sem aceite gravado, sem data do aceite ou com aceite posterior à reserva,
 * o recibo diz que não há registro até a data da reserva: uma versão
 * presumida num papel que a cliente guarda seria uma afirmação que ninguém
 * consegue provar.
 */
export function notaDosTermosDeUso(
  aceite: { versao: string | null; aceitoEm: string | Date | null },
  reservadaEm: string | Date,
): string {
  const vigente = `A versão vigente está em reservas.${EMPRESA.contato.site}/legal/termos.`;
  const aceitoEm = aceite.aceitoEm ? new Date(aceite.aceitoEm).getTime() : NaN;
  const anteriorAReserva = Number.isFinite(aceitoEm) && aceitoEm <= new Date(reservadaEm).getTime();
  if (!aceite.versao || !anteriorAReserva) {
    return `Não há registro de aceite dos Termos de Uso da Festaê pela cliente até a data desta reserva. ${vigente}`;
  }
  return `Termos de Uso da Festaê aceitos pela cliente na versão ${aceite.versao}, em ${diaDoMomento(aceite.aceitoEm!)}, antes desta reserva. ${vigente}`;
}

export interface ItemDoComprovante {
  descricao: string;
  quantidade: number;
}

export interface PagamentoDoComprovante {
  valor: number;
  forma: string;
  quando: string | null;
  recebido: boolean;
}

export interface DadosDoComprovante {
  /** O número da reserva, FE-0042. */
  reserva: string;
  emitidoEm: string;
  reservadoEm: string;
  dataDaFesta: string;
  cliente: { nome: string; telefone: string | null; email: string | null; endereco: string | null };
  festa: { tipo: string; tema: string | null; convidados: number | null; cidade: string };
  logistica: { entrega: boolean; montagem: boolean; endereco: string | null };
  itens: ItemDoComprovante[];
  valores: {
    total: number;
    pago: number;
    /** Crédito Festaê usado nesta festa. Não é pagamento: abate o saldo. */
    credito: number;
    saldo: number;
    entrega: number;
    montagem: number;
    desconto: number;
  };
  pagamentos: PagamentoDoComprovante[];
  /** Falso enquanto nenhum centavo entrou: não é comprovante de pagamento nenhum. */
  temPagamento: boolean;
  /** Parte da festa coberta por crédito Festaê. */
  temCredito: boolean;
  observacoes: string | null;
}

/** O dia da festa → 25/09/2026. É um dia do calendário, gravado como tal. */
function dia(valor: string | Date): string {
  return formatarDataDaFesta(valor);
}

/**
 * Um momento — emissão, pedido da reserva, recebimento — no dia de Chapecó.
 *
 * Lido em UTC, um Pix das 21h30 de 05/10 virava 06/10 no papel: às 21h de
 * Chapecó já é o dia seguinte em UTC. Pagamento com data informada à mão é
 * gravado ao meio-dia UTC, que em Chapecó continua sendo o mesmo dia.
 */
function diaDoMomento(valor: string | Date): string {
  return formatarDiaDoMomento(valor);
}

export interface EntradaDoComprovante {
  contractSeq: number | bigint;
  requestedAt: string | Date;
  eventDate: string | Date;
  cliente: { nome: string; telefone: string | null; email: string | null };
  festa: {
    tipo: string;
    tema: string | null;
    convidados: number | null;
    cidade: string;
    endereco: string | null;
    bairro: string | null;
  };
  logistica: { entrega: boolean; montagem: boolean };
  kit: { nome: string } | null;
  itens: { nome: string; quantidade: number }[];
  valores: {
    total: number;
    entrega: number;
    montagem: number;
    desconto: number;
    /** Crédito Festaê aplicado, líquido de estornos. */
    creditoAplicado?: number;
  };
  pagamentos: { valor: number; forma: string; pagoEm: string | Date | null; recebido: boolean }[];
  observacoes: string | null;
  emitidoEm?: Date;
}

/**
 * Monta o comprovante a partir da reserva.
 *
 * O saldo sai de `saldoAPagar`, a mesma função que decide o valor do Pix.
 * Se o papel dissesse um número e a cobrança outro, o papel viraria motivo
 * de discussão em vez de prova — e quem tem razão numa discussão dessas é
 * sempre quem está com o comprovante na mão.
 */
export function montarComprovante(entrada: EntradaDoComprovante): DadosDoComprovante {
  const pago = entrada.pagamentos
    .filter((p) => p.recebido)
    .reduce((soma, p) => soma + p.valor, 0);
  const credito = Math.max(0, entrada.valores.creditoAplicado ?? 0);

  const itens: ItemDoComprovante[] = [
    ...(entrada.kit ? [{ descricao: entrada.kit.nome, quantidade: 1 }] : []),
    ...entrada.itens.map((i) => ({ descricao: i.nome, quantidade: i.quantidade })),
  ];

  const enderecoCompleto = [entrada.festa.endereco, entrada.festa.bairro]
    .filter((p) => p && p.trim())
    .join(" — ") || null;

  return {
    reserva: numeroDaReserva(entrada.contractSeq),
    emitidoEm: diaDoMomento(entrada.emitidoEm ?? new Date()),
    reservadoEm: diaDoMomento(entrada.requestedAt),
    dataDaFesta: dia(entrada.eventDate),
    cliente: {
      nome: entrada.cliente.nome,
      telefone: entrada.cliente.telefone,
      email: entrada.cliente.email,
      endereco: enderecoCompleto,
    },
    festa: {
      tipo: entrada.festa.tipo,
      tema: entrada.festa.tema,
      convidados: entrada.festa.convidados,
      cidade: entrada.festa.cidade,
    },
    logistica: {
      entrega: entrada.logistica.entrega,
      montagem: entrada.logistica.montagem,
      // Endereço só aparece quando há entrega: numa retirada ele é o endereço
      // da casa da cliente, que não tem por que estar no documento.
      endereco: entrada.logistica.entrega ? enderecoCompleto : null,
    },
    itens,
    valores: {
      total: entrada.valores.total,
      pago,
      credito,
      // Crédito abate o saldo como um pagamento abateria, e aparece em linha
      // própria: a cliente precisa ver quanto pagou e quanto usou de crédito.
      saldo: saldoAPagar(entrada.valores.total, pago + credito),
      entrega: entrada.valores.entrega,
      montagem: entrada.valores.montagem,
      desconto: entrada.valores.desconto,
    },
    pagamentos: entrada.pagamentos
      .filter((p) => p.recebido)
      .map((p) => ({
        valor: p.valor,
        forma: p.forma,
        quando: p.pagoEm ? diaDoMomento(p.pagoEm) : null,
        recebido: p.recebido,
      })),
    temPagamento: pago > 0,
    temCredito: credito > 0,
    observacoes: entrada.observacoes?.trim() || null,
  };
}
