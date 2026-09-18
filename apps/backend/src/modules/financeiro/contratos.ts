import {
  SITUACOES_DE_PAGAMENTO,
  mesEmChapeco,
  recebidoDoContrato,
  resumoDaCarteira,
  saldoDoContrato,
  situacaoDePagamento,
  type ContratoApurado,
  type ResumoDaCarteira,
  type SituacaoDePagamento,
} from "@festae/shared";

/**
 * A leitura comercial de uma reserva.
 *
 * Não existe entidade "Venda" neste sistema, e isso é decisão de arquitetura,
 * não omissão: `Reservation + Order` já é o contrato. Uma tabela paralela de
 * vendas precisaria ser mantida em sincronia com a reserva a cada edição de
 * data, item ou valor — e a primeira vez que alguém esquecesse, o faturamento
 * e a operação passariam a contar festas diferentes. Foi exatamente esse o
 * defeito do painel antigo, onde a mesma festa existia em dois lugares.
 *
 * Este módulo é só projeção: lê a reserva e devolve o que a área financeira
 * precisa ver. Nada aqui grava.
 *
 * É função pura, fora do serviço, pelo mesmo motivo que `periodo.ts`: o que
 * decide se um contrato está vencido é uma comparação de datas, e comparação
 * de datas precisa de teste que rode na véspera, no dia e no dia seguinte sem
 * depender de um Postgres de pé.
 */

/** Dinheiro como o Prisma devolve: Decimal, string ou número. */
export type ValorDoBanco = number | string | { toString(): string };

function paraNumero(valor: ValorDoBanco): number {
  return typeof valor === "number" ? valor : Number(valor.toString());
}

/**
 * Status de reserva que ainda valem dinheiro.
 *
 * É a mesma lista que a apuração de indicadores usa, e tem de continuar
 * sendo: se as duas divergirem, a carteira de contratos e a saúde financeira
 * passam a somar conjuntos diferentes, e a conciliação entre as duas telas —
 * que é como se descobre um erro — deixa de valer.
 */
export const STATUS_VIGENTES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
] as const;

export type ReservaCrua = {
  id: string;
  contractSeq: number;
  status: string;
  eventDate: Date;
  requestedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  rescheduledFrom: Date | null;
  origemDoRegistro: string;
  referenciaExterna: string | null;
  order: {
    total: ValorDoBanco;
    fulfillment: string;
    assembly: boolean;
    kit: { name: string } | null;
    event: {
      city: string;
      saleChannel: string;
      guestCount: number | null;
      type: string;
      theme: { name: string } | null;
      // E-mail é opcional: venda de balcão fecha com nome e telefone, e
      // exigir e-mail para cadastrar já custou venda à operação.
      user: { name: string; email: string | null; phone: string | null };
    };
    payments: {
      id: string;
      type: string;
      status: string;
      method: string;
      amount: ValorDoBanco;
      paidAt: Date | null;
    }[];
  };
};

export type ContratoComercial = {
  id: string;
  numero: number;
  status: string;
  /** Se entra nos totais. Cancelada e rejeitada aparecem na lista, mas não somam. */
  vigente: boolean;
  festaEm: string;
  fechadoEm: string;
  remarcadaDe: string | null;
  /** Veio da carga do painel antigo. A política comercial dela não foi conferida. */
  migrado: boolean;
  cliente: { nome: string; telefone: string | null; email: string | null };
  cidade: string;
  canal: string;
  tipoDeFesta: string;
  convidados: number | null;
  tema: string | null;
  kit: string | null;
  entrega: boolean;
  montagem: boolean;
  valor: number;
  recebido: number;
  saldo: number;
  situacao: SituacaoDePagamento;
  /** O saldo vence no dia da festa: é quando a cliente paga, na retirada ou na entrega. */
  venceEm: string;
  /** Recebimento sem data conhecida — herança do painel antigo, nunca recuperável. */
  temRecebimentoSemData: boolean;
  pagamentos: {
    id: string;
    tipo: string;
    metodo: string;
    valor: number;
    recebidoEm: string | null;
  }[];
};

