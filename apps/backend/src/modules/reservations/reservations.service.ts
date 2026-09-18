import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  diaDaFesta,
  fromCentsInt,
  normalizarDataDaFesta,
  saldoAPagar,
  toCentsInt,
} from "@festae/shared";
import type { CreateReservationInput, UpdateReservationStatusInput } from "@festae/shared";
import { AvailabilityService } from "../availability/availability.service";
import { mensagemDeConflito } from "../availability/item-commitment";
import { pendentesAEncerrar } from "./encerrar-pendencias";

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly availability: AvailabilityService) {}

  async requestReservation(eventId: string, input: CreateReservationInput) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        order: {
          include: {
            reservation: true,
            kit: { include: { products: { select: { productId: true, quantity: true } } } },
            items: { select: { productId: true, quantity: true } },
          },
        },
      },
    });
    if (!event || !event.order) throw new NotFoundException("Orçamento do evento não encontrado.");
    if (!event.order.kitId) {
      throw new BadRequestException("Selecione um kit antes de solicitar a reserva.");
    }
    if (event.order.reservation) {
      throw new ConflictException("Este evento já possui uma reserva solicitada.");
    }
    // Sem limite de festas por dia: a data só recusa por material. Duas
    // festas no mesmo dia podem ter escolhido o mesmo painel, e sem esta
    // conferência a Festaê receberia dois sinais por um item que ela tem um só.
    const conflitos = await this.availability.conflitosDeItens(event.date, {
      itensDoKit: event.order.kit?.products ?? [],
      itensAvulsos: event.order.items,
    });
    if (conflitos.length > 0) {
      throw new ConflictException(mensagemDeConflito(conflitos));
    }

    const [reservation] = await prisma.$transaction([
      prisma.reservation.create({
        data: {
          orderId: event.order.id,
          eventDate: event.date,
          notes: input.notes,
        },
      }),
      prisma.order.update({ where: { id: event.order.id }, data: { status: "REQUESTED" } }),
    ]);

    return reservation;
  }

  /**
   * Tudo que a operação precisa para atender uma reserva, numa consulta só.
   *
   * A Maria Luiza abre o painel para responder quatro perguntas: quem é,
   * o que separo, quando e onde entrego, e quanto já recebi. Trazer os
   * itens, o telefone, a logística e os pagamentos junto é o que evita que
   * ela precise abrir outra tela — ou pedir a informação por WhatsApp.
   */
  findAllAdmin() {
    return prisma.reservation.findMany({
      include: {
        order: {
          include: {
            event: { include: { user: true, theme: true } },
            kit: { include: { products: { include: { product: true } } } },
            items: { include: { product: true } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
      },
      orderBy: { eventDate: "asc" },
    });
  }

  /**
   * Uma reserva só, com tudo que o formulário de edição precisa reabrir.
   *
   * Existe em vez de o painel baixar a lista inteira e procurar dentro:
   * a tela de edição costuma ser aberta do celular, e trazer todas as
   * reservas para preencher um formulário é dado que não se usa.
   */
  async findOneAdmin(id: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            event: { include: { user: true, theme: true } },
            kit: { include: { products: { include: { product: true } } } },
            items: { include: { product: true } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    return reserva;
  }

  /**
   * Registra dinheiro que entrou por fora do aplicativo.
   *
   * Acrescenta um pagamento; nunca reescreve um existente. Dinheiro que
   * entrou é sempre seguro de registrar — editar um pagamento antigo é como
   * se apaga uma divergência de caixa sem ninguém perceber.
   *
   * Duas consequências acompanham o registro do sinal, e são o motivo de
   * isto viver no servidor e não numa tela:
   *
   * 1. A reserva que estava só solicitada passa a confirmada. É o mesmo que
   *    acontece quando o Pix da loja é aprovado — quem pagou o sinal tem a
   *    data, e a origem do dinheiro não muda isso.
   *
   * 2. Pendências são encerradas, e a regra tem dois níveis:
   *
   *    - as do MESMO TIPO, sempre. A cliente pagou o sinal por outro
   *      caminho; deixar o QR antigo "aguardando" faria o painel cobrar de
   *      novo alguém que já pagou.
   *
   *    - TODAS as restantes, quando este pagamento quita o pedido. Sem isto,
   *      um sinal pendente sobrevivia a um pagamento registrado como saldo,
   *      porque os tipos não batiam — e o pedido ficava quitado com uma
   *      cobrança órfã pendurada. Um pedido pago não tem o que cobrar, seja
   *      qual for o tipo do lançamento que o pagou.
   *
   * Nada aqui toca um pagamento PAID. Dinheiro que entrou é registro
   * histórico: o filtro `status: "PENDING"` na atualização é a garantia de
   * que nenhum caminho deste método reescreve um recebimento.
   */
  async registrarPagamento(
    id: string,
    dados: { tipo: "DEPOSIT" | "BALANCE"; valor: number; forma: string; recebidoEm?: string },
    usuarioId: string,
  ) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, total: true, payments: true } },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Reative ou registre uma nova antes de lançar o pagamento.",
      );
    }

    // Meio-dia UTC pela mesma razão da data da festa: é dia de calendário, e
    // meia-noite viraria o dia anterior no fuso de Chapecó.
    const recebidoEm = dados.recebidoEm ? normalizarDataDaFesta(dados.recebidoEm) : new Date();
    if (recebidoEm.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException("A data do pagamento não pode estar no futuro.");
    }

    const confirmaAReserva = dados.tipo === "DEPOSIT" && reserva.status === "PENDING";
    const orderId = reserva.order.id;
    const totalDoPedido = Number(reserva.order.total);

    /**
     * Tudo daqui para baixo roda sob lock do pedido.
     *
     * A conferência de saldo não pode ser feita fora da transação. Duas
     * requisições simultâneas — clique duplo, retry do navegador, duas abas —
     * leriam o mesmo "já pago", as duas achariam que cabe, e as duas
     * gravariam. Foi assim que um pedido de R$ 400,00 chegou a R$ 610,00 em
     * recebimentos num teste de concorrência.
     *
     * O `FOR UPDATE` na linha do pedido serializa por pedido: a segunda
     * requisição espera a primeira terminar e só então relê os pagamentos,
     * já enxergando o que a primeira gravou. Pedidos diferentes não esperam
     * uns pelos outros.
     */
    const apurado = await prisma.$transaction(async (tx) => {
      // 1. O lock. É a linha do pedido, e não a dos pagamentos, porque o que
      //    precisa ser serializado é a decisão sobre o saldo dele.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      // 2. Reler dentro do lock. A leitura de fora serviu para validar a
      //    reserva; para decidir sobre dinheiro, ela já pode estar velha.
      const pagamentos = await tx.payment.findMany({
        where: { orderId },
        select: { id: true, type: true, status: true, amount: true },
      });

      // 3. Saldo em centavos: comparar dinheiro em ponto flutuante deixa
      //    passar um centavo, e um centavo a mais é sobrepagamento igual.
      const pagoEmCentavos = pagamentos
        .filter((p) => p.status === "PAID")
        .reduce((soma, p) => soma + toCentsInt(Number(p.amount)), 0);
      const totalEmCentavos = toCentsInt(totalDoPedido);
      const saldoEmCentavos = totalEmCentavos - pagoEmCentavos;
      const valorEmCentavos = toCentsInt(dados.valor);

      // 4. Pedido quitado não recebe mais nada. A recusa diz os números, em
      //    vez de mandar a operação ir conferir em outra tela.
      if (saldoEmCentavos <= 0) {
        throw new ConflictException(
          `Este pedido já está quitado: R$ ${fromCentsInt(pagoEmCentavos).toFixed(2)} ` +
            `recebidos de R$ ${totalDoPedido.toFixed(2)}. ` +
            "Nenhum recebimento novo pode ser lançado.",
        );
      }

      // 5. Pagar mais que o saldo também é sobrepagamento.
      if (valorEmCentavos > saldoEmCentavos) {
        throw new ConflictException(
          `O valor excede o saldo deste pedido. Saldo disponível: ` +
            `R$ ${fromCentsInt(saldoEmCentavos).toFixed(2)}.`,
        );
      }

      // 6. Cabe. A partir daqui é escrita.
      const quita = valorEmCentavos >= saldoEmCentavos;
      const aEncerrar = pendentesAEncerrar(
        pagamentos,
        { tipo: dados.tipo, valor: dados.valor },
        totalDoPedido,
        fromCentsInt(pagoEmCentavos),
      );

      await tx.payment.create({
        data: {
          orderId,
          type: dados.tipo,
          amount: dados.valor,
          method: dados.forma as never,
          status: "PAID",
          paidAt: recebidoEm,
        },
      });

      // 7. Quitar encerra o que restou pendente — a regra do 8a77a08.
      if (aEncerrar.length > 0) {
        await tx.payment.updateMany({
          // `status: "PENDING"` no filtro não é redundante nem sob lock: é a
          // garantia estrutural de que nenhum caminho deste método reescreve
          // um recebimento já registrado.
          where: { id: { in: aEncerrar }, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }

      if (confirmaAReserva) {
        await tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
        await tx.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
      }

      // O funil só sabe que a loja vende quando o dinheiro entra. Pagamento
      // recebido por fora conta igual — senão o relatório subestima a
      // empresa justamente nas vendas fechadas na conversa.
      await tx.analyticsEvent.create({
        data: {
          type: "PAGAMENTO_REALIZADO",
          metadata: {
            orderId,
            tipo: dados.tipo,
            valor: String(dados.valor),
            registradoPor: usuarioId,
            manual: true,
          },
        },
      });

      return {
        pago: fromCentsInt(pagoEmCentavos + valorEmCentavos),
        encerradas: aEncerrar.length,
        quita,
      };
    });

    this.logger.log(
      `Pagamento de R$ ${dados.valor.toFixed(2)} (${dados.tipo}) registrado por ${usuarioId} ` +
        `na reserva ${id}${confirmaAReserva ? " — reserva confirmada" : ""}.`,
    );

    return {
      registrado: true,
      total: totalDoPedido,
      pago: apurado.pago,
      saldo: saldoAPagar(totalDoPedido, apurado.pago),
      reservaConfirmada: confirmaAReserva,
      pixPendentesEncerrados: apurado.encerradas,
      pedidoQuitado: apurado.quita,
    };
  }

  /**
   * Cancela uma reserva, guardando o histórico.
   *
   * Cancelar não apaga nada: a reserva continua no banco com status
   * CANCELLED, e com ela o pedido, os itens e os pagamentos já registrados.
   * O que muda é o efeito no presente — a data volta a caber uma festa e o
   * material volta ao acervo, porque as duas contagens ignoram reserva
   * cancelada.
   *
   * Registra quem cancelou. A operação inteira sente o efeito de uma data
   * que abre; sem autoria, "por que essa data liberou?" é uma pergunta sem
   * resposta, e alguém remarca por cima de uma decisão que não sabe que
   * existiu.
   */
  async cancelar(id: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      select: { id: true, orderId: true, status: true },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED") {
      throw new BadRequestException("Esta reserva já está cancelada.");
    }

    const [atualizada] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: usuarioId },
      }),
      prisma.order.update({ where: { id: reserva.orderId }, data: { status: "CANCELLED" } }),
    ]);

    this.logger.log(`Reserva ${id} cancelada por ${usuarioId}.`);
    return atualizada;
  }

  /**
   * Apaga de vez uma reserva de teste ou lançada por engano.
   *
   * Exclusão física, e não arquivamento, por uma razão concreta: um registro
   * "arquivado" precisaria ser filtrado na agenda, na conferência de estoque,
   * na lista de reservas, na tela de operação e no funil. Um filtro esquecido
   * em qualquer um desses lugares vira uma reserva invisível que continua
   * segurando uma data — exatamente a classe de defeito que este projeto já
   * passou meses corrigindo. Apagar resolve os cinco lugares de uma vez.
   *
   * É seguro porque o banco cascateia: apagar a festa leva junto pedido,
   * itens, pagamentos, reserva e tarefas, sem deixar órfão. Nenhuma outra
   * festa, cliente ou pagamento é tocado — cada festa tem o seu próprio
   * pedido, e não há registro compartilhado entre elas.
   *
   * A ficha do cliente só cai junto quando ela existe apenas por causa desta
   * reserva: sem senha (nunca foi uma conta de verdade) e sem outra festa. É
   * o que impede o painel de acumular clientes de teste órfãos.
   */
  async excluirDefinitivamente(id: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            payments: { select: { id: true, status: true, amount: true } },
            event: {
              select: {
                id: true,
                userId: true,
                user: { select: { id: true, name: true, passwordHash: true } },
              },
            },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");

    const evento = reserva.order.event;
    const pagos = reserva.order.payments.filter((p) => p.status === "PAID");

    const outrasFestas = await prisma.event.count({
      where: { userId: evento.userId, id: { not: evento.id } },
    });

    // Ficha criada só para esta reserva: some junto. Conta de verdade (tem
    // senha) ou cliente com outra festa ficam onde estão.
    const clienteFicaOrfao = outrasFestas === 0 && !evento.user.passwordHash;

    await prisma.$transaction(async (tx) => {
      // Apagar a festa cascateia para pedido, itens, pagamentos, reserva e
      // tarefas. Uma chamada só, sem chance de deixar metade para trás.
      await tx.event.delete({ where: { id: evento.id } });
      if (clienteFicaOrfao) {
        await tx.user.delete({ where: { id: evento.userId } });
      }
    });

    this.logger.warn(
      `Reserva ${id} EXCLUÍDA por ${usuarioId} — festa ${evento.id}, ` +
        `${pagos.length} pagamento(s) marcado(s) como pago apagado(s)` +
        `${clienteFicaOrfao ? `, ficha do cliente "${evento.user.name}" removida` : ""}.`,
    );

    return {
      excluida: true,
      pagamentosApagados: pagos.length,
      valorApagado: pagos.reduce((soma, p) => soma + Number(p.amount), 0),
      clienteRemovido: clienteFicaOrfao ? evento.user.name : null,
    };
  }

  /**
   * Muda a data de uma festa já reservada.
   *
   * A cliente que reservou para o dia 25 e pediu o 27 não tinha caminho no
   * painel: a operação teria que cancelar e lançar de novo, perdendo o
   * histórico, o pagamento e o checklist.
   *
   * A data nova passa pelas mesmas duas conferências de uma reserva nova —
   * cabe mais uma festa nesse dia? o material está livre? — porque remarcar
   * é ocupar uma data, e ocupar sem conferir é como se vendem duas festas
   * para o mesmo sábado.
   *
   * A própria reserva é ignorada nas duas contagens: ela não pode disputar
   * vaga nem material consigo mesma.
   *
   * Grava a data nos DOIS lugares onde ela vive. `Reservation.eventDate`
   * manda na agenda e no painel; `Event.date` é o que a cliente vê no app.
   * Mover só um deixaria a loja e a operação discordando sobre quando é a
   * festa — o pior desacordo possível.
   */
  async alterarData(id: string, novaDataISO: string, usuarioId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            kit: {
              select: {
                products: {
                  where: { product: { active: true } },
                  select: { productId: true, quantity: true },
                },
              },
            },
            items: { select: { productId: true, quantity: true } },
            event: { select: { id: true, date: true } },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Registre uma nova reserva para a data desejada.",
      );
    }

    let novaData: Date;
    try {
      novaData = normalizarDataDaFesta(novaDataISO);
    } catch {
      throw new BadRequestException("Data inválida.");
    }

    const mesmoDia = diaDaFesta(reserva.eventDate) === diaDaFesta(novaData);
    if (mesmoDia) {
      throw new BadRequestException("A festa já está marcada para esta data.");
    }

    const conflitos = await this.availability.conflitosDeItens(
      novaData,
      {
        itensDoKit: reserva.order.kit?.products ?? [],
        itensAvulsos: reserva.order.items,
      },
      reserva.order.id,
    );
    if (conflitos.length > 0) {
      throw new ConflictException({
        message: "Falta material na data nova.",
        conflitos: conflitos.map((c) => ({
          produto: c.nome,
          estoqueTotal: c.estoque,
          jaComprometido: c.jaComprometido,
          necessario: c.pedido,
          disponivel: Math.max(0, c.estoque - c.jaComprometido),
        })),
      });
    }

    const dataAnterior = reserva.eventDate;

    const [atualizada] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          eventDate: novaData,
          rescheduledAt: new Date(),
          // Guarda a primeira data, não a penúltima: se a festa for remarcada
          // duas vezes, o que interessa é de onde ela saiu originalmente.
          rescheduledFrom: reserva.rescheduledFrom ?? dataAnterior,
        },
      }),
      prisma.event.update({ where: { id: reserva.order.event.id }, data: { date: novaData } }),
    ]);

    this.logger.log(
      `Reserva ${id} remarcada por ${usuarioId}: ` +
        `${diaDaFesta(dataAnterior)} -> ${diaDaFesta(novaData)}.`,
    );

    return atualizada;
  }

  async updateStatus(id: string, input: UpdateReservationStatusInput) {
    const reservation = await prisma.reservation.findUnique({ where: { id } });
    if (!reservation) throw new NotFoundException("Reserva não encontrada.");

    // PREPARING, READY e COMPLETED são etapas posteriores à confirmação: o
    // pedido continua CONFIRMED e só a etapa operacional avança.
    const orderStatus =
      input.status === "CONFIRMED" || input.status === "PREPARING" || input.status === "READY" || input.status === "COMPLETED"
        ? ("CONFIRMED" as const)
        : input.status === "CANCELLED" || input.status === "REJECTED"
          ? ("CANCELLED" as const)
          : undefined;

    const [updated] = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: {
          status: input.status,
          confirmedAt: input.status === "CONFIRMED" ? new Date() : reservation.confirmedAt,
        },
      }),
      ...(orderStatus
        ? [prisma.order.update({ where: { id: reservation.orderId }, data: { status: orderStatus } })]
        : []),
    ]);

    return updated;
  }
}
