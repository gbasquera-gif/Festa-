import { Prisma, prisma } from "@festae/database";
import { diaEmChapeco } from "@festae/shared";
import type { ConfiguracaoDoAssistente } from "./configuracao";
import { arredondar, gastoExcedido, hashCurto, RECUSA_EM_ANDAMENTO, type ControleDeUso, type Recusa, type TotaisDeUso } from "./controle";

/**
 * Limites de uso e teto de gasto contados no banco (tabela `assistente_uso`).
 *
 * Valem para todas as instâncias da API e não zeram a cada deploy. Cada
 * pergunta incrementa, numa transação, o total do dia da Festaê e a hora e o
 * dia da pessoa; se algum passar do limite, a transação volta atrás e a
 * pergunta é recusada. Como cada linha fica travada até o fim da transação,
 * duas instâncias ao mesmo tempo nunca passam juntas do teto — e como todas
 * travam na mesma ordem, uma não espera pela outra em círculo.
 *
 * O gasto estimado é somado no dia e no mês depois de cada resposta, e o teto
 * é conferido antes de cada pergunta. Perguntas que já estavam em andamento
 * quando o teto foi atingido ainda terminam: o excesso fica em centavos.
 *
 * "Uma pergunta por vez" continua por instância: é proteção de uso da tela,
 * não de custo — o custo já está preso pelos contadores acima.
 */

type Coluna = "perguntas" | "falas";
type Cliente = Pick<typeof prisma, "$queryRaw" | "$executeRaw" | "$transaction">;

class Excedido extends Error {
  constructor(readonly recusa: Recusa) {
    super(recusa.motivo);
  }
}

export function janelasDe(agora: Date) {
  const dia = diaEmChapeco(agora);
  return { hora: `H:${agora.toISOString().slice(0, 13)}`, dia: `D:${dia}`, mes: `M:${dia.slice(0, 7)}` };
}

function segundosAteAProximaHora(agora: Date): number {
  return Math.max(1, 3600 - agora.getUTCMinutes() * 60 - agora.getUTCSeconds());
}

export class LimitesNoBanco implements ControleDeUso {
  readonly onde = "BANCO" as const;
  private readonly emAndamento = new Set<string>();
  private ultimaLimpeza = 0;

  constructor(
    private readonly limites: ConfiguracaoDoAssistente["limites"],
    private readonly db: Cliente = prisma,
  ) {}

  async reservarPergunta(usuarioId: string, agora = new Date()): Promise<Recusa | null> {
    if (this.emAndamento.has(usuarioId)) return RECUSA_EM_ANDAMENTO;
    // Trava antes da primeira espera: duas perguntas juntas da mesma pessoa
    // nesta instância não passam as duas.
    this.emAndamento.add(usuarioId);
    const j = janelasDe(agora);
    const pessoa = escopoDa(usuarioId);
    try {
      await this.db.$transaction(async (tx) => {
        const teto = await this.tetoDeGasto(tx, j);
        if (teto) throw new Excedido(teto);
        if ((await somar(tx, j.dia, "TOTAL", "perguntas")) > this.limites.perguntasPorDiaNoTotal) {
          throw new Excedido({ motivo: "O assistente atingiu o limite de perguntas de hoje para a Festaê. Volta amanhã.", tentarEmSegundos: 3600 });
        }
        if ((await somar(tx, j.hora, pessoa, "perguntas")) > this.limites.perguntasPorHora) {
          throw new Excedido({ motivo: "Você atingiu o limite de perguntas por hora.", tentarEmSegundos: segundosAteAProximaHora(agora) });
        }
        if ((await somar(tx, j.dia, pessoa, "perguntas")) > this.limites.perguntasPorDia) {
          throw new Excedido({ motivo: "Você atingiu o limite de perguntas de hoje.", tentarEmSegundos: 3600 });
        }
      });
    } catch (e) {
      this.emAndamento.delete(usuarioId);
      if (e instanceof Excedido) return e.recusa;
      throw e;
    }
    this.limparDeVezEmQuando();
    return null;
  }

  liberar(usuarioId: string) {
    this.emAndamento.delete(usuarioId);
  }

