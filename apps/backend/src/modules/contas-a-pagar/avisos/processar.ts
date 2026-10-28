import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@festae/database";
import {
  HORA_PADRAO_DO_AVISO,
  JANELA_DE_RECUPERACAO_DO_AVISO,
  MARCOS_DE_AVISO,
  deslocarDia,
  diasAte,
  marcoDoDia,
  textoDoPrazo,
} from "@festae/shared";
import { diaDoInstante, hojeEmChapeco, horaEmChapeco, instanteDoDia } from "../datas";
import { gerarContasAutomaticas, type ResumoDaGeracao } from "../geracao";
import { emailDeContas } from "./mensagem";
import { FalhaNoEnvio, type TransporteDeEmail } from "./transporte";

/**
 * A tarefa diária de contas a pagar: gera os meses das recorrências, cria
 * os avisos do dia na central do painel e manda os e-mails.
 *
 * Roda num serviço agendado à parte, de hora em hora, sem endpoint HTTP.
 * Pode cair no meio e rodar de novo: o que impede duplicidade está no banco.
 *
 * - geração: um gasto por (recorrência, mês) — índice único;
 * - aviso na central: um por (conta, vencimento, marco) — chave única;
 * - e-mail: um aviso entra uma vez por destinatário — (aviso, destinatário)
 *   único; e cada e-mail leva o próprio id como chave de idempotência ao
 *   provedor, com o texto congelado na primeira tentativa, para a
 *   retentativa ser reconhecida como o mesmo envio.
 */

export const NOME_DA_TAREFA = "contas-a-pagar";

/** Espera entre tentativas, por número da tentativa que falhou. Somadas: 13h15 — dentro das 24h da chave. */
const ESPERAS_MS = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000, 8 * 60 * 60_000];
export const MAXIMO_DE_TENTATIVAS = ESPERAS_MS.length + 1;
/** Depois disto desde a primeira tentativa, repetir pode duplicar: o provedor já esqueceu a chave. */
const JANELA_DA_CHAVE_MS = 23 * 60 * 60_000;
const PRAZO_DO_ENVIO_MS = 10 * 60_000;
const PRAZO_DA_TRAVA_MS = 15 * 60_000;
const LOTE_DE_ENVIOS = 50;

export type ConfiguracaoLida = {
  marcos: number[];
  horaDoAviso: number;
  emailAtivo: boolean;
  mostrarValorNoEmail: boolean;
};

export async function lerConfiguracao(): Promise<ConfiguracaoLida> {
  const linha = await prisma.configuracaoDeAvisos.findUnique({ where: { id: "padrao" } });
  if (!linha) {
    return { marcos: [...MARCOS_DE_AVISO], horaDoAviso: HORA_PADRAO_DO_AVISO, emailAtivo: false, mostrarValorNoEmail: false };
  }
  return {
    marcos: linha.marcos,
    horaDoAviso: linha.horaDoAviso,
    emailAtivo: linha.emailAtivo,
    mostrarValorNoEmail: linha.mostrarValorNoEmail,
  };
}

/* ------------------------------------------------------------------ *
 * Trava
 * ------------------------------------------------------------------ */

