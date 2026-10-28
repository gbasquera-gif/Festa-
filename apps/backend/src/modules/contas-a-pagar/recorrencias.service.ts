import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma, type DespesaRecorrente } from "@festae/database";
import {
  atualizacaoDaConta,
  diaPrevisto,
  ocorrenciasRetroativas,
  proximosVencimentos,
  vencimentoDaCompetencia,
  type CriarRecorrenciaInput,
  type EditarRecorrenciaInput,
  type NaturezaDoGasto,
  type Ocorrencia,
} from "@festae/shared";
import { FinanceiroService } from "../financeiro/financeiro.service";
import { diaDoInstante, instanteDoDia } from "./datas";
import { gerarContasAutomaticas, gerarOcorrencia, modeloDe, regraDe, type ResultadoDaOcorrencia } from "./geracao";

/** Campos que a edição pode mudar, para o histórico do antes e depois. */
const CAMPOS_EDITAVEIS = [
  "descricao",
  "natureza",
  "categoria",
  "fornecedor",
  "tipoDeValor",
  "valorPrevisto",
  "diaDoVencimento",
  "dataFinal",
  "ajusteDiaInexistente",
  "ajusteDiaNaoUtil",
] as const;

function retrato(r: DespesaRecorrente): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  for (const c of CAMPOS_EDITAVEIS) campos[c] = c === "valorPrevisto" ? Number(r.valorPrevisto) : r[c];
  return campos;
}

/**
 * Despesas recorrentes: a regra que gera, a cada mês, uma conta a pagar.
 *
 * O que nunca acontece aqui: mexer em conta paga, em conta que já venceu, ou
 * registrar pagamento. Editar, pausar e encerrar alcançam só as contas em
 * aberto que ainda vão vencer — o passado fica como foi.
 */
@Injectable()
export class RecorrenciasService {
  constructor(private readonly financeiro: FinanceiroService) {}

  private async buscar(id: string): Promise<DespesaRecorrente> {
    const r = await prisma.despesaRecorrente.findUnique({ where: { id } });
    if (!r) throw new NotFoundException("Despesa recorrente não encontrada.");
    return r;
  }

  /**
   * Os meses anteriores ao cadastro que ainda podem ser gerados: nem
   * gerados, nem decididos numa conferência.
   */
  private async retroativasDisponiveis(r: DespesaRecorrente, hoje: string): Promise<Ocorrencia[]> {
    const todas = ocorrenciasRetroativas(regraDe(r), r.geracaoDesde, hoje);
    if (todas.length === 0) return [];
    const competencias = todas.map((o) => o.competencia);
    const [gastos, conferencias] = await Promise.all([
      prisma.gasto.findMany({ where: { recorrenciaId: r.id, competencia: { in: competencias } }, select: { competencia: true } }),
      prisma.conferenciaDeRecorrencia.findMany({ where: { recorrenciaId: r.id, competencia: { in: competencias } }, select: { competencia: true } }),
    ]);
    const ocupadas = new Set([...gastos, ...conferencias].map((x) => x.competencia));
    return todas.filter((o) => !ocupadas.has(o.competencia));
  }

  async listar(hoje: string) {
    const recorrencias = await prisma.despesaRecorrente.findMany({
      orderBy: [{ situacao: "asc" }, { descricao: "asc" }],
    });
    const ids = recorrencias.map((r) => r.id);
    const [emAberto, pagas, pendentes] = await Promise.all([
      prisma.gasto.groupBy({ by: ["recorrenciaId"], where: { recorrenciaId: { in: ids }, pagoEm: null }, _count: true }),
      prisma.gasto.groupBy({ by: ["recorrenciaId"], where: { recorrenciaId: { in: ids }, pagoEm: { not: null } }, _count: true }),
      prisma.conferenciaDeRecorrencia.groupBy({ by: ["recorrenciaId"], where: { recorrenciaId: { in: ids }, situacao: "PENDENTE" }, _count: true }),
    ]);
    const contar = (lista: { recorrenciaId: string | null; _count: number }[]) =>
      new Map(lista.map((l) => [l.recorrenciaId, l._count]));
    const abertos = contar(emAberto);
    const pagos = contar(pagas);
    const conferir = contar(pendentes);

    return Promise.all(
      recorrencias.map(async (r) => ({
        ...r,
        valorPrevisto: Number(r.valorPrevisto),
        proximoVencimento: r.situacao === "ATIVA" ? (proximosVencimentos(regraDe(r), hoje, 1)[0]?.vencimento ?? null) : null,
        contasEmAberto: abertos.get(r.id) ?? 0,
        contasPagas: pagos.get(r.id) ?? 0,
        conferenciasPendentes: conferir.get(r.id) ?? 0,
        retroativasDisponiveis: await this.retroativasDisponiveis(r, hoje),
      })),
    );
  }