  async reservarFala(usuarioId: string, agora = new Date()): Promise<Recusa | null> {
    const j = janelasDe(agora);
    try {
      await this.db.$transaction(async (tx) => {
        const teto = await this.tetoDeGasto(tx, j);
        if (teto) throw new Excedido(teto);
        if ((await somar(tx, j.hora, escopoDa(usuarioId), "falas")) > this.limites.falasPorHora) {
          throw new Excedido({ motivo: "Limite de respostas faladas por hora atingido.", tentarEmSegundos: segundosAteAProximaHora(agora) });
        }
      });
    } catch (e) {
      if (e instanceof Excedido) return e.recusa;
      throw e;
    }
    return null;
  }

  async conferirGasto(agora = new Date()): Promise<Recusa | null> {
    return this.tetoDeGasto(this.db, janelasDe(agora));
  }

  async registrarGasto(usd: number, agora = new Date()) {
    if (!(usd > 0)) return;
    const j = janelasDe(agora);
    for (const janela of [j.dia, j.mes]) {
      await this.db.$executeRaw`
        INSERT INTO "assistente_uso" ("janela", "escopo", "custoUsd", "atualizadoEm")
        VALUES (${janela}, 'TOTAL', ${usd}, now())
        ON CONFLICT ("janela", "escopo") DO UPDATE
        SET "custoUsd" = "assistente_uso"."custoUsd" + ${usd}, "atualizadoEm" = now()`;
    }
  }

  async totais(agora = new Date()): Promise<TotaisDeUso> {
    const j = janelasDe(agora);
    const linhas = await this.db.$queryRaw<{ janela: string; perguntas: number; custoUsd: number }[]>`
      SELECT "janela", "perguntas", "custoUsd" FROM "assistente_uso"
      WHERE "escopo" = 'TOTAL' AND "janela" IN (${j.dia}, ${j.mes})`;
    const dia = linhas.find((l) => l.janela === j.dia);
    const mes = linhas.find((l) => l.janela === j.mes);
    return {
      onde: this.onde,
      dia: j.dia.slice(2),
      perguntasNoDia: dia?.perguntas ?? 0,
      gastoNoDiaUsd: arredondar(dia?.custoUsd ?? 0),
      mes: j.mes.slice(2),
      gastoNoMesUsd: arredondar(mes?.custoUsd ?? 0),
      tetoDoDiaUsd: this.limites.gastoMaximoPorDiaUsd,
      tetoDoMesUsd: this.limites.gastoMaximoPorMesUsd,
    };
  }

  private async tetoDeGasto(db: Pick<Cliente, "$queryRaw">, j: ReturnType<typeof janelasDe>): Promise<Recusa | null> {
    const linhas = await db.$queryRaw<{ janela: string; custoUsd: number }[]>`
      SELECT "janela", "custoUsd" FROM "assistente_uso"
      WHERE "escopo" = 'TOTAL' AND "janela" IN (${j.dia}, ${j.mes})`;
    const gasto = (janela: string) => linhas.find((l) => l.janela === janela)?.custoUsd ?? 0;
    return gastoExcedido(this.limites, gasto(j.dia), gasto(j.mes));
  }

  /** Apaga contadores por hora antigos. No máximo uma vez por hora, sem travar a pergunta. */
  private limparDeVezEmQuando() {
    const agora = Date.now();
    if (agora - this.ultimaLimpeza < 3_600_000) return;
    this.ultimaLimpeza = agora;
    this.db
      .$executeRaw`DELETE FROM "assistente_uso" WHERE "janela" LIKE 'H:%' AND "atualizadoEm" < now() - interval '3 days'`
      .catch(() => undefined);
  }
}

function escopoDa(usuarioId: string): string {
  return `U:${hashCurto(usuarioId)}`;
}

/** Soma 1 ao contador e devolve o novo valor. Atômico: trava a linha até o fim da transação. */
async function somar(tx: Pick<Cliente, "$queryRaw">, janela: string, escopo: string, coluna: Coluna): Promise<number> {
  const c = Prisma.raw(`"${coluna}"`);
  const [linha] = await tx.$queryRaw<{ valor: number }[]>`
    INSERT INTO "assistente_uso" ("janela", "escopo", ${c}, "atualizadoEm")
    VALUES (${janela}, ${escopo}, 1, now())
    ON CONFLICT ("janela", "escopo") DO UPDATE
    SET ${c} = "assistente_uso".${c} + 1, "atualizadoEm" = now()
    RETURNING ${c} AS "valor"`;
  return Number(linha.valor);
}
