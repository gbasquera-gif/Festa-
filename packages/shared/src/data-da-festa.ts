import { z } from "zod";

/**
 * A data de uma festa: um dia do calendário, não um instante.
 *
 * A Festaê não guarda a hora da festa — só o dia. Mas o banco guarda
 * `timestamp`, e todo dia do calendário precisa virar algum instante para
 * caber ali. Qual instante se escolhe deixou de ser detalhe no dia em que a
 * loja e o painel escolheram instantes diferentes para o mesmo dia:
 *
 * - a loja mandava "2026-09-25" e o servidor gravava 25/09 00:00 UTC, que em
 *   Chapecó é 24/09 às 21h;
 * - a reserva manual gravava 25/09 12:00 UTC, que em Chapecó é 25/09 às 9h.
 *
 * As duas festas eram no dia 25, e o sistema discordava sobre isso. A tela de
 * Reservas mostrava 24/09 para uma e 25/09 para a outra, e a régua da
 * operação dizia "hoje é a festa" na véspera.
 *
 * Meio-dia UTC é a escolha porque é o único horário que sobrevive à volta ao
 * mundo: às 12:00 UTC ainda é o mesmo dia do calendário em qualquer fuso de
 * UTC-11 a UTC+11. Meia-noite não sobrevive a nenhum fuso negativo — e o
 * Brasil inteiro é negativo.
 */

/**
 * Chapecó em minutos de diferença para o UTC.
 *
 * Constante, e não consulta a um banco de fusos: o Brasil não tem horário de
 * verão desde 2019, e Santa Catarina não teve exceção nenhuma desde então.
 * Se um dia voltar, este é o único lugar a mudar.
 */
export const FUSO_DE_CHAPECO_EM_MINUTOS = -180;

/** Formato de um dia do calendário: AAAA-MM-DD. */
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Que dia do calendário era, em Chapecó, neste instante.
 *
 * Um pagamento das 22h de 30 de setembro é 1º de outubro em UTC. Para quem
 * fecha o mês na loja, ele é de setembro — e é essa a resposta que interessa.
 */
export function diaEmChapeco(instante: Date): string {
  const local = new Date(instante.getTime() + FUSO_DE_CHAPECO_EM_MINUTOS * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * O instante em que uma data de festa deve ser gravada.
 *
 * Aceita as duas formas que chegam pela API e as trata de maneira diferente
 * de propósito:
 *
 * - `"2026-09-25"` já é um dia do calendário. É o que a cliente tocou no
 *   calendário da loja, sem hora nenhuma junto, e vale literalmente.
 * - um instante completo (`Date`, ou `"...T22:00:00-03:00"`) precisa ser lido
 *   no fuso de Chapecó antes de virar dia. Às 22h de 25/09 em Chapecó já é
 *   26/09 em UTC, e gravar 26 seria adiantar a festa em um dia.
 *
 * Devolve sempre meio-dia UTC — a mesma âncora para toda festa, venha de onde
 * vier.
 */
export function normalizarDataDaFesta(entrada: string | Date): Date {
  // Um `Date` que chega aqui é um instante, e é lido como instante — o dia
  // que ele era em Chapecó. Isso é seguro porque, depois desta correção,
  // toda data de festa no sistema já está ancorada ao meio-dia UTC, e o dia
  // de Chapecó do meio-dia UTC é ele mesmo. A função é idempotente.
  //
  // As linhas antigas gravadas à meia-noite UTC são a exceção, e não são
  // tratadas aqui: elas têm origem conhecida (a loja) e uma migração
  // própria, que sabe que aquele instante queria dizer o dia seguinte.
  const dia =
    typeof entrada === "string" && DIA_ISO.test(entrada)
      ? entrada
      : diaEmChapeco(entrada instanceof Date ? entrada : new Date(entrada));

  const instante = new Date(`${dia}T12:00:00.000Z`);
  if (Number.isNaN(instante.getTime())) {
    throw new RangeError(`Data de festa inválida: ${String(entrada)}`);
  }
  return instante;
}

/**
 * O dia do calendário de uma festa já gravada, como "AAAA-MM-DD".
 *
 * Lê em UTC, e não no fuso de quem está olhando. A data gravada é uma âncora
 * de dia, não um horário — interpretá-la no relógio do aparelho é o que fazia
 * o celular da cliente mostrar um dia a menos que o combinado.
 */
export function diaDaFesta(data: string | Date): string {
  return (data instanceof Date ? data : new Date(data)).toISOString().slice(0, 10);
}

/**
 * A data de uma festa escrita como se lê em voz alta: 25/09/2026.
 *
 * Uma função só para a loja e para o painel. Enquanto cada tela formatava do
 * seu jeito, bastava uma delas usar o fuso do aparelho para a mesma festa
 * aparecer em dois dias diferentes na mesma empresa.
 */
export function formatarDataDaFesta(data: string | Date): string {
  return diaDaFesta(data).split("-").reverse().join("/");
}

/**
 * O campo "data da festa" de qualquer formulário da API.
 *
 * A normalização mora aqui, no limite de entrada, e não em cada serviço que
 * grava. Foi um serviço lembrar e o outro esquecer que criou o dia a menos:
 * a reserva manual ancorava ao meio-dia, a loja não ancorava nada. Com o
 * schema fazendo, não sobra caminho por onde esquecer.
 *
 * Recebe a entrada crua, sem `z.coerce.date()` antes — a coerção do Zod
 * transformaria "2026-09-25" em meia-noite UTC e apagaria justamente a
 * informação que distingue um dia do calendário de um instante.
 */
export const dataDaFestaSchema = z
  .union([z.string().min(1), z.date()])
  .transform((entrada, ctx) => {
    try {
      return normalizarDataDaFesta(entrada);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data da festa inválida." });
      return z.NEVER;
    }
  });
