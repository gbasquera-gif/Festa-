import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@festae/database";
import {
  SITUACOES_DA_CONTA,
  fromCentsInt,
  situacaoDaConta,
  toCentsInt,
  type FiltroDeContas,
  type NaturezaDoGasto,
  type RegistrarPagamentoDeContaInput,
  type ResolverConferenciaInput,
  type SituacaoDaConta,
} from "@festae/shared";
import { intervaloDoMes } from "../financeiro/periodo";
import { diaDoInstante, instanteDoDia } from "./datas";
import { criarContaDoMes } from "./geracao";

const somar = (valores: number[]) => fromCentsInt(valores.reduce((t, v) => t + toCentsInt(v), 0));

/**
 * A aba Contas a pagar: os gastos com vencimento, vistos pela pergunta "o
 * que falta pagar e quando".
 *
 * Só leitura sobre a tabela de gastos, mais uma ação: registrar o
 * pagamento, que é preencher o `pagoEm` do próprio gasto. Os indicadores
 * daqui não entram em DRE, caixa ou saldo — esses continuam lendo só o que
 * tem `pagoEm`, como sempre.
 */
@Injectable()
export class ContasService {
  async listar(filtro: FiltroDeContas, hoje: string) {
    const mes = filtro.mes ?? hoje.slice(0, 7);
    const { de, ate } = intervaloDoMes(mes);
    const hojeInstante = instanteDoDia(hoje);
    const inicioDosVencidos = de < hojeInstante ? de : hojeInstante;

    const recorte: Prisma.GastoWhereInput = {
      ...(filtro.natureza ? { natureza: filtro.natureza } : {}),
      ...(filtro.fornecedor ? { fornecedor: { equals: filtro.fornecedor, mode: "insensitive" } } : {}),
    };

    const [doPeriodo, emAbertoTodas, fornecedores, conferenciasPendentes] = await Promise.all([
      // O mês escolhido, mais o que já venceu antes dele (ou antes de hoje)
      // e continua em aberto, mais o que está em aberto sem vencimento.
      prisma.gasto.findMany({
        where: {
          ...recorte,
          OR: [
            { venceEm: { gte: de, lt: ate } },
            { pagoEm: null, venceEm: { lt: inicioDosVencidos } },
            { pagoEm: null, venceEm: null },
          ],
        },
        include: { recorrencia: { select: { id: true, descricao: true, tipoDeValor: true } } },
        orderBy: [{ venceEm: "asc" }, { criadoEm: "asc" }],
      }),
      prisma.gasto.findMany({ where: { ...recorte, pagoEm: null }, select: { valor: true, venceEm: true } }),
      prisma.gasto.findMany({
        where: { fornecedor: { not: null }, OR: [{ venceEm: { not: null } }, { pagoEm: null }] },
        distinct: ["fornecedor"],
        select: { fornecedor: true },
        orderBy: { fornecedor: "asc" },
      }),
      prisma.conferenciaDeRecorrencia.count({ where: { situacao: "PENDENTE" } }),
    ]);

    const contas = doPeriodo.map((g) => {
      const venceEm = g.venceEm ? diaDoInstante(g.venceEm) : null;
      const pagoEm = g.pagoEm ? diaDoInstante(g.pagoEm) : null;
      return {
        id: g.id,
        descricao: g.descricao,
        natureza: g.natureza as NaturezaDoGasto,
        categoria: g.categoria,
        fornecedor: g.fornecedor,
        valor: Number(g.valor),
        venceEm,
        pagoEm,
        formaDePagamento: g.formaDePagamento,
        observacao: g.observacao,
        competencia: g.competencia,
        recorrencia: g.recorrencia ? { ...g.recorrencia } : null,
        situacao: situacaoDaConta({ pagoEm, venceEm }, hoje),
      };
    });

    const contagem = Object.fromEntries(SITUACOES_DA_CONTA.map((s) => [s, 0])) as Record<SituacaoDaConta, number>;
    for (const c of contas) contagem[c.situacao]++;

    const noMes = contas.filter((c) => c.venceEm !== null && c.venceEm.slice(0, 7) === mes);
    const indicadores = {
      /** Tudo o que está em aberto, de qualquer mês. */
      totalEmAberto: somar(emAbertoTodas.map((g) => Number(g.valor))),
      /** Em aberto e com vencimento antes de hoje. */
      vencido: somar(
        emAbertoTodas.filter((g) => g.venceEm !== null && diaDoInstante(g.venceEm) < hoje).map((g) => Number(g.valor)),
      ),
      /** O que vence no mês escolhido, pago ou não. */
      previstoNoMes: somar(noMes.map((c) => c.valor)),
      pagoDoPrevisto: somar(noMes.filter((c) => c.pagoEm !== null).map((c) => c.valor)),
      emAbertoDoPrevisto: somar(noMes.filter((c) => c.pagoEm === null).map((c) => c.valor)),
    };

    return {
      hoje,
      mes,
      indicadores,
      contagem,
      contas: filtro.situacao ? contas.filter((c) => c.situacao === filtro.situacao) : contas,
      fornecedores: fornecedores.map((f) => f.fornecedor!).filter(Boolean),
      conferenciasPendentes,
    };
  }