  async criar(dados: CriarRecorrenciaInput, usuarioId: string, hoje: string) {
    this.financeiro.conferirNaturezaDoProLabore(dados.natureza, dados.descricao, dados.categoria);

    const repetido = await prisma.despesaRecorrente.findUnique({ where: { chaveDeIdempotencia: dados.chave } });
    if (repetido) return { recorrencia: repetido, geracao: null, retroativas: await this.retroativasDisponiveis(repetido, hoje) };

    const { chave, ...campos } = dados;
    let recorrencia: DespesaRecorrente;
    try {
      recorrencia = await prisma.$transaction(async (tx) => {
        const criada = await tx.despesaRecorrente.create({
          data: { ...campos, geracaoDesde: hoje, chaveDeIdempotencia: chave, criadoPorId: usuarioId },
        });
        await tx.eventoDaRecorrencia.create({
          data: { recorrenciaId: criada.id, tipo: "CRIADA", depois: retrato(criada) as Prisma.InputJsonValue, usuarioId },
        });
        return criada;
      });
    } catch (e) {
      // Dois envios do mesmo formulário ao mesmo tempo: o segundo devolve o primeiro.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const primeiro = await prisma.despesaRecorrente.findUnique({ where: { chaveDeIdempotencia: chave } });
        if (primeiro) return { recorrencia: primeiro, geracao: null, retroativas: await this.retroativasDisponiveis(primeiro, hoje) };
      }
      throw e;
    }

