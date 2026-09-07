import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  RESERVATION_TASKS,
  diasAteAFesta,
  etapaDaRegua,
  situacaoDaReserva,
  type Situacao,
} from "@festae/shared";
import { pendenciasDaReserva } from "./pendencias";
import {
  gerarIcs,
  linkGoogleAgenda,
  type FestaNoCalendario,
} from "./calendario";

/** Reservas que a operação ainda precisa cumprir. */
const ATIVAS = ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const;

/** Quantos dias para trás continuar mostrando festas já realizadas. */
const JANELA_DE_DEVOLUCAO = 7;

export interface FestaNoRadar {
  reservaId: string;
  data: string;
  dias: number;
  cliente: string;
  telefone: string | null;
  tema: string | null;
  tipo: string;
  status: string;
  origem: string;
  entrega: boolean;
  montagem: boolean;
  endereco: string | null;
  cidade: string;
  total: number;
  pago: number;
  saldo: number;
  etapa: { stage: string; titulo: string; acoes: string[] };
  tarefasFeitas: string[];
  tarefasAbertas: string[];
  pendencias: string[];
  situacao: Situacao;
}

const selecaoDaReserva = {
  id: true,
  eventDate: true,
  status: true,
  // Quando a reserva passou a existir. Uma venda fechada na quinta para a
  // festa de sábado não pode ser cobrada pelas tarefas de trinta dias atrás.
  requestedAt: true,
  tasks: { select: { key: true, doneAt: true, doneBy: { select: { name: true } } } },
  order: {
    select: {
      total: true,
      fulfillment: true,
      assembly: true,
      payments: { select: { amount: true, status: true, type: true } },
      event: {
        select: {
          type: true,
          address: true,
          city: true,
          saleChannel: true,
          theme: { select: { name: true } },
          user: { select: { name: true, phone: true } },
        },
      },
    },
  },
} as const;

/**
 * A central operacional da Festaê.
 *
 * O problema que ela resolve é de memória, não de dado: a informação sempre
 * esteve no banco, mas alguém precisava lembrar de procurá-la. A festa de
 * daqui a três semanas só aparecia se alguém rolasse a lista de reservas até
 * ela. Aqui é o contrário — a festa vem até a tela quando chega a hora, com o
 * que precisa ser feito escrito ao lado.
 */
@Injectable()
export class OperationsService {
  async proximasAcoes(agora: Date = new Date()) {
    const inicio = new Date(agora);
    inicio.setUTCHours(0, 0, 0, 0);
    inicio.setUTCDate(inicio.getUTCDate() - JANELA_DE_DEVOLUCAO);

    const limite = new Date(agora);
    limite.setUTCHours(23, 59, 59, 999);
    limite.setUTCDate(limite.getUTCDate() + 30);

    const reservas = await prisma.reservation.findMany({
      where: {
        eventDate: { gte: inicio, lte: limite },
        status: { in: [...ATIVAS, "COMPLETED"] },
      },
      select: selecaoDaReserva,
      orderBy: { eventDate: "asc" },
    });

    const festas = reservas.map((r) => this.montar(r, agora));

    // Devolução pendente de festa que já passou continua na tela: é material
    // que a Festaê acha que tem e não tem. Sai da lista quando alguém marca.
    const passadas = festas.filter(
      (f) => f.dias < 0 && !f.tarefasFeitas.includes("devolucao_concluida"),
    );
    const hoje = festas.filter((f) => f.dias === 0);
    const tresDias = festas.filter((f) => f.dias > 0 && f.dias <= 3);
    const seteDias = festas.filter((f) => f.dias > 3 && f.dias <= 7);
    const trintaDias = festas.filter((f) => f.dias > 7 && f.dias <= 30);

    return {
      hoje,
      tresDias,
      seteDias,
      trintaDias,
      devolucoesPendentes: passadas,
      resumo: {
        hoje: hoje.length,
        entregasHoje: hoje.filter((f) => f.entrega).length,
        retiradasHoje: hoje.filter((f) => !f.entrega).length,
        montagensHoje: hoje.filter((f) => f.montagem).length,
        devolucoesPendentes: passadas.length,
        atrasadas: festas.filter((f) => f.situacao === "ATRASADO").length,
        urgentes: festas.filter((f) => f.situacao === "URGENTE").length,
        comPendencia: festas.filter((f) => f.pendencias.length > 0).length,
      },
    };
  }

