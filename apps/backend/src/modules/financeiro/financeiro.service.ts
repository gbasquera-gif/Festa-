import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import { filtroDeGastos, type FiltroDeGastos } from "./periodo";
import {
  filtrarLinhas,
  montarLinha,
  ordenarLinhas,
  resumir,
  STATUS_VIGENTES,
  type FiltroDeContratos,
} from "./contratos";
import {
  acumuladoNoAno,
  gastoAcumulado,
  indicadoresDoMes,
  mesAnterior,
  mesEmChapeco,
  resultadoOperacionalDoMes,
  serieDoAno,
  totalAReceber,
  variacao,
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

/**
 * Reservas que ainda valem dinheiro. Cancelada não fatura.
 *
 * A lista mora em `contratos.ts` e é importada aqui em vez de repetida: a
 * Visão Geral e a carteira de Vendas/Contratos precisam somar exatamente o
 * mesmo conjunto, senão a conciliação entre as duas telas deixa de valer.
 */
const VIGENTES = STATUS_VIGENTES;

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
   * Tudo que a Visão Geral e a Evolução mostram, numa consulta só.
   *
   * Agrega no servidor de propósito: as fórmulas já existem em
   * @festae/shared e são as mesmas que a carteira de contratos usa. Mandar
   * as linhas cruas para o navegador recalcular seria a terceira cópia da
   * regra de competência, e a terceira cópia é a que envelhece errado.
   *
   * Uma leitura de contratos e uma de gastos servem ao mês, ao acumulado do
   * ano e aos doze pontos do gráfico.
   */
  async panorama(ano: number, mes: string) {
    const [contratos, gastos, meta] = await Promise.all([
      this.contratos(),
      this.gastos(),
      prisma.metaMensal.findUnique({ where: { competencia: mes } }),
    ]);

    const operacional = resultadoOperacionalDoMes(contratos, gastos, mes);
    const indicadores = indicadoresDoMes(contratos, gastos, mes);
    const anterior = mesAnterior(mes);
    const doAnterior = resultadoOperacionalDoMes(contratos, gastos, anterior);
    const alvo = meta ? paraNumero(meta.lucroAlvo) : null;

    return {
      mes,
      ano,

      // Faturou -> gastou -> sobrou -> margem. A leitura principal.
      operacional: {
        faturamento: operacional.receita,
        despesas: operacional.despesa,
        resultado: operacional.resultado,
        margem: operacional.margem,
      },

      ytd: acumuladoNoAno(contratos, gastos, ano, mes),

      aReceber: totalAReceber(contratos),
      recebidoSemData: indicadores.recebidoSemData,
      acervoAcumulado: indicadores.acervoAcumulado,
      ticketMedio: indicadores.ticketMedio,
      festasNoMes: indicadores.festasNoMes,

      /**
       * Meta do mês. Nula quando não existe — a tela diz que não há meta em
       * vez de inventar uma, que é o que faria a barra de progresso mentir.
       */
      meta:
        alvo === null
          ? null
          : {
              valor: alvo,
              realizado: operacional.resultado,
              percentual: alvo > 0 ? operacional.resultado / alvo : null,
              gap: Math.max(0, Number((alvo - operacional.resultado).toFixed(2))),
              ...this.ritmoDoMes(operacional.resultado, alvo, mes),
            },

      comparacao: {
        mesAnterior: anterior,
        temBase: doAnterior.receita > 0 || doAnterior.despesa > 0,
        faturamento: variacao(operacional.receita, doAnterior.receita),
        resultado: variacao(operacional.resultado, doAnterior.resultado),
      },

      /**
       * Os doze pontos, com `futuro` marcando o que ainda não aconteceu.
       *
       * Festa contratada para outubro pertence a outubro por competência, e
       * o número é real — mas é contratado, não realizado. A tela distingue
       * os dois em vez de somá-los na mesma linha cheia: apresentar receita
       * de festa que ainda não foi montada como já realizada é a mesma
       * confusão de regimes que o painel antigo fazia.
       */
      serie: serieDoAno(contratos, gastos, ano).map((m) => ({
        ...m,
        futuro: m.mes > mesEmChapeco(new Date()),
      })),
    };
  }

  /** A linha de ritmo do mês, reaproveitando a mesma função da Sprint 1. */
  private ritmoDoMes(realizado: number, alvo: number, mes: string) {
    const [dia, dias] = this.posicaoNoMes(mes);
    const ritmo = linhaDeRitmo(realizado, alvo, dia, dias);
    return {
      atrasoNoRitmo: ritmo.atrasoNoRitmo,
      porDia: ritmo.porDia,
      percentualDoMes: ritmo.percentualDoMes,
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

  /**
   * A carteira de contratos, do ponto de vista comercial.
   *
   * Lê as mesmas reservas que a operação usa — não existe entidade paralela
   * de venda, e não vai existir: `Reservation + Order` já é o contrato, e uma
   * segunda tabela precisaria ser mantida em sincronia a cada remarcação ou
   * troca de item. A primeira vez que alguém esquecesse, o faturamento e a
   * agenda passariam a contar festas diferentes — que foi exatamente o
   * defeito do painel antigo.
   *
   * Traz canceladas e rejeitadas junto, marcadas: quem administra
   * comercialmente precisa ver o que caiu. Elas não entram em total nenhum —
   * é `vigente` que decide isso, e o resumo só soma vigentes.
   */
  async listarContratos(filtro: FiltroDeContratos = {}) {
    const reservas = await prisma.reservation.findMany({
      select: {
        id: true,
        contractSeq: true,
        status: true,
        eventDate: true,
        requestedAt: true,
        confirmedAt: true,
        cancelledAt: true,
        rescheduledFrom: true,
        origemDoRegistro: true,
        referenciaExterna: true,
        order: {
          select: {
            total: true,
            fulfillment: true,
            assembly: true,
            kit: { select: { name: true } },
            event: {
              select: {
                city: true,
                saleChannel: true,
                guestCount: true,
                type: true,
                theme: { select: { name: true } },
                user: { select: { name: true, email: true, phone: true } },
              },
            },
            payments: {
              select: {
                id: true,
                type: true,
                status: true,
                method: true,
                amount: true,
                paidAt: true,
              },
            },
          },
        },
      },
      orderBy: { eventDate: "desc" },
    });

    // Um instante só para a carteira inteira. Chamar `new Date()` por linha
    // faria duas reservas da mesma lista serem julgadas em momentos
    // diferentes — irrelevante quase sempre, e visível exatamente na virada
    // da meia-noite, que é quando a regra de vencimento muda.
    const agora = new Date();
    const linhas = ordenarLinhas(
      filtrarLinhas(
        reservas.map((reserva) => montarLinha(reserva, agora)),
        filtro,
      ),
    );

    return {
      apuradoEm: agora.toISOString(),
      resumo: resumir(linhas, agora),
      contratos: linhas.map((linha) => linha.comercial),
    };
  }

  /**
   * Lista gastos, opcionalmente filtrando por mês e por natureza.
   *
   * A regra do período mora em `periodo.ts`, como função pura: a borda do mês
   * é onde erro de fuso se esconde, e ela precisa de teste que rode sem banco.
   */
  listarGastos(filtro: FiltroDeGastos = {}) {
    return prisma.gasto.findMany({
      where: filtroDeGastos(filtro),
      orderBy: [{ pagoEm: "desc" }, { venceEm: "desc" }, { criadoEm: "desc" }],
    });
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