/** O dia do calendário de uma data já ancorada ao meio-dia UTC. */
function dia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/**
 * O contrato do ponto de vista do dinheiro, para as funções de @festae/shared.
 *
 * Só pagamento PAID vira recebimento. Um Pix pendente é uma intenção, não
 * dinheiro — contá-lo faria a carteira exibir como recebido o que ainda pode
 * expirar sem nunca ter entrado.
 */
export function apurar(reserva: ReservaCrua): ContratoApurado {
  return {
    fechadoEm: reserva.requestedAt,
    festaEm: reserva.eventDate,
    valor: paraNumero(reserva.order.total),
    cancelado: !ehVigente(reserva),
    recebimentos: reserva.order.payments
      .filter((p) => p.status === "PAID")
      .map((p) => ({ valor: paraNumero(p.amount), recebidoEm: p.paidAt })),
  };
}

function ehVigente(reserva: ReservaCrua): boolean {
  return (
    reserva.cancelledAt === null &&
    (STATUS_VIGENTES as readonly string[]).includes(reserva.status)
  );
}

/** A reserva inteira, traduzida para a linguagem da área financeira. */
export function montarContrato(reserva: ReservaCrua, agora: Date): ContratoComercial {
  const apurado = apurar(reserva);
  const pagos = reserva.order.payments.filter((p) => p.status === "PAID");

  return {
    id: reserva.id,
    numero: reserva.contractSeq,
    status: reserva.status,
    vigente: ehVigente(reserva),
    festaEm: dia(reserva.eventDate),
    fechadoEm: dia(reserva.requestedAt),
    remarcadaDe: reserva.rescheduledFrom ? dia(reserva.rescheduledFrom) : null,
    migrado: reserva.origemDoRegistro === "MIGRACAO" || reserva.referenciaExterna !== null,
    cliente: {
      nome: reserva.order.event.user.name,
      telefone: reserva.order.event.user.phone,
      email: reserva.order.event.user.email,
    },
    cidade: reserva.order.event.city,
    canal: reserva.order.event.saleChannel,
    tipoDeFesta: reserva.order.event.type,
    convidados: reserva.order.event.guestCount,
    tema: reserva.order.event.theme?.name ?? null,
    kit: reserva.order.kit?.name ?? null,
    entrega: reserva.order.fulfillment === "DELIVERY",
    montagem: reserva.order.assembly,
    valor: apurado.valor,
    recebido: recebidoDoContrato(apurado),
    saldo: saldoDoContrato(apurado),
    situacao: situacaoDePagamento(apurado, agora),
    venceEm: dia(reserva.eventDate),
    temRecebimentoSemData: pagos.some((p) => p.paidAt === null),
    pagamentos: pagos
      .map((p) => ({
        id: p.id,
        tipo: p.type,
        metodo: p.method,
        valor: paraNumero(p.amount),
        recebidoEm: p.paidAt ? p.paidAt.toISOString() : null,
      }))
      .sort((a, b) => (a.recebidoEm ?? "").localeCompare(b.recebidoEm ?? "")),
  };
}

/**
 * Uma linha da carteira, nas duas leituras que ela tem.
 *
 * As duas andam juntas de propósito. A tela filtra pela leitura comercial
 * (situação, cliente, mês) e os totais somam pela leitura financeira — e se
 * a segunda fosse reconstruída a partir da primeira, o resumo passaria a
 * somar dados já arredondados para exibição. Carregar as duas custa um
 * ponteiro; recalcular custa a confiança no total.
 */
export type LinhaDaCarteira = {
  comercial: ContratoComercial;
  apurado: ContratoApurado;
};

export function montarLinha(reserva: ReservaCrua, agora: Date): LinhaDaCarteira {
  const apurado = apurar(reserva);
  return { comercial: montarContrato(reserva, agora), apurado };
}

