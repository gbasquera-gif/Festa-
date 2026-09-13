import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  gastoAcumulado,
  indicadoresDoMes,
  linhaDeRitmo,
  totalRecebido,
  type ContratoApurado,
  type CriarGastoInput,
  type EditarGastoInput,
  type GastoApurado,
  type NaturezaDoGasto,
} from "@festae/shared";

/**
 * Os números do negócio, apurados a partir do que a operação já registra.
 *
 * Nada aqui é digitado duas vezes. O faturamento vem das reservas, o recebido
 * vem dos pagamentos, e o que sobra — o que a Festaê gasta — é o único
 * cadastro que este módulo tem. Era essa duplicação que o painel antigo
 * exigia: a mesma festa existia como reserva no sistema e como linha numa
 * planilha, e as duas discordavam sem que ninguém percebesse.
 */

/** Reservas que ainda valem dinheiro. Cancelada não fatura. */
const VIGENTES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

function paraNumero(valor: unknown): number {
  // Prisma devolve Decimal; Number() nele é exato até 15 dígitos, muito acima
  // de qualquer valor que uma festa vá custar.
  return Number(valor);
}

@Injectable()
export class FinanceiroService {
  /**
   * Todos os contratos, do ponto de vista do dinheiro.
   *
   * O recebido sai da soma dos pagamentos PAID — nunca de um campo gravado ao
   * lado. É a correção do defeito mais sério do painel antigo, onde um
   * contrato quitado ficava com status "Pago" e o campo de sinal zerado, e
   * quem somasse o campo cobrava de novo de quem já tinha pagado.
   */
  private async contratos(): Promise<ContratoApurado[]> {
    const reservas = await prisma.reservation.findMany({
      where: { status: { in: [...VIGENTES] } },
      select: {
        eventDate: true,
        requestedAt: true,
        cancelledAt: true,
        order: {
          select: {
            total: true,
            payments: {
              where: { status: "PAID" },
              select: { amount: true, paidAt: true },
            },
          },
        },
      },
    });

    return reservas.map((reserva) => ({
      fechadoEm: reserva.requestedAt,
      festaEm: reserva.eventDate,
      valor: paraNumero(reserva.order.total),
      cancelado: reserva.cancelledAt !== null,
      recebimentos: reserva.order.payments.map((pagamento) => ({
        valor: paraNumero(pagamento.amount),
        recebidoEm: pagamento.paidAt,
      })),
    }));
  }

  private async gastos(): Promise<GastoApurado[]> {
    const linhas = await prisma.gasto.findMany({
      select: { valor: true, natureza: true, pagoEm: true },
    });
    return linhas.map((linha) => ({
      valor: paraNumero(linha.valor),
      natureza: linha.natureza as NaturezaDoGasto,
      pagoEm: linha.pagoEm,
    }));
  }

  /** Tudo que a tela de saúde financeira mostra de um mês. */
  async indicadores(mes: string) {
    const [contratos, gastos, meta] = await Promise.all([
      this.contratos(),
      this.gastos(),
      prisma.metaMensal.findUnique({ where: { competencia: mes } }),
    ]);

    const indicadores = indicadoresDoMes(contratos, gastos, mes);
    const alvo = meta ? paraNumero(meta.lucroAlvo) : null;

    return {
      ...indicadores,
      recebidoAcumulado: totalRecebido(contratos),
      gastoAcumulado: gastoAcumulado(gastos),
      meta: alvo,
      /**
       * A linha de ritmo mede o resultado por competência, não o caixa: a
       * meta é de lucro, e lucro é uma pergunta de competência. Medi-la pelo
       * caixa faria um mês de recebimento atrasado parecer fracasso.
       */
      ritmo: alvo === null ? null : linhaDeRitmo(
        indicadores.competencia.resultado,
        alvo,
        ...this.posicaoNoMes(mes),
      ),
    };
  }

  /**
   * Em que dia do mês estamos, e quantos dias ele tem.
   *
   * Para um mês passado devolve o mês inteiro: ficar dizendo "faltam X por
   * dia" de um mês que acabou não ajuda ninguém.
   */
  private posicaoNoMes(mes: string): [number, number] {
    const [ano, numeroDoMes] = mes.split("-").map(Number);
    const diasNoMes = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate();
    const hoje = new Date();
    const mesAtual = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
    if (mes < mesAtual) return [diasNoMes, diasNoMes];
    if (mes > mesAtual) return [0, diasNoMes];
    return [hoje.getUTCDate(), diasNoMes];
  }

  listarGastos(mes?: string) {
    const filtro = mes
      ? {
          OR: [
            { pagoEm: { gte: new Date(`${mes}-01T00:00:00Z`), lt: this.mesSeguinte(mes) } },
            { pagoEm: null, venceEm: { gte: new Date(`${mes}-01T00:00:00Z`), lt: this.mesSeguinte(mes) } },
          ],
        }
      : {};
    return prisma.gasto.findMany({ where: filtro, orderBy: [{ pagoEm: "desc" }, { criadoEm: "desc" }] });
  }

  private mesSeguinte(mes: string): Date {
    const [ano, numeroDoMes] = mes.split("-").map(Number);
    return new Date(Date.UTC(numeroDoMes === 12 ? ano + 1 : ano, numeroDoMes === 12 ? 0 : numeroDoMes, 1));
  }

  criarGasto(dados: CriarGastoInput) {
    return prisma.gasto.create({ data: dados });
  }

  async editarGasto(id: string, dados: EditarGastoInput) {
    const existe = await prisma.gasto.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException("Lançamento não encontrado.");
    return prisma.gasto.update({ where: { id }, data: dados });
  }

  async apagarGasto(id: string) {
    const existe = await prisma.gasto.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException("Lançamento não encontrado.");
    await prisma.gasto.delete({ where: { id } });
    return { apagado: true };
  }

  definirMeta(competencia: string, lucroAlvo: number) {
    return prisma.metaMensal.upsert({
      where: { competencia },
      create: { competencia, lucroAlvo },
      update: { lucroAlvo },
    });
  }
}