/** Tenta pegar a trava da tarefa. Devolve o dono, ou nulo se outra execução está com ela. */
export async function travar(nome: string, agora: Date): Promise<string | null> {
  const dono = randomUUID();
  const ate = new Date(agora.getTime() + PRAZO_DA_TRAVA_MS);
  try {
    await prisma.travaDeTarefa.create({ data: { nome, dono, ate } });
    return dono;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  // Já existe: só vale tomar se venceu (execução que morreu sem soltar).
  const { count } = await prisma.travaDeTarefa.updateMany({ where: { nome, ate: { lt: agora } }, data: { dono, ate } });
  return count === 1 ? dono : null;
}

export async function destravar(nome: string, dono: string): Promise<void> {
  await prisma.travaDeTarefa.deleteMany({ where: { nome, dono } });
}

/* ------------------------------------------------------------------ *
 * Avisos na central
 * ------------------------------------------------------------------ */

/** Cria os avisos de hoje na central. Repetir não cria de novo. */
export async function criarNotificacoesDoDia(hoje: string, marcos: readonly number[]): Promise<number> {
  if (marcos.length === 0) return 0;
  const maior = Math.max(...marcos);
  const menor = Math.min(...marcos);
  const contas = await prisma.gasto.findMany({
    where: {
      pagoEm: null,
      venceEm: {
        gte: instanteDoDia(deslocarDia(hoje, menor - JANELA_DE_RECUPERACAO_DO_AVISO)),
        lt: instanteDoDia(deslocarDia(hoje, maior + 1)),
      },
    },
    select: { id: true, descricao: true, venceEm: true },
  });
  const novas: Prisma.NotificacaoDeContaCreateManyInput[] = [];
  for (const conta of contas) {
    const vencimento = diaDoInstante(conta.venceEm!);
    const marco = marcoDoDia(vencimento, hoje, marcos);
    if (marco === null) continue;
    novas.push({
      chave: `${conta.id}:${vencimento}:${marco}`,
      gastoId: conta.id,
      marco,
      vencimento,
      dia: hoje,
      titulo: `${conta.descricao.slice(0, 160)} — ${textoDoPrazo(diasAte(hoje, vencimento))}`,
    });
  }
  if (novas.length === 0) return 0;
  const { count } = await prisma.notificacaoDeConta.createMany({ data: novas, skipDuplicates: true });
  return count;
}

/* ------------------------------------------------------------------ *
 * E-mails
 * ------------------------------------------------------------------ */

/**
 * Junta, para cada destinatário confirmado, os avisos recentes que ainda não
 * foram para ele, num e-mail só. Aviso de conta já paga fica de fora.
 */
export async function montarEnvios(hoje: string): Promise<number> {
  const destinatarios = await prisma.destinatarioDeAviso.findMany({
    where: { ativo: true, verificadoEm: { not: null } },
    select: { id: true },
  });
  if (destinatarios.length === 0) return 0;
  const recentes = await prisma.notificacaoDeConta.findMany({
    where: { dia: { gte: deslocarDia(hoje, -JANELA_DE_RECUPERACAO_DO_AVISO) }, gasto: { is: { pagoEm: null } } },
    select: { id: true, itens: { select: { destinatarioId: true } } },
  });
  let criados = 0;
  for (const d of destinatarios) {
    const faltam = recentes.filter((n) => !n.itens.some((i) => i.destinatarioId === d.id)).map((n) => n.id);
    if (faltam.length === 0) continue;
    try {
      await prisma.$transaction(async (tx) => {
        const envio = await tx.envioDeAviso.create({ data: { destinatarioId: d.id, dia: hoje } });
        await tx.itemDoEnvio.createMany({
          data: faltam.map((notificacaoId) => ({ envioId: envio.id, notificacaoId, destinatarioId: d.id })),
        });
      });
      criados++;
    } catch (e) {
      // Outra execução incluiu algum destes avisos para este destinatário.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  return criados;
}

export type ResumoDoDespacho = {
  enviados: number;
  falharam: number;
  esgotados: number;
  cancelados: number;
  incertos: number;
  retomados: number;
};

/**
 * Manda o que está na fila. Cada envio é tomado com um UPDATE condicional,
 * para duas execuções nunca mandarem o mesmo.
 */
export async function despacharEnvios(
  agora: Date,
  transporte: TransporteDeEmail,
  config: ConfiguracaoLida,
  painel: string | null,
): Promise<ResumoDoDespacho> {
  const resumo: ResumoDoDespacho = { enviados: 0, falharam: 0, esgotados: 0, cancelados: 0, incertos: 0, retomados: 0 };
  const hoje = hojeEmChapeco(agora);

  // Envio que ficou "enviando" além do prazo: o processo caiu no meio. Não se
  // sabe se saiu; dentro da janela da chave, repetir é seguro.
  const presos = await prisma.envioDeAviso.findMany({
    where: { situacao: "ENVIANDO", travadoAte: { lt: agora } },
    select: { id: true, primeiraTentativaEm: true },
  });
  for (const p of presos) {
    const velho = p.primeiraTentativaEm !== null && agora.getTime() - p.primeiraTentativaEm.getTime() > JANELA_DA_CHAVE_MS;
    await prisma.envioDeAviso.updateMany({
      where: { id: p.id, situacao: "ENVIANDO" },
      data: velho
        ? { situacao: "INCERTO", travadoAte: null, ultimoErro: "interrompido; pode ter saído" }
        : { situacao: "FALHOU", travadoAte: null, proximaTentativaEm: agora, ultimoErro: "interrompido" },
    });
    if (velho) resumo.incertos++;
    else resumo.retomados++;
  }

  const fila = await prisma.envioDeAviso.findMany({
    where: { situacao: { in: ["PENDENTE", "FALHOU"] }, proximaTentativaEm: { lte: agora } },
    include: { destinatario: true },
    orderBy: { criadoEm: "asc" },
    take: LOTE_DE_ENVIOS,
  });

  for (const envio of fila) {
    const encerrar = async (situacao: "CANCELADO" | "INCERTO" | "ESGOTADO", motivo: string) => {
      await prisma.envioDeAviso.updateMany({
        where: { id: envio.id, situacao: { in: ["PENDENTE", "FALHOU", "ENVIANDO"] } },
        data: { situacao, travadoAte: null, ultimoErro: motivo },
      });
      if (situacao === "CANCELADO") resumo.cancelados++;
      else if (situacao === "INCERTO") resumo.incertos++;
      else resumo.esgotados++;
    };

    if (envio.primeiraTentativaEm && agora.getTime() - envio.primeiraTentativaEm.getTime() > JANELA_DA_CHAVE_MS) {
      await encerrar("INCERTO", "fora da janela de repetição segura");
      continue;
    }
    if (!config.emailAtivo) {
      await encerrar("CANCELADO", "e-mail desligado");
      continue;
    }
    if (!envio.destinatario.ativo || envio.destinatario.verificadoEm === null) {
      await encerrar("CANCELADO", "destinatário desativado");
      continue;
    }

    // Toma o envio. Se outra execução tomou antes, segue.
    const tomado = await prisma.envioDeAviso.updateMany({
      where: { id: envio.id, situacao: envio.situacao, tentativas: envio.tentativas },
      data: {
        situacao: "ENVIANDO",
        travadoAte: new Date(agora.getTime() + PRAZO_DO_ENVIO_MS),
        tentativas: { increment: 1 },
        primeiraTentativaEm: envio.primeiraTentativaEm ?? agora,
      },
    });
    if (tomado.count === 0) continue;
    const tentativa = envio.tentativas + 1;

    // Conta paga desde que o aviso entrou na fila: o lembrete não sai.
    const itens = await prisma.itemDoEnvio.findMany({
      where: { envioId: envio.id },
      include: { notificacao: { include: { gasto: { select: { descricao: true, valor: true, venceEm: true, pagoEm: true } } } } },
    });
    const emAberto = itens
      .map((i) => i.notificacao.gasto)
      .filter((g): g is NonNullable<typeof g> => g !== null && g.pagoEm === null && g.venceEm !== null);
    if (emAberto.length === 0) {
      await encerrar("CANCELADO", "contas pagas antes do envio");
      continue;
    }

    let assunto = envio.assunto;
    let corpo = envio.corpo;
    if (!assunto || !corpo) {
      const email = emailDeContas({
        para: envio.destinatario.email,
        contas: emAberto.map((g) => ({ descricao: g.descricao, vencimento: diaDoInstante(g.venceEm!), valor: Number(g.valor) })),
        hoje,
        mostrarValor: config.mostrarValorNoEmail,
        painel,
      });
      assunto = email.assunto;
      corpo = email.texto;
      await prisma.envioDeAviso.update({ where: { id: envio.id }, data: { assunto, corpo } });
    }

    try {
      const { idNoProvedor } = await transporte.enviar({ para: envio.destinatario.email, assunto, texto: corpo }, envio.id);
      await prisma.envioDeAviso.update({
        where: { id: envio.id },
        data: { situacao: "ENVIADO", enviadoEm: new Date(), idNoProvedor, travadoAte: null, ultimoErro: null },
      });
      resumo.enviados++;
    } catch (e) {
      const falha = e instanceof FalhaNoEnvio ? e : new FalhaNoEnvio("erro interno", true);
      if (falha.repetivel && tentativa < MAXIMO_DE_TENTATIVAS) {
        await prisma.envioDeAviso.update({
          where: { id: envio.id },
          data: {
            situacao: "FALHOU",
            travadoAte: null,
            ultimoErro: falha.motivo,
            proximaTentativaEm: new Date(agora.getTime() + ESPERAS_MS[tentativa - 1]),
          },
        });
        resumo.falharam++;
      } else {
        await prisma.envioDeAviso.update({
          where: { id: envio.id },
          data: { situacao: "ESGOTADO", travadoAte: null, ultimoErro: falha.motivo },
        });
        resumo.esgotados++;
      }
    }
  }
  return resumo;
}

/* ------------------------------------------------------------------ *
 * A tarefa inteira
 * ------------------------------------------------------------------ */

export type ResumoDaTarefa = {
  hoje: string;
  executou: boolean;
  motivo?: string;
  geracao?: ResumoDaGeracao;
  notificacoesCriadas?: number;
  enviosCriados?: number;
  despacho?: ResumoDoDespacho | null;
  email?: string;
};

/** Só o tipo e o código do erro: mensagem de erro de banco pode trazer dados. */
function erroSeguro(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return `${e.name} ${e.code}`;
  if (e instanceof Error) return e.name;
  return "erro desconhecido";
}

export async function executarTarefaDeContas(opcoes: {
  agora: Date;
  transporte: TransporteDeEmail | null;
  motivoSemEmail: string | null;
  painel: string | null;
}): Promise<ResumoDaTarefa> {
  const { agora, transporte } = opcoes;
  const hoje = hojeEmChapeco(agora);
  const dono = await travar(NOME_DA_TAREFA, agora);
  if (!dono) return { hoje, executou: false, motivo: "outra execução em andamento" };

  const execucao = await prisma.execucaoDeTarefa.create({ data: { tarefa: NOME_DA_TAREFA, iniciadaEm: agora } });
  try {
    const geracao = await gerarContasAutomaticas(hoje);
    const config = await lerConfiguracao();
    const naHora = horaEmChapeco(agora) >= config.horaDoAviso;
    const notificacoesCriadas = naHora ? await criarNotificacoesDoDia(hoje, config.marcos) : 0;
    const comEmail = transporte !== null && config.emailAtivo;
    const enviosCriados = naHora && comEmail ? await montarEnvios(hoje) : 0;
    const despacho = transporte ? await despacharEnvios(agora, transporte, config, opcoes.painel) : null;
    const email = !config.emailAtivo ? "desligado no painel" : transporte ? transporte.nome : (opcoes.motivoSemEmail ?? "sem transporte");

    const resumo: ResumoDaTarefa = { hoje, executou: true, geracao, notificacoesCriadas, enviosCriados, despacho, email };
    await prisma.execucaoDeTarefa.update({
      where: { id: execucao.id },
      data: { terminadaEm: new Date(), sucesso: true, resumo: resumo as unknown as Prisma.InputJsonValue },
    });
    return resumo;
  } catch (e) {
    await prisma.execucaoDeTarefa
      .update({ where: { id: execucao.id }, data: { terminadaEm: new Date(), sucesso: false, erro: erroSeguro(e) } })
      .catch(() => undefined);
    throw e;
  } finally {
    await destravar(NOME_DA_TAREFA, dono).catch(() => undefined);
  }
}

export { erroSeguro };
