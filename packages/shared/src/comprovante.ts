import { COMPANY } from "./legal";
import { formatarDataDaFesta } from "./data-da-festa";
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

/** Onde a cliente encontra a Festaê depois de fechar. */
export const FESTAE_CONTATO = {
  telefone: "(49) 99948-7777",
  /** Mesmo número no formato que o WhatsApp entende. */
  whatsapp: "5549999487777",
  email: COMPANY.supportEmail,
  site: "festaechapeco.com.br",
  instagram: "@festae.chapeco",
} as const;

/**
 * O número do contrato, como a cliente lê e dita por telefone.
 *
 * Quatro dígitos com zero à esquerda enquanto couber, e cresce sozinho
 * depois. O ano não entra aqui: ele fica na data do contrato, ao lado. Um
 * número que carregasse o ano sem reiniciar todo janeiro ("FE-2027-0043")
 * diria que houve 43 contratos em 2027, o que seria falso.
 */
export function numeroDoContrato(seq: number | bigint): string {
  return `FE-${String(seq).padStart(4, "0")}`;
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
  contrato: string;
  emitidoEm: string;
  reservadoEm: string;
  dataDaFesta: string;
  cliente: { nome: string; telefone: string | null; email: string | null; endereco: string | null };
  festa: { tipo: string; tema: string | null; convidados: number | null; cidade: string };
  logistica: { entrega: boolean; montagem: boolean; endereco: string | null };
  itens: ItemDoComprovante[];
  valores: { total: number; pago: number; saldo: number; entrega: number; montagem: number; desconto: number };
  pagamentos: PagamentoDoComprovante[];
  /** Falso enquanto nenhum centavo entrou: não é comprovante de pagamento nenhum. */
  temPagamento: boolean;
  observacoes: string | null;
}

/** ISO curto (AAAA-MM-DD) ou instante → 25/09/2026. */
function dia(valor: string | Date): string {
  return formatarDataDaFesta(valor);
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
  valores: { total: number; entrega: number; montagem: number; desconto: number };
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

  const itens: ItemDoComprovante[] = [
    ...(entrada.kit ? [{ descricao: entrada.kit.nome, quantidade: 1 }] : []),
    ...entrada.itens.map((i) => ({ descricao: i.nome, quantidade: i.quantidade })),
  ];

  const enderecoCompleto = [entrada.festa.endereco, entrada.festa.bairro]
    .filter((p) => p && p.trim())
    .join(" — ") || null;

  return {
    contrato: numeroDoContrato(entrada.contractSeq),
    emitidoEm: dia(entrada.emitidoEm ?? new Date()),
    reservadoEm: dia(entrada.requestedAt),
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
      saldo: saldoAPagar(entrada.valores.total, pago),
      entrega: entrada.valores.entrega,
      montagem: entrada.valores.montagem,
      desconto: entrada.valores.desconto,
    },
    pagamentos: entrada.pagamentos
      .filter((p) => p.recebido)
      .map((p) => ({
        valor: p.valor,
        forma: p.forma,
        quando: p.pagoEm ? dia(p.pagoEm) : null,
        recebido: p.recebido,
      })),
    temPagamento: pago > 0,
    observacoes: entrada.observacoes?.trim() || null,
  };
}
