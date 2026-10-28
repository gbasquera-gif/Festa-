import { Prisma, prisma, type DespesaRecorrente } from "@festae/database";
import {
  candidatosDeDuplicidade,
  DIAS_DE_TOLERANCIA_NA_CONFERENCIA,
  deslocarDia,
  ocorrenciasAutomaticas,
  type ModeloDaConta,
  type NaturezaDoGasto,
  type Ocorrencia,
  type RegraDeVencimento,
} from "@festae/shared";
import { diaDoInstante, instanteDoDia } from "./datas";

/**
 * A geração dos meses de uma despesa recorrente.
 *
 * Cada mês vira um `Gasto` a pagar (sem `pagoEm`). Três garantias, todas no
 * banco e não na memória do processo — a tarefa pode cair no meio e rodar de
 * novo, duas execuções podem se cruzar:
 *
 * 1. Um mês só uma vez: (recorrência, competência) é único em `gastos`. A
 *    segunda tentativa é recusada pelo índice e contada como "já existia".
 * 2. Mês já decidido não renasce: se há conferência para ele (pendente,
 *    vinculada, gerada ou dispensada), a geração automática não o cria.
 * 3. Lançamento manual parecido para a geração: em vez de duplicar, abre uma
 *    conferência e espera alguém dizer se é a mesma conta.
 *
 * Nada aqui registra pagamento. O gasto nasce em aberto e só sai do "a
 * pagar" quando alguém informa o dia em que o dinheiro saiu.
 */

export type ResultadoDaOcorrencia = "GERADA" | "JA_EXISTIA" | "JA_DECIDIDA" | "CONFERENCIA";

export type ResumoDaGeracao = {
  recorrencias: number;
  geradas: number;
  jaExistiam: number;
  jaDecididas: number;
  conferenciasAbertas: number;
};

export function regraDe(r: DespesaRecorrente): RegraDeVencimento {
  return {
    diaDoVencimento: r.diaDoVencimento,
    intervaloMeses: r.intervaloMeses,
    dataInicial: r.dataInicial,
    dataFinal: r.dataFinal,
    ajusteDiaInexistente: r.ajusteDiaInexistente,
    ajusteDiaNaoUtil: r.ajusteDiaNaoUtil,
  };
}

export function modeloDe(r: DespesaRecorrente): ModeloDaConta {
  return {
    descricao: r.descricao,
    natureza: r.natureza as NaturezaDoGasto,
    categoria: r.categoria,
    fornecedor: r.fornecedor,
    valor: Number(r.valorPrevisto),
  };
}