    const geracao = await gerarContasAutomaticas(hoje, recorrencia.id);
    return { recorrencia, geracao, retroativas: await this.retroativasDisponiveis(recorrencia, hoje) };
  }

  /**
   * Edita a recorrência e leva a mudança às contas em aberto que vencem de
   * hoje em diante, campo a campo, só onde a conta ainda está como foi
   * gerada. Conta paga, conta vencida e ajuste feito à mão ficam como estão.
   */
  async editar(id: string, dados: EditarRecorrenciaInput, usuarioId: string, hoje: string) {
    const antes = await this.buscar(id);
    if (antes.situacao === "ENCERRADA") throw new ConflictException("Despesa encerrada não é editada. Cadastre uma nova.");
    if (dados.natureza !== undefined || dados.descricao !== undefined || dados.categoria !== undefined) {
      this.financeiro.conferirNaturezaDoProLabore(
        (dados.natureza ?? antes.natureza) as NaturezaDoGasto,
        dados.descricao ?? antes.descricao,
        dados.categoria !== undefined ? dados.categoria : antes.categoria,
      );
    }
    if (dados.dataFinal && dados.dataFinal < antes.dataInicial) {
      throw new BadRequestException("A data final não pode ser antes da inicial.");
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const depois = await tx.despesaRecorrente.update({ where: { id }, data: dados });
      const regraAntes = regraDe(antes);
      const regraDepois = regraDe(depois);
      const modeloAntes = modeloDe(antes);
      const modeloDepois = modeloDe(depois);

      const futuras = await tx.gasto.findMany({
        where: { recorrenciaId: id, pagoEm: null, venceEm: { gte: instanteDoDia(hoje) } },
      });
      const vinculadas = await this.vinculadas(tx, id);
      let afetadas = 0;
      for (const conta of futuras) {
        if (!conta.competencia || vinculadas.has(conta.id)) continue;
        // Data final antecipada: o mês que ficou fora da conta deixa de existir.
        if (depois.dataFinal !== null && diaPrevisto(conta.competencia, regraDepois) > depois.dataFinal) {
          await tx.gasto.delete({ where: { id: conta.id } });
          afetadas++;
          continue;
        }
        const mudancas = atualizacaoDaConta(
          {
            descricao: conta.descricao,
            natureza: conta.natureza as NaturezaDoGasto,
            categoria: conta.categoria,
            fornecedor: conta.fornecedor,
            valor: Number(conta.valor),
            venceEm: diaDoInstante(conta.venceEm!),
          },
          { ...modeloAntes, vencimento: vencimentoDaCompetencia(conta.competencia, regraAntes) },
          { ...modeloDepois, vencimento: vencimentoDaCompetencia(conta.competencia, regraDepois) },
        );
        if (Object.keys(mudancas).length === 0) continue;
        const { venceEm, ...resto } = mudancas;
        await tx.gasto.update({
          where: { id: conta.id },
          data: { ...resto, ...(venceEm ? { venceEm: instanteDoDia(venceEm) } : {}) },
        });
        afetadas++;
      }

      const a = retrato(antes);
      const d = retrato(depois);
      const mudou = CAMPOS_EDITAVEIS.filter((c) => JSON.stringify(a[c]) !== JSON.stringify(d[c]));
      await tx.eventoDaRecorrencia.create({
        data: {
          recorrenciaId: id,
          tipo: "EDITADA",
          antes: Object.fromEntries(mudou.map((c) => [c, a[c]])) as Prisma.InputJsonValue,
          depois: Object.fromEntries(mudou.map((c) => [c, d[c]])) as Prisma.InputJsonValue,
          contasAfetadas: afetadas,
          usuarioId,
        },
      });
      return { recorrencia: depois, contasAfetadas: afetadas };
    });

    const geracao = resultado.recorrencia.situacao === "ATIVA" ? await gerarContasAutomaticas(hoje, id) : null;
    return { ...resultado, geracao };
  }

  /** Gastos manuais que foram vinculados à recorrência: são da pessoa, não da geração. */
  private async vinculadas(tx: Prisma.TransactionClient, recorrenciaId: string): Promise<Set<string>> {
    const conferencias = await tx.conferenciaDeRecorrencia.findMany({
      where: { recorrenciaId, situacao: "VINCULADA", gastoId: { not: null } },
      select: { gastoId: true },
    });
    return new Set(conferencias.map((c) => c.gastoId!));
  }

  /**
   * Remove as contas geradas que ainda não venceram e não foram pagas. A de
   * hoje fica: vence hoje, ainda é devida.
   */
  private async removerFuturasEmAberto(tx: Prisma.TransactionClient, recorrenciaId: string, hoje: string): Promise<number> {
    const vinculadas = await this.vinculadas(tx, recorrenciaId);
    const futuras = await tx.gasto.findMany({
      where: { recorrenciaId, pagoEm: null, venceEm: { gt: instanteDoDia(hoje) } },
      select: { id: true },
    });
    const removiveis = futuras.filter((g) => !vinculadas.has(g.id)).map((g) => g.id);
    if (removiveis.length === 0) return 0;
    const { count } = await tx.gasto.deleteMany({ where: { id: { in: removiveis }, pagoEm: null } });
    return count;
  }

  async pausar(id: string, usuarioId: string, hoje: string) {
    const r = await this.buscar(id);
    if (r.situacao !== "ATIVA") throw new ConflictException("Só uma despesa ativa pode ser pausada.");
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.despesaRecorrente.updateMany({
        where: { id, situacao: "ATIVA" },
        data: { situacao: "PAUSADA", pausadaEm: new Date() },
      });
      if (count === 0) throw new ConflictException("A despesa mudou enquanto isso. Atualize a tela.");
      const removidas = await this.removerFuturasEmAberto(tx, id, hoje);
      await tx.eventoDaRecorrencia.create({ data: { recorrenciaId: id, tipo: "PAUSADA", contasAfetadas: removidas, usuarioId } });
      return { contasRemovidas: removidas };
    });
  }

  /**
   * Volta a gerar a partir de hoje. Os meses do período pausado não voltam
   * sozinhos: aparecem como meses anteriores, para gerar só se alguém marcar.
   */
  async retomar(id: string, usuarioId: string, hoje: string) {
    const r = await this.buscar(id);
    if (r.situacao !== "PAUSADA") throw new ConflictException("Só uma despesa pausada pode ser retomada.");
    const { count } = await prisma.despesaRecorrente.updateMany({
      where: { id, situacao: "PAUSADA" },
      data: { situacao: "ATIVA", pausadaEm: null, geracaoDesde: hoje },
    });
    if (count === 0) throw new ConflictException("A despesa mudou enquanto isso. Atualize a tela.");
    await prisma.eventoDaRecorrencia.create({ data: { recorrenciaId: id, tipo: "RETOMADA", usuarioId } });
    const geracao = await gerarContasAutomaticas(hoje, id);
    const atual = await this.buscar(id);
    return { geracao, retroativas: await this.retroativasDisponiveis(atual, hoje) };
  }

  /** Encerra hoje. Contas pagas e vencidas ficam; as futuras em aberto saem. */
  async encerrar(id: string, usuarioId: string, hoje: string) {
    const r = await this.buscar(id);
    if (r.situacao === "ENCERRADA") throw new ConflictException("Esta despesa já está encerrada.");
    const dataFinal = hoje >= r.dataInicial && (r.dataFinal === null || r.dataFinal > hoje) ? hoje : r.dataFinal;
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.despesaRecorrente.updateMany({
        where: { id, situacao: { not: "ENCERRADA" } },
        data: { situacao: "ENCERRADA", encerradaEm: new Date(), pausadaEm: null, dataFinal },
      });
      if (count === 0) throw new ConflictException("A despesa mudou enquanto isso. Atualize a tela.");
      const removidas = await this.removerFuturasEmAberto(tx, id, hoje);
      await tx.eventoDaRecorrencia.create({
        data: { recorrenciaId: id, tipo: "ENCERRADA", antes: { dataFinal: r.dataFinal }, depois: { dataFinal }, contasAfetadas: removidas, usuarioId },
      });
      return { contasRemovidas: removidas };
    });
  }

  /**
   * Gera meses anteriores ao cadastro, só os marcados. Passa pela mesma
   * conferência de duplicidade: mês antigo quase sempre já foi lançado à mão.
   */
  async gerarRetroativas(id: string, competencias: string[], usuarioId: string, hoje: string) {
    const r = await this.buscar(id);
    const disponiveis = new Map((await this.retroativasDisponiveis(r, hoje)).map((o) => [o.competencia, o]));
    const invalidas = competencias.filter((c) => !disponiveis.has(c));
    if (invalidas.length > 0) {
      throw new BadRequestException(`Estes meses não podem ser gerados: ${invalidas.join(", ")}. Atualize a tela.`);
    }
    const resultados: { competencia: string; resultado: ResultadoDaOcorrencia }[] = [];
    for (const competencia of Array.from(new Set(competencias)).sort()) {
      resultados.push({ competencia, resultado: await gerarOcorrencia(r, disponiveis.get(competencia)!) });
    }
    await prisma.eventoDaRecorrencia.create({
      data: {
        recorrenciaId: id,
        tipo: "RETROATIVAS_GERADAS",
        depois: resultados as unknown as Prisma.InputJsonValue,
        contasAfetadas: resultados.filter((x) => x.resultado === "GERADA").length,
        usuarioId,
      },
    });
    return { resultados };
  }

  async historico(id: string) {
    await this.buscar(id);
    return prisma.eventoDaRecorrencia.findMany({ where: { recorrenciaId: id }, orderBy: { criadoEm: "desc" }, take: 100 });
  }
}
