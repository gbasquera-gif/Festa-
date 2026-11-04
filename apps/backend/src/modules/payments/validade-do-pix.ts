import {
  PIX_EXPIRATION_MINUTES,
  RESERVATION_HOLD_MINUTES,
  horarioEmChapeco,
  type PrazoDoSinal,
} from "@festae/shared";

export { horarioEmChapeco };

/**
 * Até quando um Pix novo pode valer.
 *
 * Regra comercial decidida: gerar o Pix de novo não amplia o prazo da
 * reserva. Enquanto a reserva da loja aguarda o sinal (PENDING), ela segura a
 * data por RESERVATION_HOLD_MINUTES a partir do pedido, e nenhuma cobrança
 * pode vencer depois disso. Assim, todo pagamento que o Mercado Pago aceitar
 * cai dentro do prazo — e o que for pago dentro do prazo, mas confirmado
 * depois, continua protegido pela conferência antes da liberação.
 *
 * O Mercado Pago não aceita Pix com validade menor que 30 minutos
 * (PIX_EXPIRATION_MINUTES). Então a validade é sempre essa, e o Pix só é
 * gerado quando ela cabe inteira antes do fim do prazo, com uma folga para
 * a cobrança chegar ao provedor. Quando não cabe, não há cobrança
 * compatível: a geração é recusada com uma orientação para a cliente, e
 * nenhum prazo adicional é criado.
 *
 * Sem prazo (reserva confirmada pagando o saldo, ou pedido sem reserva), vale
 * o de sempre: 30 minutos.
 */

/** Tempo para a cobrança chegar ao Mercado Pago ainda com os 30 minutos mínimos. */
export const FOLGA_ATE_O_PROVEDOR_MS = 60_000;

export type ResultadoDaValidade =
  | { ok: true; expiresAt: Date }
  | {
      ok: false;
      codigo: "PRAZO_DO_SINAL_ENCERRADO" | "PRAZO_DO_SINAL_INSUFICIENTE";
      prazo: Date;
      mensagem: string;
    };

/**
 * O fim do prazo da reserva que aguarda o sinal, ou nulo quando não há prazo
 * correndo. É o mesmo prazo que a liberação de reservas sem sinal usa.
 */
export function prazoDaReserva(reserva: { status: string; requestedAt: Date } | null | undefined): Date | null {
  if (!reserva || reserva.status !== "PENDING") return null;
  return new Date(reserva.requestedAt.getTime() + RESERVATION_HOLD_MINUTES * 60_000);
}

export function validadeDoPix(agora: Date, prazo: Date | null): ResultadoDaValidade {
  const expiresAt = new Date(agora.getTime() + PIX_EXPIRATION_MINUTES * 60_000);
  if (!prazo) return { ok: true, expiresAt };

  const hora = horarioEmChapeco(prazo);
  if (prazo.getTime() <= agora.getTime()) {
    return {
      ok: false,
      codigo: "PRAZO_DO_SINAL_ENCERRADO",
      prazo,
      mensagem:
        `O prazo para pagar o sinal desta reserva terminou às ${hora}, e não geramos um Pix novo depois dele. ` +
        "Se você já pagou, não precisa fazer nada: a confirmação chega sozinha. Se ainda não pagou, fale com a Festaê pelo WhatsApp.",
    };
  }
  if (expiresAt.getTime() + FOLGA_ATE_O_PROVEDOR_MS > prazo.getTime()) {
    return {
      ok: false,
      codigo: "PRAZO_DO_SINAL_INSUFICIENTE",
      prazo,
      mensagem:
        `O prazo para pagar o sinal desta reserva termina às ${hora}, e um Pix novo precisa valer ${PIX_EXPIRATION_MINUTES} minutos — passaria do prazo. ` +
        "Se você já pagou o Pix anterior, não precisa fazer nada: a confirmação chega sozinha. Se ainda não pagou, fale com a Festaê pelo WhatsApp.",
    };
  }
  return { ok: true, expiresAt };
}

/**
 * O prazo do sinal para a tela de pagamento.
 *
 * Feito com as MESMAS funções que decidem a geração do Pix: o horário que o
 * app mostra ("Pague até 18:42"), a validade de qualquer Pix aceito (sempre
 * antes desse horário) e a mensagem quando não dá mais para gerar um Pix
 * novo saem da mesma conta. O app não calcula prazo nenhum.
 */
export function prazoDoSinalParaTela(
  reserva: { status: string; requestedAt: Date } | null | undefined,
  agora: Date,
): PrazoDoSinal {
  const prazo = prazoDaReserva(reserva);
  if (!prazo) return { temPrazo: false };
  const validade = validadeDoPix(agora, prazo);
  return {
    temPrazo: true,
    prazo: prazo.toISOString(),
    horario: horarioEmChapeco(prazo),
    encerrado: prazo.getTime() <= agora.getTime(),
    podeGerarNovoPix: validade.ok,
    motivo: validade.ok ? null : validade.codigo,
    mensagem: validade.ok ? null : validade.mensagem,
  };
}
