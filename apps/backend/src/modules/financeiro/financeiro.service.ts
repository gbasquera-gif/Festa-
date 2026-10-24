import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import { lerCarteiraCrua } from "./carteira";
import { fimDoMesOuHoje, montarRelatorioExecutivo } from "./relatorio";
import { gerarRelatorioPdf, nomeDoArquivo } from "./relatorio-pdf";
import { filtroDeGastos, type FiltroDeGastos } from "./periodo";
import {
  detalhar,
  type EscopoDoDetalhe,
  type TipoDeDetalhe,
} from "./detalhamento";
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
  creditoAplicadoNaReserva,
  reembolsosARealizar,
  gastoAcumulado,
  indicadoresDoMes,
  mesAnterior,
  mesEmChapeco,
  resultadoOperacionalDoMes,
  serieDoAno,
  acervoDoMes,
  despesaDoMes,
  totalAReceber,
  variacao,
  linhaDeRitmo,
  totalRecebido,
  fluxoDeCaixaDoAno,
  fluxoDeCaixaDoMes,
  saldoDisponivel,
  controleDaDistribuicaoDoAno,
  controleDaDistribuicaoDoMes,
  pareceProLabore,
  proLaboreDoMes,
  diaEmChapeco,
  normalizarDataDaFesta,
  type InformarSaldoDeCaixaInput,
  retiradasDoAno,
  retiradasDoMes,
  type CategoriaDaRetirada,
  type RetiradaApurada,
  type ContratoApurado,
  type CriarGastoInput,
  type EditarGastoInput,
  type GastoApurado,
  type NaturezaDoGasto,
  type DespesaParaAnalise,
} from "@festae/shared";

