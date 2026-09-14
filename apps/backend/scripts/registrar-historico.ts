/**
 * Registra no Postgres um contrato que já aconteceu.
 *
 * Não é `manualReservation.criar` com uma flag. É outro caminho, com outro
 * nome, porque a diferença entre os dois não é de configuração: um pergunta
 * "devemos aceitar este negócio?" e o outro registra um negócio que já foi
 * aceito, cumprido e, em parte, pago.
 *
 * O que continua valendo aqui, inteiro:
 *   integridade — o total fecha, a data é real, o recebido não passa do
 *   contrato, o mesmo contrato não entra duas vezes.
 *
 * O que não se aplica:
 *   política comercial — cidade atendida, tabela de taxas, capacidade do dia.
 *   Rodar essas regras sobre fato consumado só tem duas saídas, e as duas são
 *   ruins: bloquear o registro, ou adulterar o dado para ele passar.
 *
 * Este arquivo não tem rota HTTP e não é importado pelo servidor. Ele existe
 * para ser chamado por script de carga, por quem tem acesso ao banco.
 *
 * Ver docs/MIGRACAO-DE-HISTORICO.md.
 */
import { prisma } from "@festae/database";
import type { Prisma } from "@festae/database";

export type ExcecaoParaRegistrar = {
  regra: string;
  justificativa: string;
  origemDaInformacao: "detectada" | "declarada";
};

export type ContratoHistorico = {
  /** Chave do contrato na origem. É o que torna a carga idempotente. */
  referenciaExterna: string;
  cliente: string;
  fechadoEm: Date;
  festaEm: Date;
  cidade: string;
  tipoDeEvento: "ANIVERSARIO" | "CHA_DE_BEBE" | "CHA_REVELACAO" | "BATIZADO" | "OUTRO";
  entrega: boolean;
  montagem: boolean;
  valor: number;
  /** Quanto entrou, e em que papel — ver PaymentType.INDETERMINADO.
   *
   * Lista, e não um valor só, porque um contrato pode ter parte comprovada
   * como sinal e parte de papel desconhecido: é o caso de um contrato quitado
   * cujo campo de sinal registra uma parcela e o resto só existe no status. */
  recebimentos: { valor: number; tipo: "DEPOSIT" | "BALANCE" | "INDETERMINADO" }[];
  observacao?: string;
  excecoes: ExcecaoParaRegistrar[];
};

export class HistoricoInvalido extends Error {}

/** As conferências que valem mesmo sobre fato consumado. */
export function conferirIntegridade(contrato: ContratoHistorico): string[] {
  const problemas: string[] = [];
  if (contrato.valor <= 0) problemas.push("valor do contrato não é positivo");
  const recebido = contrato.recebimentos.reduce((soma, r) => soma + r.valor, 0);
  if (recebido > contrato.valor + 0.005)
    problemas.push("recebido maior que o valor do contrato");
  if (contrato.recebimentos.some((r) => r.valor <= 0))
    problemas.push("recebimento com valor não positivo");
  if (contrato.festaEm < contrato.fechadoEm)
    problemas.push("data da festa anterior à data do contrato");
  if (!contrato.cliente.trim()) problemas.push("contrato sem nome de cliente");
  return problemas;
}

/**
 * Grava o contrato, ou devolve o que já existe.
 *
 * Tudo numa transação: um contrato meio gravado — reserva sem pagamento, ou
 * pagamento sem exceção — seria pior que nenhum, porque pareceria completo.
 */
