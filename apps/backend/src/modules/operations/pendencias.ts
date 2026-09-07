/**
 * O que impede uma festa de acontecer sem susto.
 *
 * Diferente do checklist: o checklist é o que a equipe precisa *fazer*;
 * pendência é o que está *faltando no cadastro*. As duas coisas aparecem
 * juntas na tela, mas a ação é outra — uma se resolve marcando, a outra se
 * resolve ligando para a cliente ou corrigindo o pedido.
 *
 * Separado do serviço para poder ser testado sem banco: é a lista que decide
 * o que a Maria Luiza vai ver como problema, e errar aqui é encher a tela de
 * alarme falso — o jeito mais rápido de fazer alguém parar de olhar a tela.
 */

export interface DadosDaReserva {
  telefone: string | null;
  entrega: boolean;
  endereco: string | null;
  sinalPago: boolean;
  temSinalRegistrado: boolean;
  saldoEmAberto: number;
  dias: number;
}

/** Quantos dias antes da festa o saldo em aberto vira problema. */
const PRAZO_DO_SALDO = 3;

export function pendenciasDaReserva(d: DadosDaReserva): string[] {
  const lista: string[] = [];

  if (!d.telefone) lista.push("Telefone do cliente faltando");

  // Endereço só é obrigatório quando alguém precisa chegar lá.
  if (d.entrega && !d.endereco) lista.push("Endereço faltando para a entrega");

  if (!d.temSinalRegistrado) {
    lista.push("Nenhum pagamento registrado");
  } else if (!d.sinalPago) {
    lista.push("Sinal ainda não pago");
  }

  // Saldo só cobra perto da festa: cobrar o restante com dois meses de
  // antecedência não é pendência, é o combinado normal.
  if (d.saldoEmAberto > 0 && d.dias <= PRAZO_DO_SALDO) {
    lista.push("Saldo a receber antes da entrega");
  }

  return lista;
}