  /** Uma festa só, com tudo que a tela de detalhe precisa. */
  async detalhe(reservaId: string, agora: Date = new Date()): Promise<FestaNoRadar> {
    const reserva = await prisma.reservation.findUnique({
      where: { id: reservaId },
      select: selecaoDaReserva,
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    return this.montar(reserva, agora);
  }

  /**
   * Marca ou desmarca uma tarefa do checklist.
   *
   * Desmarcar apaga a linha em vez de guardar um "desfeito": o que importa
   * para a operação é o estado agora, e um histórico de marca-desmarca só
   * teria valor numa auditoria que a Festaê não faz.
   */
  async marcarTarefa(reservaId: string, key: string, done: boolean, usuarioId: string) {
    if (!RESERVATION_TASKS.includes(key as never)) {
      throw new ForbiddenException("Tarefa desconhecida.");
    }

    const reserva = await prisma.reservation.findUnique({
      where: { id: reservaId },
      select: { id: true },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");

    if (!done) {
      await prisma.reservationTask.deleteMany({ where: { reservationId: reservaId, key } });
      return { key, done: false };
    }

    await prisma.reservationTask.upsert({
      where: { reservationId_key: { reservationId: reservaId, key } },
      update: { doneAt: new Date(), doneById: usuarioId },
      create: { reservationId: reservaId, key, doneById: usuarioId },
    });
    return { key, done: true };
  }

  /**
   * Corrige dados de contato e observações de uma reserva já registrada.
   *
   * Não toca em data, itens nem valores — por isso não precisa reconferir
   * agenda nem estoque. É a correção de erro de digitação, não uma edição
   * de pedido: mudar o que foi vendido continua sendo cancelar e registrar
   * de novo, que é o caminho que mantém a agenda honesta.
   */
  async corrigirDados(
    reservaId: string,
    dados: {
      nome?: string;
      telefone?: string;
      endereco?: string;
      bairro?: string;
      observacoes?: string;
    },
  ) {
    const reserva = await prisma.reservation.findUnique({
      where: { id: reservaId },
      select: { id: true, orderId: true, order: { select: { eventId: true, event: { select: { userId: true } } } } },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");

    await prisma.$transaction(async (tx) => {
      if (dados.nome || dados.telefone) {
        await tx.user.update({
          where: { id: reserva.order.event.userId },
          data: {
            ...(dados.nome ? { name: dados.nome.trim() } : {}),
            ...(dados.telefone ? { phone: dados.telefone.trim() } : {}),
          },
        });
      }

      // Campo vazio apaga de propósito: é assim que se corrige um endereço
      // digitado numa reserva que na verdade é retirada.
      if (dados.endereco !== undefined || dados.bairro !== undefined) {
        await tx.event.update({
          where: { id: reserva.order.eventId },
          data: {
            ...(dados.endereco !== undefined ? { address: dados.endereco.trim() || null } : {}),
            ...(dados.bairro !== undefined ? { neighborhood: dados.bairro.trim() || null } : {}),
          },
        });
      }

      if (dados.observacoes !== undefined) {
        const texto = dados.observacoes.trim() || null;
        await tx.order.update({ where: { id: reserva.orderId }, data: { notes: texto } });
        await tx.reservation.update({ where: { id: reservaId }, data: { notes: texto } });
      }
    });

    return this.detalhe(reservaId);
  }

  /** Os dados da festa no formato que o calendário externo entende. */
  async paraCalendario(reservaId: string, linkDoPainel: string): Promise<FestaNoCalendario> {
    const f = await this.detalhe(reservaId);
    return {
      reservaId: f.reservaId,
      cliente: f.cliente,
      telefone: f.telefone,
      tema: f.tema,
      data: new Date(f.data),
      entrega: f.entrega,
      montagem: f.montagem,
      endereco: f.endereco,
      cidade: f.cidade,
      total: f.total,
      saldo: f.saldo,
      linkDoPainel,
    };
  }

  async ics(reservaId: string, linkDoPainel: string): Promise<string> {
    return gerarIcs(await this.paraCalendario(reservaId, linkDoPainel));
  }

  async linkGoogle(reservaId: string, linkDoPainel: string): Promise<string> {
    return linkGoogleAgenda(await this.paraCalendario(reservaId, linkDoPainel));
  }

  private montar(
    reserva: {
      id: string;
      eventDate: Date;
      status: string;
      requestedAt: Date;
      tasks: { key: string; doneAt: Date; doneBy: { name: string } | null }[];
      order: {
        total: unknown;
        fulfillment: string;
        assembly: boolean;
        payments: { amount: unknown; status: string; type: string }[];
        event: {
          type: string;
          address: string | null;
          city: string;
          saleChannel: string;
          theme: { name: string } | null;
          user: { name: string; phone: string | null };
        };
      };
    },
    agora: Date,
  ): FestaNoRadar {
    const dias = diasAteAFesta(reserva.eventDate, agora);
    const etapa = etapaDaRegua(dias);
    const etapaNaCriacao = etapaDaRegua(
      diasAteAFesta(reserva.eventDate, reserva.requestedAt),
    ).stage;

    const total = Number(reserva.order.total);
    const pago = reserva.order.payments
      .filter((p) => p.status === "PAID")
      .reduce((soma, p) => soma + Number(p.amount), 0);

    const entrega = reserva.order.fulfillment === "DELIVERY";
    const feitas = reserva.tasks.map((t) => t.key);

    const pendencias = pendenciasDaReserva({
      telefone: reserva.order.event.user.phone,
      entrega,
      endereco: reserva.order.event.address,
      sinalPago: reserva.order.payments.some((p) => p.type === "DEPOSIT" && p.status === "PAID"),
      temSinalRegistrado: reserva.order.payments.length > 0,
      saldoEmAberto: Math.max(0, total - pago),
      dias,
    });

    return {
      reservaId: reserva.id,
      data: reserva.eventDate.toISOString().slice(0, 10),
      dias,
      cliente: reserva.order.event.user.name,
      telefone: reserva.order.event.user.phone,
      tema: reserva.order.event.theme?.name ?? null,
      tipo: reserva.order.event.type,
      status: reserva.status,
      origem: reserva.order.event.saleChannel,
      entrega,
      montagem: reserva.order.assembly,
      endereco: reserva.order.event.address,
      cidade: reserva.order.event.city,
      total,
      pago,
      saldo: Math.max(0, total - pago),
      etapa: { stage: etapa.stage, titulo: etapa.titulo, acoes: etapa.acoes },
      tarefasFeitas: feitas,
      tarefasAbertas: etapa.tarefas.filter((t) => !feitas.includes(t)),
      pendencias,
      situacao: situacaoDaReserva({ dias, feitas, pendencias, etapaNaCriacao }),
    };
  }
}