export type FiltroDeContratos = {
  /** Mês da festa, "AAAA-MM". É competência: a festa pertence ao mês em que acontece. */
  mes?: string;
  situacao?: SituacaoDePagamento;
  /** Nome da cliente, cidade ou número do contrato. */
  busca?: string;
};

export function ehSituacao(valor: string): valor is SituacaoDePagamento {
  return (SITUACOES_DE_PAGAMENTO as readonly string[]).includes(valor);
}

/**
 * Filtra a carteira já apurada.
 *
 * Em memória, e não em SQL, porque situação de pagamento não é uma coluna:
 * ela depende da soma dos pagamentos comparada ao total e à data da festa.
 * Reproduzi-la como `WHERE` seria escrever a regra uma segunda vez, em outra
 * linguagem — e a segunda cópia é a que envelhece errado.
 */
export function filtrarLinhas(
  linhas: readonly LinhaDaCarteira[],
  filtro: FiltroDeContratos,
): LinhaDaCarteira[] {
  const busca = filtro.busca?.trim().toLowerCase() ?? "";

  return linhas.filter(({ comercial }) => {
    if (filtro.mes && mesEmChapeco(new Date(`${comercial.festaEm}T12:00:00.000Z`)) !== filtro.mes) {
      return false;
    }
    if (filtro.situacao && comercial.situacao !== filtro.situacao) return false;
    if (busca) {
      const alvo = [
        comercial.cliente.nome,
        comercial.cidade,
        String(comercial.numero),
        comercial.tema ?? "",
        comercial.kit ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

/**
 * A ordem em que a carteira é lida.
 *
 * Não é cronológica, e a diferença importa. Ordenar por data da festa põe o
 * que já venceu no fim da lista — o dinheiro em risco fica abaixo de tudo que
 * está em dia, e quem abre a tela vê primeiro o que não precisa de ação.
 *
 * Então: vencido primeiro, do mais antigo para o mais novo, porque atraso
 * antigo é o que cobra pior; depois o que ainda vem, da festa mais próxima
 * para a mais distante, que é a ordem em que o saldo vai vencer; por último o
 * que já foi quitado e o que foi cancelado, que não pedem nada de ninguém.
 */
const PESO_DA_SITUACAO: Record<SituacaoDePagamento, number> = {
  VENCIDO: 0,
  PARCIAL: 1,
  AGUARDANDO: 1,
  QUITADO: 2,
  CANCELADO: 3,
};

export function ordenarLinhas(linhas: readonly LinhaDaCarteira[]): LinhaDaCarteira[] {
  return [...linhas].sort((a, b) => {
    const peso = PESO_DA_SITUACAO[a.comercial.situacao] - PESO_DA_SITUACAO[b.comercial.situacao];
    if (peso !== 0) return peso;
    // Dentro do grupo, sempre da festa mais antiga para a mais recente: para
    // os vencidos isso é o atraso mais longo primeiro, e para os que ainda
    // vêm é o próximo vencimento primeiro. É a mesma regra nos dois casos.
    if (a.comercial.festaEm !== b.comercial.festaEm) {
      return a.comercial.festaEm.localeCompare(b.comercial.festaEm);
    }
    return a.comercial.numero - b.comercial.numero;
  });
}

/**
 * O resumo da carteira exibida.
 *
 * Soma só os vigentes, e é isso que faz os totais desta tela fecharem com os
 * da Visão Geral: as duas partem do mesmo conjunto. Uma reserva cancelada
 * continua listada — a operação precisa vê-la — mas não entra em número
 * nenhum, e a tela diz isso.
 */
export function resumir(linhas: readonly LinhaDaCarteira[], agora: Date): ResumoDaCarteira {
  return resumoDaCarteira(
    linhas.map((linha) => linha.apurado),
    agora,
  );
}