  /**
   * Registra que a conta foi paga: o dia em que o dinheiro saiu, o valor que
   * saiu de fato e a forma. É o mesmo `pagoEm` que o formulário de Despesas
   * preenche — a partir dele a saída entra no caixa e na DRE do mês do
   * pagamento.
   *
   * Só vale para conta em aberto: a condição está no próprio UPDATE, então
   * dois cliques (ou duas abas) não registram o pagamento duas vezes.
   */
  async registrarPagamento(id: string, dados: RegistrarPagamentoDeContaInput, hoje: string) {
    if (dados.pagoEm > hoje) {
      throw new BadRequestException("O pagamento só pode ser registrado com data de hoje ou anterior.");
    }
    const { count } = await prisma.gasto.updateMany({
      where: { id, pagoEm: null },
      data: {
        pagoEm: instanteDoDia(dados.pagoEm),
        valor: dados.valor,
        ...(dados.formaDePagamento ? { formaDePagamento: dados.formaDePagamento } : {}),
        ...(dados.observacao ? { observacao: dados.observacao } : {}),
      },
    });
    if (count === 0) {
      const existe = await prisma.gasto.findUnique({ where: { id }, select: { pagoEm: true } });
      if (!existe) throw new NotFoundException("Conta não encontrada.");
      throw new ConflictException("Esta conta já está paga. Para corrigir, edite o lançamento em Despesas.");
    }
    return prisma.gasto.findUnique({ where: { id } });
  }

  /** As conferências esperando decisão, com os lançamentos que pareceram a mesma conta. */
  async conferenciasPendentes() {
    const pendentes = await prisma.conferenciaDeRecorrencia.findMany({
      where: { situacao: "PENDENTE" },
      include: { recorrencia: true },
      orderBy: [{ vencimento: "asc" }],
    });
    const ids = Array.from(new Set(pendentes.flatMap((p) => p.candidatos)));
    const gastos = await prisma.gasto.findMany({ where: { id: { in: ids } } });
    const porId = new Map(gastos.map((g) => [g.id, g]));
    return pendentes.map((p) => ({
      id: p.id,
      competencia: p.competencia,
      vencimento: p.vencimento,
      recorrencia: {
        id: p.recorrencia.id,
        descricao: p.recorrencia.descricao,
        natureza: p.recorrencia.natureza,
        fornecedor: p.recorrencia.fornecedor,
        tipoDeValor: p.recorrencia.tipoDeValor,
        valorPrevisto: Number(p.recorrencia.valorPrevisto),
      },
      candidatos: p.candidatos
        .map((id) => porId.get(id))
        .filter((g): g is NonNullable<typeof g> => g !== undefined && g.recorrenciaId === null)
        .map((g) => ({
          id: g.id,
          descricao: g.descricao,
          fornecedor: g.fornecedor,
          valor: Number(g.valor),
          venceEm: g.venceEm ? diaDoInstante(g.venceEm) : null,
          pagoEm: g.pagoEm ? diaDoInstante(g.pagoEm) : null,
        })),
    }));
  }

  /**
   * A resposta à conferência.
   *
   * VINCULAR: o lançamento manual passa a ser o mês da recorrência (ganha
   * `recorrenciaId` e `competencia`; valor, datas e pagamento ficam como
   * estão). GERAR: são contas diferentes, gera a do mês. DISPENSAR: o mês
   * fica sem conta da recorrência.
   */
  async resolverConferencia(id: string, dados: ResolverConferenciaInput, usuarioId: string) {
    const conferencia = await prisma.conferenciaDeRecorrencia.findUnique({ where: { id }, include: { recorrencia: true } });
    if (!conferencia) throw new NotFoundException("Conferência não encontrada.");
    if (conferencia.situacao !== "PENDENTE") throw new ConflictException("Esta conferência já foi resolvida.");
    const resolvida = { resolvidaEm: new Date(), resolvidaPorId: usuarioId };

    return prisma.$transaction(async (tx) => {
      // Trava a conferência: duas respostas ao mesmo tempo, só uma vale.
      const travada = await tx.conferenciaDeRecorrencia.updateMany({
        where: { id, situacao: "PENDENTE" },
        data: { situacao: dados.acao === "VINCULAR" ? "VINCULADA" : dados.acao === "GERAR" ? "GERADA" : "DISPENSADA", ...resolvida },
      });
      if (travada.count === 0) throw new ConflictException("Esta conferência já foi resolvida.");

      if (dados.acao === "VINCULAR") {
        const gasto = await tx.gasto.findUnique({ where: { id: dados.gastoId } });
        if (!gasto || gasto.natureza !== conferencia.recorrencia.natureza) {
          throw new BadRequestException("Escolha um dos lançamentos sugeridos.");
        }
        const ocupado = await tx.gasto.findUnique({
          where: { recorrenciaId_competencia: { recorrenciaId: conferencia.recorrenciaId, competencia: conferencia.competencia } },
          select: { id: true },
        });
        if (ocupado) throw new ConflictException("Este mês da recorrência já tem um lançamento.");
        const { count } = await tx.gasto.updateMany({
          where: { id: dados.gastoId, recorrenciaId: null },
          data: { recorrenciaId: conferencia.recorrenciaId, competencia: conferencia.competencia },
        });
        if (count === 0) throw new ConflictException("Este lançamento já pertence a uma recorrência.");
        await tx.conferenciaDeRecorrencia.update({ where: { id }, data: { gastoId: dados.gastoId } });
        return { situacao: "VINCULADA", gastoId: dados.gastoId };
      }

      if (dados.acao === "GERAR") {
        const criado = await criarContaDoMes(
          conferencia.recorrencia,
          { competencia: conferencia.competencia, vencimento: conferencia.vencimento },
          tx,
        );
        if (!criado) throw new ConflictException("Este mês da recorrência já tem um lançamento.");
        await tx.conferenciaDeRecorrencia.update({ where: { id }, data: { gastoId: criado.id } });
        return { situacao: "GERADA", gastoId: criado.id };
      }

      return { situacao: "DISPENSADA", gastoId: null };
    });
  }
}
