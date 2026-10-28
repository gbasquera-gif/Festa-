import { FUSO_DE_CHAPECO_EM_MINUTOS, diaEmChapeco } from "@festae/shared";

/**
 * Datas de conta, do jeito que os gastos já gravam.
 *
 * O formulário de Despesas manda "AAAA-MM-DD" e o banco guarda meia-noite
 * UTC daquele dia; o financeiro lê o dia pelo `toISOString()`. As contas
 * geradas e os pagamentos registrados aqui seguem a mesma convenção, para
 * caírem no mesmo mês que um lançamento digitado à mão.
 */
export function instanteDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

export function diaDoInstante(instante: Date): string {
  return instante.toISOString().slice(0, 10);
}

/** Que dia é hoje em Chapecó. */
export function hojeEmChapeco(agora: Date): string {
  return diaEmChapeco(agora);
}

/** Que hora é agora em Chapecó (0 a 23). */
export function horaEmChapeco(agora: Date): number {
  return new Date(agora.getTime() + FUSO_DE_CHAPECO_EM_MINUTOS * 60_000).getUTCHours();
}