export async function registrarHistorico(contrato: ContratoHistorico) {
  const problemas = conferirIntegridade(contrato);
  if (problemas.length > 0) {
    throw new HistoricoInvalido(`${contrato.referenciaExterna}: ${problemas.join("; ")}`);
  }

  const jaExiste = await prisma.reservation.findUnique({
    where: { referenciaExterna: contrato.referenciaExterna },
    select: { id: true },
  });
  if (jaExiste) return { reservaId: jaExiste.id, criada: false };

  const reservaId = await prisma.$transaction(async (tx) => {
    const cliente = await acharOuCriarCliente(tx, contrato.cliente);

    const evento = await tx.event.create({
      data: {
        userId: cliente.id,
        type: contrato.tipoDeEvento,
        date: contrato.festaEm,
        city: contrato.cidade,
        // A venda foi fechada fora da loja; a origem não diz por qual canal.
        saleChannel: "OUTRO",
        createdAt: contrato.fechadoEm,
      },
    });

    const pedido = await tx.order.create({
      data: {
        eventId: evento.id,
        status: "CONFIRMED",
        // A origem guarda um valor só, sem separar serviço de taxa. Gravar a
        // taxa da tabela inventaria uma cobrança que talvez não tenha
        // existido, e faria o total discordar do contrato.
        subtotalKit: 0,
        subtotalExtras: contrato.valor,
        deliveryFee: 0,
        assemblyFee: 0,
        total: contrato.valor,
        fulfillment: contrato.entrega ? "DELIVERY" : "PICKUP",
        assembly: contrato.montagem,
        notes: contrato.observacao || null,
        createdAt: contrato.fechadoEm,
      },
    });

    for (const recebimento of contrato.recebimentos) {
      await tx.payment.create({
        data: {
          orderId: pedido.id,
          type: recebimento.tipo,
          amount: recebimento.valor,
          method: "OUTRO",
          status: "PAID",
          // Sem data: a origem guardava quanto, nunca quando. Uma data
          // inventada faria o caixa de um mês qualquer parecer melhor.
          paidAt: null,
          createdAt: contrato.fechadoEm,
        },
      });
    }

    const reserva = await tx.reservation.create({
      data: {
        orderId: pedido.id,
        eventDate: contrato.festaEm,
        // A festa já aconteceu ou está contratada; o status descreve a
        // operação, não o pagamento — isso vive nos Payment.
        status: contrato.festaEm < new Date() ? "COMPLETED" : "CONFIRMED",
        requestedAt: contrato.fechadoEm,
        confirmedAt: contrato.fechadoEm,
        origemDoRegistro: "MIGRACAO",
        referenciaExterna: contrato.referenciaExterna,
      },
    });

    for (const excecao of contrato.excecoes) {
      await tx.excecaoComercial.create({
        data: {
          reservationId: reserva.id,
          regra: excecao.regra,
          justificativa: excecao.justificativa,
          origemDaInformacao: excecao.origemDaInformacao,
          // Nulo de propósito: a decisão é anterior ao sistema.
          autorizadaPorId: null,
        },
      });
    }

    return reserva.id;
  });

  return { reservaId, criada: true };
}

/**
 * Registra exceções numa reserva que já existe.
 *
 * Serve para o contrato que a operação já cadastrou: a reserva é preservada
 * como está, e só o rastro da exceção é acrescentado. É gravação aditiva —
 * uma linha numa tabela nova — e não altera nada do que já estava lá.
 */
export async function registrarExcecoes(
  reservaId: string,
  excecoes: ExcecaoParaRegistrar[],
): Promise<number> {
  let gravadas = 0;
  for (const excecao of excecoes) {
    const resultado = await prisma.excecaoComercial.upsert({
      where: { reservationId_regra: { reservationId: reservaId, regra: excecao.regra } },
      create: {
        reservationId: reservaId,
        regra: excecao.regra,
        justificativa: excecao.justificativa,
        origemDaInformacao: excecao.origemDaInformacao,
      },
      // Não sobrescreve justificativa já revisada por uma pessoa.
      update: {},
      select: { autorizadaEm: true },
    });
    if (resultado) gravadas += 1;
  }
  return gravadas;
}

/**
 * Acha o cliente pelo nome, ou cria.
 *
 * A origem só tem o nome — nem telefone, nem e-mail. Criar sem contato é
 * aceitável aqui porque o contrato já foi cumprido; para venda nova o
 * telefone continua obrigatório, que é como a operação fala com a cliente no
 * dia da festa.
 */
async function acharOuCriarCliente(tx: Prisma.TransactionClient, nome: string) {
  const limpo = nome.trim();
  const existente = await tx.user.findFirst({
    where: { name: { equals: limpo, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });
  if (existente) return existente;
  return tx.user.create({ data: { name: limpo, role: "CLIENT" }, select: { id: true } });
}