/** Teto de lançamentos lidos por análise da Malu: muito acima do volume da Festaê, abaixo de um susto. */
export const LIMITE_DE_LINHAS_DA_ANALISE = 20_000;

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
      // Vigentes, mais as canceladas com tratamento registrado: o dinheiro
      // delas entrou e continua no caixa, o reembolso é saída e a retenção é
      // receita do mês do cancelamento. Cancelada sem tratamento (anterior a
      // ele) fica de fora, como sempre ficou.
      where: {
        OR: [
          { status: { in: [...VIGENTES] } },
          { tratamentoDoCancelamento: { isNot: null } },
          // Cancelada antiga que recebeu pagamento depois de cancelada: esse
          // dinheiro entrou e precisa aparecer no caixa.
          { pagamentosAposCancelamento: { some: {} } },
        ],
      },
      select: {
        status: true,
        eventDate: true,
        requestedAt: true,
        cancelledAt: true,
        order: {
          select: {
            total: true,
            payments: {
              where: { status: "PAID" },
              select: { amount: true, paidAt: true, aposCancelamento: { select: { id: true } } },
            },
          },
        },
        creditosUtilizados: { select: { valor: true } },
        tratamentoDoCancelamento: {
          select: { reembolsado: true, retido: true, definidoEm: true },
        },
        tratamentosComplementares: {
          select: { reembolsado: true, retido: true, definidoEm: true },
        },
        // A saída de caixa do reembolso: só o que já foi devolvido.
        reembolsosRealizados: { select: { valor: true, realizadoEm: true } },
      },
    });

    return reservas.map((reserva) => ({
      fechadoEm: reserva.requestedAt,
      festaEm: reserva.eventDate,
      valor: paraNumero(reserva.order.total),
      cancelado:
        reserva.cancelledAt !== null || !(VIGENTES as readonly string[]).includes(reserva.status),
      recebimentos: reserva.order.payments.map((pagamento) => ({
        valor: paraNumero(pagamento.amount),
        recebidoEm: pagamento.paidAt,
        aposCancelamento: pagamento.aposCancelamento !== null,
      })),
      tratamentosComplementares: reserva.tratamentosComplementares.map((t) => ({
        reembolsado: paraNumero(t.reembolsado),
        retido: paraNumero(t.retido),
        definidoEm: t.definidoEm,
      })),
      reembolsos: reserva.reembolsosRealizados.map((r) => ({
        valor: paraNumero(r.valor),
        realizadoEm: r.realizadoEm,
      })),
      creditoAplicado: creditoAplicadoNaReserva(
        reserva.creditosUtilizados.map((m) => ({ valor: paraNumero(m.valor) })),
      ),
      tratamento: reserva.tratamentoDoCancelamento
        ? {
            reembolsado: paraNumero(reserva.tratamentoDoCancelamento.reembolsado),
            retido: paraNumero(reserva.tratamentoDoCancelamento.retido),
            definidoEm: reserva.tratamentoDoCancelamento.definidoEm,
          }
        : null,
    }));
  }

  /**
   * Quanto a Festaê deve em crédito às clientes, somando todos os saldos.
   *
   * Não é caixa nem receita: é dinheiro que já entrou (e já está no caixa
   * do mês em que entrou) e que vai virar festa. Aparece ao lado do caixa
   * para ninguém tomá-lo por sobra.
   */
  /**
   * As despesas de um mês separadas por natureza.
   *
   * Consumo e custeio passam pela MESMA `despesaDoMes` do resultado, cada um
   * com a sua fatia de gastos: somados, dão a despesa do Resultado
   * Operacional. Acervo é investimento e fica à parte, como na tela.
   */
  async despesasPorNatureza(mes: string) {
    const gastos = await this.gastos();
    const da = (natureza: NaturezaDoGasto) => gastos.filter((g) => g.natureza === natureza);
    return {
      mes,
      consumo: despesaDoMes(da("CONSUMO"), mes),
      custeio: despesaDoMes(da("CUSTEIO"), mes),
      total: despesaDoMes(gastos, mes),
      acervo: acervoDoMes(gastos, mes),
      /** Despesa com os sócios, fora do `total` do Resultado Operacional. */
      proLabore: proLaboreDoMes(gastos, mes),
    };
  }

  private async creditoEmAberto(): Promise<number> {
    const soma = await prisma.creditoClienteMovimento.aggregate({ _sum: { valor: true } });
    return paraNumero(soma._sum.valor ?? 0);
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

  /**
   * As retiradas dos sócios, como a apuração as lê. Estornadas vêm marcadas
   * e as funções de @festae/shared as deixam fora dos totais.
   */
  private async retiradas(): Promise<RetiradaApurada[]> {
    const linhas = await prisma.retiradaDeSocio.findMany({
      select: { socioId: true, categoria: true, valor: true, retiradaEm: true, estornadaEm: true },
    });
    return linhas.map((r) => ({
      socioId: r.socioId,
      categoria: r.categoria as CategoriaDaRetirada,
      valor: paraNumero(r.valor),
      retiradaEm: r.retiradaEm,
      estornada: r.estornadaEm !== null,
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
    const [contratos, gastos, meta, creditoEmAberto, retiradas] = await Promise.all([
      this.contratos(),
      this.gastos(),
      prisma.metaMensal.findUnique({ where: { competencia: mes } }),
      this.creditoEmAberto(),
      this.retiradas(),
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
      // A retenção de cancelamento vem em linha própria: é receita
      // operacional, mas não é faturamento de festa.
      operacional: {
        faturamento: operacional.receita,
        retencao: operacional.receitaDeRetencao,
        despesas: operacional.despesa,
        resultado: operacional.resultado,
        margem: operacional.margem,
      },

      /**
       * O caixa do mês: o que entrou (PAID, inclusive de reserva cancelada
       * depois) menos o que foi devolvido. Crédito Festaê não aparece aqui
       * nem quando é gerado nem quando é usado — não é dinheiro novo.
       */
      caixa: {
        entradas: indicadores.entradasNoCaixa,
        reembolsos: indicadores.reembolsosNoMes,
        liquido: indicadores.caixa.receita,
        /** Destinados a clientes e ainda não devolvidos: não saíram do caixa. */
        reembolsosARealizar: reembolsosARealizar(contratos),
      },
      creditoEmAberto,

      ytd: acumuladoNoAno(contratos, gastos, ano, mes),

      /**
       * Retiradas dos sócios e o fluxo de caixa que as mostra. Campos novos,
       * ao lado dos existentes: nenhum número acima depende deles. Retirada
       * não é despesa e não entra no Resultado Operacional; aparece aqui como
       * saída de caixa, classificada.
       */
      retiradas: {
        mes: retiradasDoMes(retiradas, mes),
        ano: retiradasDoAno(retiradas, ano, mes),
      },
      fluxoDeCaixa: {
        mes: fluxoDeCaixaDoMes(contratos, gastos, retiradas, mes),
        ano: fluxoDeCaixaDoAno(contratos, gastos, retiradas, ano, mes),
      },
      /**
       * Controle da distribuição de lucros: Resultado Operacional (a mesma
       * conta de cima), menos o pró-labore, diante do que foi distribuído.
       */
      distribuicao: {
        mes: controleDaDistribuicaoDoMes(contratos, gastos, retiradas, mes),
        ano: controleDaDistribuicaoDoAno(contratos, gastos, retiradas, ano, mes),
      },

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
        temBase: doAnterior.receita > 0 || doAnterior.receitaDeRetencao > 0 || doAnterior.despesa > 0,
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

  /**
   * Os números do Relatório Executivo: as mesmas leituras do `panorama`
   * (contratos e gastos) mais a carteira da Visão Geral Comercial, para a
   * carteira futura. Nada é recalculado por outra regra.
   */
  async relatorioExecutivo(ano: number, mes: string) {
    const agora = new Date();
    const [contratos, gastos, reservas, creditoEmAberto, retiradas, ref] = await Promise.all([
      this.contratos(),
      this.gastos(),
      this.carteiraCrua(),
      this.creditoEmAberto(),
      this.retiradas(),
      this.saldoDeReferencia(fimDoMesOuHoje(mes, agora)),
    ]);
    return montarRelatorioExecutivo({
      contratos,
      gastos,
      retiradas,
      carteira: reservas.map((reserva) => montarLinha(reserva, agora)),
      ano,
      mes,
      agora,
      creditoEmAberto,
      saldoDeReferencia: ref ? { dia: ref.referenciaEm.toISOString().slice(0, 10), valor: paraNumero(ref.valor) } : null,
    });
  }

  /* ---------------------------------------------------------------- *
   * Saldo disponível
   * ---------------------------------------------------------------- */

  /**
   * O saldo informado que vale para um dia: o de data mais recente até ele;
   * no mesmo dia, o último registrado (é assim que se corrige um saldo).
   */
  private async saldoDeReferencia(dia: string) {
    return prisma.saldoDeCaixa.findFirst({
      where: { referenciaEm: { lte: normalizarDataDaFesta(dia) } },
      orderBy: [{ referenciaEm: "desc" }, { registradoEm: "desc" }],
      include: { registradoPor: { select: { name: true } } },
    });
  }

  /**
   * O saldo disponível num dia (hoje, se nada vier ou se vier data futura).
   *
   * Saldo inicial informado + entradas − reembolsos − despesas − acervo −
   * retiradas, do dia dele até a data pedida. Sem saldo informado até o dia, devolve `saldo: null` e diz
   * desde quando há saldo — a tela pede para informar, em vez de inventar.
   */
  async saldoDeCaixa(ate?: string, agora = new Date()) {
    const hoje = diaEmChapeco(agora);
    const dia = ate && ate < hoje ? ate : hoje;
    const ref = await this.saldoDeReferencia(dia);
    if (!ref) {
      const primeiro = await prisma.saldoDeCaixa.findFirst({ orderBy: { referenciaEm: "asc" }, select: { referenciaEm: true } });
      return {
        ate: dia,
        referencia: null,
        saldo: null,
        fluxo: null,
        primeiroSaldoInformadoEm: primeiro ? primeiro.referenciaEm.toISOString().slice(0, 10) : null,
      };
    }
    const [contratos, gastos, retiradas] = await Promise.all([this.contratos(), this.gastos(), this.retiradas()]);
    const referencia = { dia: ref.referenciaEm.toISOString().slice(0, 10), valor: paraNumero(ref.valor) };
    const calculado = saldoDisponivel(contratos, gastos, retiradas, referencia, dia)!;
    const { referencia: _r, ate: _a, saldo, ...fluxo } = calculado;
    return {
      ate: dia,
      referencia: {
        id: ref.id,
        ...referencia,
        observacao: ref.observacao,
        registradoPor: ref.registradoPor?.name ?? null,
        registradoEm: ref.registradoEm.toISOString(),
      },
      saldo,
      fluxo,
      primeiroSaldoInformadoEm: null,
    };
  }

  /** Registra o saldo inicial da conta num dia. A mesma `chave` não grava duas vezes. */
  async informarSaldoDeCaixa(dados: InformarSaldoDeCaixaInput, usuarioId: string, agora = new Date()) {
    if (dados.dia > diaEmChapeco(agora)) {
      throw new BadRequestException("O saldo informado não pode ser de uma data futura. Use o saldo do extrato de hoje ou de antes.");
    }
    const ja = await prisma.saldoDeCaixa.findUnique({ where: { chaveDeIdempotencia: dados.chave } });
    if (ja) return { id: ja.id, repetido: true };
    try {
      const criado = await prisma.saldoDeCaixa.create({
        data: {
          referenciaEm: normalizarDataDaFesta(dados.dia),
          valor: dados.valor,
          observacao: dados.observacao?.trim() || null,
          registradoPorId: usuarioId,
          chaveDeIdempotencia: dados.chave,
        },
      });
      return { id: criado.id, repetido: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const doPrimeiro = await prisma.saldoDeCaixa.findUnique({ where: { chaveDeIdempotencia: dados.chave } });
        if (doPrimeiro) return { id: doPrimeiro.id, repetido: true };
      }
      throw e;
    }
  }

  /** Os saldos informados, do mais recente para o mais antigo. Nada se apaga. */
  async saldosDeCaixaInformados() {
    const linhas = await prisma.saldoDeCaixa.findMany({
      orderBy: [{ referenciaEm: "desc" }, { registradoEm: "desc" }],
      take: 50,
      include: { registradoPor: { select: { name: true } } },
    });
    return linhas.map((l) => ({
      id: l.id,
      dia: l.referenciaEm.toISOString().slice(0, 10),
      valor: paraNumero(l.valor),
      observacao: l.observacao,
      registradoPor: l.registradoPor?.name ?? null,
      registradoEm: l.registradoEm.toISOString(),
    }));
  }

  /** O relatório em PDF, gerado agora e devolvido — nada é guardado. */
  async relatorioExecutivoPdf(ano: number, mes: string) {
    const dados = await this.relatorioExecutivo(ano, mes);
    const { pdf } = await gerarRelatorioPdf(dados);
    return { pdf, nome: nomeDoArquivo(mes) };
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
  /**
   * A carteira crua, do jeito que `montarLinha` espera.
   *
   * Extraída de `listarContratos` para o detalhamento dos indicadores ler o
   * MESMO conjunto. Duas consultas parecidas é como um KPI passa a divergir
   * do seu próprio detalhamento.
   */
  private async carteiraCrua() {
    return lerCarteiraCrua();
  }

  async listarContratos(filtro: FiltroDeContratos = {}) {
    const reservas = await this.carteiraCrua();

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
  /**
   * De que contratos um indicador é feito.
   *
   * Lê a mesma carteira da aba Vendas/Contratos e recalcula o total pela
   * mesma função de @festae/shared que o panorama usa — é isso que garante
   * que o detalhamento fecha com o número que o usuário clicou.
   */
  async detalharIndicador(tipo: TipoDeDetalhe, escopo: EscopoDoDetalhe, mes: string) {
    const reservas = await this.carteiraCrua();
    const agora = new Date();
    const linhas = reservas.map((reserva) => montarLinha(reserva, agora));
    return { apuradoEm: agora.toISOString(), ...detalhar(linhas, tipo, escopo, mes) };
  }

  /**
   * Os lançamentos de despesa para as análises da Malu: só leitura e só os
   * campos que a análise usa — observação e forma de pagamento não saem.
   *
   * Pagos com data de pagamento no intervalo (o mesmo dia que o Resultado
   * Operacional lê) e todos os ainda a pagar, que a análise filtra pelo
   * vencimento. Acima do teto de linhas, recusa em vez de ler tudo.
   */
  async despesasParaAnalise(de: string, ate: string): Promise<DespesaParaAnalise[]> {
    const fim = new Date(`${ate}T00:00:00.000Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    const linhas = await prisma.gasto.findMany({
      where: { OR: [{ pagoEm: { gte: new Date(`${de}T00:00:00.000Z`), lt: fim } }, { pagoEm: null }] },
      select: { id: true, descricao: true, natureza: true, valor: true, pagoEm: true, venceEm: true, categoria: true, fornecedor: true },
      take: LIMITE_DE_LINHAS_DA_ANALISE + 1,
    });
    if (linhas.length > LIMITE_DE_LINHAS_DA_ANALISE) {
      throw new BadRequestException(`Período com mais de ${LIMITE_DE_LINHAS_DA_ANALISE} lançamentos: escolha um período menor.`);
    }
    return linhas.map((l) => ({ ...l, natureza: l.natureza as NaturezaDoGasto, valor: paraNumero(l.valor) }));
  }

  /** Os nomes de fornecedor e de categoria como estão gravados, com quantos lançamentos cada um tem. */
  async nomesNasDespesas(): Promise<{ fornecedores: { nome: string; lancamentos: number }[]; categorias: { nome: string; lancamentos: number }[] }> {
    const [fornecedores, categorias] = await Promise.all([
      prisma.gasto.groupBy({ by: ["fornecedor"], where: { fornecedor: { not: null } }, _count: { _all: true } }),
      prisma.gasto.groupBy({ by: ["categoria"], where: { categoria: { not: null } }, _count: { _all: true } }),
    ]);
    return {
      fornecedores: fornecedores.map((f) => ({ nome: f.fornecedor!, lancamentos: f._count._all })),
      categorias: categorias.map((c) => ({ nome: c.categoria!, lancamentos: c._count._all })),
    };
  }

  listarGastos(filtro: FiltroDeGastos = {}) {
    return prisma.gasto.findMany({
      where: filtroDeGastos(filtro),
      orderBy: [{ pagoEm: "desc" }, { venceEm: "desc" }, { criadoEm: "desc" }],
    });
  }

  /**
   * Pró-labore tem natureza própria e só ela. Consumo, custeio ou acervo que
   * diz "pró-labore" é lançamento no lugar errado: como custeio, entraria no
   * Resultado Operacional, que por definição não inclui pró-labore.
   */
  private conferirNaturezaDoProLabore(natureza: NaturezaDoGasto, descricao: string, categoria?: string | null) {
    if (natureza !== "PRO_LABORE" && pareceProLabore(descricao, categoria)) {
      throw new BadRequestException(
        "Pró-labore tem natureza própria: escolha a natureza “Pró-labore”. Como consumo ou custeio ele entraria no Resultado Operacional, que não inclui pró-labore.",
      );
    }
  }

  criarGasto(dados: CriarGastoInput) {
    this.conferirNaturezaDoProLabore(dados.natureza, dados.descricao, dados.categoria);
    return prisma.gasto.create({ data: dados });
  }

  async editarGasto(id: string, dados: EditarGastoInput) {
    const existe = await prisma.gasto.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException("Lançamento não encontrado.");
    // Só quando a edição mexe na classificação: corrigir o valor de um
    // lançamento antigo não obriga a reclassificá-lo agora.
    if (dados.natureza !== undefined || dados.descricao !== undefined || dados.categoria !== undefined) {
      this.conferirNaturezaDoProLabore(
        (dados.natureza ?? existe.natureza) as NaturezaDoGasto,
        dados.descricao ?? existe.descricao,
        dados.categoria !== undefined ? dados.categoria : existe.categoria,
      );
    }
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