function ehDuplicidade(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Cria o gasto do mês. Se outro processo criou antes, conta como já existente. */
export async function criarContaDoMes(
  r: DespesaRecorrente,
  o: Ocorrencia,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ id: string } | null> {
  const modelo = modeloDe(r);
  try {
    return await tx.gasto.create({
      data: {
        descricao: modelo.descricao,
        natureza: modelo.natureza,
        categoria: modelo.categoria,
        fornecedor: modelo.fornecedor,
        valor: modelo.valor,
        venceEm: instanteDoDia(o.vencimento),
        pagoEm: null,
        recorrenciaId: r.id,
        competencia: o.competencia,
      },
      select: { id: true },
    });
  } catch (e) {
    if (ehDuplicidade(e)) return null;
    throw e;
  }
}

/**
 * Um mês de uma recorrência: cria, ou diz por que não criou.
 *
 * `conferir` desligado só quando alguém já respondeu à conferência dizendo
 * que são contas diferentes.
 */
export async function gerarOcorrencia(
  r: DespesaRecorrente,
  o: Ocorrencia,
  { conferir = true }: { conferir?: boolean } = {},
): Promise<ResultadoDaOcorrencia> {
  const chave = { recorrenciaId: r.id, competencia: o.competencia };

  const existente = await prisma.gasto.findUnique({
    where: { recorrenciaId_competencia: chave },
    select: { id: true },
  });
  if (existente) return "JA_EXISTIA";

  const decidida = await prisma.conferenciaDeRecorrencia.findUnique({
    where: { recorrenciaId_competencia: chave },
    select: { id: true, situacao: true },
  });
  if (decidida) {
    // "São contas diferentes, gerar" continua valendo se a conta saiu por
    // pausa ou data final e o mês voltou a valer: gera sem perguntar de novo.
    // Pendente, vinculada e dispensada esperam ou ficam como decidido.
    if (decidida.situacao !== "GERADA") return "JA_DECIDIDA";
    const criado = await criarContaDoMes(r, o);
    if (!criado) return "JA_EXISTIA";
    await prisma.conferenciaDeRecorrencia.update({ where: { id: decidida.id }, data: { gastoId: criado.id } });
    return "GERADA";
  }

  if (conferir) {
    const modelo = modeloDe(r);
    const de = instanteDoDia(deslocarDia(o.vencimento, -DIAS_DE_TOLERANCIA_NA_CONFERENCIA));
    const ate = instanteDoDia(deslocarDia(o.vencimento, DIAS_DE_TOLERANCIA_NA_CONFERENCIA + 1));
    const proximos = await prisma.gasto.findMany({
      where: {
        recorrenciaId: null,
        natureza: modelo.natureza,
        OR: [{ venceEm: { gte: de, lt: ate } }, { venceEm: null, pagoEm: { gte: de, lt: ate } }],
      },
      select: { id: true, descricao: true, natureza: true, fornecedor: true, valor: true, venceEm: true, pagoEm: true },
    });
    const candidatos = candidatosDeDuplicidade(
      { ...modelo, tipoDeValor: r.tipoDeValor, vencimento: o.vencimento },
      proximos.map((g) => ({
        id: g.id,
        descricao: g.descricao,
        natureza: g.natureza as NaturezaDoGasto,
        fornecedor: g.fornecedor,
        valor: Number(g.valor),
        venceEm: g.venceEm ? diaDoInstante(g.venceEm) : null,
        pagoEm: g.pagoEm ? diaDoInstante(g.pagoEm) : null,
        recorrenciaId: null,
      })),
    );
    if (candidatos.length > 0) {
      try {
        await prisma.conferenciaDeRecorrencia.create({
          data: { ...chave, vencimento: o.vencimento, candidatos: candidatos.map((c) => c.id) },
        });
      } catch (e) {
        if (!ehDuplicidade(e)) throw e;
      }
      return "CONFERENCIA";
    }
  }

  return (await criarContaDoMes(r, o)) ? "GERADA" : "JA_EXISTIA";
}

function somar(resumo: ResumoDaGeracao, resultado: ResultadoDaOcorrencia) {
  if (resultado === "GERADA") resumo.geradas++;
  else if (resultado === "JA_EXISTIA") resumo.jaExistiam++;
  else if (resultado === "JA_DECIDIDA") resumo.jaDecididas++;
  else resumo.conferenciasAbertas++;
}

/**
 * A geração automática: os meses do horizonte de cada recorrência ativa (ou
 * de uma só). Pode rodar quantas vezes for; só cria o que falta.
 */
export async function gerarContasAutomaticas(hoje: string, recorrenciaId?: string): Promise<ResumoDaGeracao> {
  const recorrencias = await prisma.despesaRecorrente.findMany({
    where: { situacao: "ATIVA", ...(recorrenciaId ? { id: recorrenciaId } : {}) },
  });
  const resumo: ResumoDaGeracao = { recorrencias: recorrencias.length, geradas: 0, jaExistiam: 0, jaDecididas: 0, conferenciasAbertas: 0 };
  for (const r of recorrencias) {
    for (const o of ocorrenciasAutomaticas(regraDe(r), r.geracaoDesde, hoje)) {
      somar(resumo, await gerarOcorrencia(r, o));
    }
  }
  return resumo;
}
