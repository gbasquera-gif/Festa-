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
  totalDaVendaManual,
  type EditarReservaInput,
  type ManualReservationInput,
} from "@festae/shared";
import { AvailabilityService } from "../availability/availability.service";
import { getMaxReservationsPerDay } from "../../common/operations-config";

/** Estados que seguram data e material. Recusada e cancelada devolvem tudo. */
const RESERVAS_ATIVAS = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"] as const;

/**
 * O detalhe de um conflito, do jeito que a operação precisa ler.
 *
 * A loja mostra à cliente uma frase sem números ("o painel já está
 * reservado"). Aqui é o contrário: quem está digitando a reserva precisa
 * decidir o que fazer, e para isso precisa ver a conta inteira — inclusive
 * de quem é a outra festa que está segurando a peça.
 */
export interface ConflitoDetalhado {
  productId: string;
  produto: string;
  estoqueTotal: number;
  jaComprometido: number;
  necessario: number;
  disponivel: number;
  reservasEmChoque: { id: string; cliente: string; status: string }[];
}

@Injectable()
export class ManualReservationService {
  private readonly logger = new Logger(ManualReservationService.name);

  constructor(private readonly availability: AvailabilityService) {}

  /**
   * Registra no sistema uma venda fechada por fora da loja.
   *
   * O ponto todo desta função é não ser um atalho. Ela monta exatamente os
   * mesmos registros que a loja monta — cliente, festa, pedido, itens,
   * pagamento e reserva — e passa pelas mesmas duas barreiras: cabe mais uma
   * festa neste dia? o material está livre? Uma reserva de WhatsApp que
   * pulasse essas conferências seria pior que não existir: o calendário
   * continuaria oferecendo a data, e a operação confiaria num painel que
   * mente.
   *
   * Grava tudo numa transação só. Metade de uma reserva — festa criada,
   * reserva não — é o tipo de registro que ninguém encontra e que some da
   * agenda justamente por não ter reserva.
   */
  async criar(input: ManualReservationInput, criadoPorId: string) {
    // Já vem ancorada ao meio-dia UTC pelo schema. Reancorar aqui seria uma
    // segunda regra de fuso à espera de divergir da primeira.
    const dataDaFesta = input.evento.data;

    // 1. A agenda ainda comporta esta festa?
    if (!(await this.availability.isDateAvailable(dataDaFesta))) {
      const limite = getMaxReservationsPerDay();
      throw new ConflictException(
        `Esta data já tem ${limite} festa(s) — o limite operacional do dia. ` +
          "Cancele ou remarque uma das reservas antes de registrar esta.",
      );
    }

    // 2. O material desta festa está livre nesta data?
    const kit = input.produtos.kitId
      ? await prisma.kit.findUnique({
          where: { id: input.produtos.kitId },
          select: {
            id: true,
            products: {
              where: { product: { active: true } },
              select: { productId: true, quantity: true },
            },
          },
        })
      : null;

    if (input.produtos.kitId && !kit) {
      throw new BadRequestException("O kit escolhido não existe mais.");
    }

    const pedido = {
      itensDoKit: kit?.products ?? [],
      itensAvulsos: input.produtos.itens,
    };

    const conflitos = await this.availability.conflitosDeItens(dataDaFesta, pedido);
    if (conflitos.length > 0) {
      throw new ConflictException({
        message: "Faltam itens para esta data.",
        conflitos: await this.detalhar(conflitos, dataDaFesta),
      });
    }

    // 3. Preços gravados a partir do que foi combinado, não recalculados.
    const total = totalDaVendaManual(input.financeiro);
    const precos = await this.precosDosItens(input.produtos.itens.map((i) => i.productId));

    const cliente = await this.acharOuCriarCliente(input.cliente);

    const reserva = await prisma.$transaction(async (tx) => {
      const evento = await tx.event.create({
        data: {
          userId: cliente.id,
          type: input.evento.tipo,
          date: dataDaFesta,
          guestCount: input.evento.guestCount,
          themeId: input.evento.themeId || undefined,
          address: input.logistica.endereco || undefined,
          neighborhood: input.logistica.bairro || undefined,
          city: input.logistica.cidade || "Chapecó",
          saleChannel: input.origem as never,
        },
      });

      const ordem = await tx.order.create({
        data: {
          eventId: evento.id,
          kitId: kit?.id,
          status: "CONFIRMED",
          subtotalKit: input.financeiro.valorProdutos,
          subtotalExtras: 0,
          fulfillment: input.logistica.fulfillment,
          assembly: input.logistica.assembly,
          deliveryFee: input.financeiro.entrega,
          assemblyFee: input.financeiro.montagem,
          total,
          notes: input.evento.observacoes || undefined,
          items: {
            create: input.produtos.itens.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: precos.get(item.productId) ?? 0,
            })),
          },
        },
      });

      // Sinal zero não vira pagamento: uma linha de R$ 0,00 "pendente"
      // apareceria como cobrança a fazer numa venda que ainda não teve
      // nenhuma combinação de pagamento.
      if (input.financeiro.sinal > 0) {
        await tx.payment.create({
          data: {
            orderId: ordem.id,
            type: "DEPOSIT",
            amount: input.financeiro.sinal,
            method: input.financeiro.formaPagamento,
            status: input.financeiro.statusPagamento,
            paidAt: input.financeiro.statusPagamento === "PAID" ? new Date() : null,
          },
        });
      }

      return tx.reservation.create({
        data: {
          orderId: ordem.id,
          eventDate: dataDaFesta,
          // Venda fechada nasce confirmada: o combinado já existe, e deixá-la
          // pendente a faria expirar sozinha na limpeza de reservas sem sinal.
          status: "CONFIRMED",
          confirmedAt: new Date(),
          notes: input.evento.observacoes || undefined,
        },
      });
    });

    this.logger.log(
      `Reserva manual ${reserva.id} criada por ${criadoPorId} — canal ${input.origem}.`,
    );

    return reserva;
  }


  /**
   * Reescreve uma reserva já existente.
   *
   * Antes disso, mudar o que foi vendido só tinha um caminho: cancelar e
   * lançar de novo. Isso funcionava, mas cobrava caro — o histórico, o sinal
   * já recebido e o checklist do dia iam junto, e a operação passava a ter
   * duas reservas onde houve uma festa só.
   *
   * A edição passa pelas mesmas duas barreiras da reserva nova, agora
   * ignorando a própria reserva nas duas contagens: ela não disputa vaga nem
   * material consigo mesma. Isso é o que permite acrescentar um item sem que
   * o sistema acuse conflito com as peças que essa mesma festa já segurava.
   *
   * Duas coisas o formulário não toca, de propósito:
   *
   * 1. **Pagamentos.** Sinal recebido é dinheiro que entrou, com referência
   *    no Mercado Pago. Um formulário de edição que reescrevesse isso
   *    transformaria erro de digitação em divergência de caixa. Os valores do
   *    pedido mudam; o saldo se recalcula sozinho a partir do que já foi pago.
   *
   * 2. **A identidade do cliente.** Nome e telefone se corrigem, porque é
   *    onde o erro de digitação acontece. O e-mail só entra quando a ficha
   *    ainda não tem nenhum — trocar o e-mail de uma conta com senha seria
   *    trocar o login da cliente por dentro de uma tela de reserva.
   */
  async editar(id: string, input: EditarReservaInput, editadoPorId: string) {
    const reserva = await prisma.reservation.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            eventId: true,
            event: {
              select: {
                id: true,
                userId: true,
                user: { select: { id: true, passwordHash: true, email: true } },
              },
            },
          },
        },
      },
    });
    if (!reserva) throw new NotFoundException("Reserva não encontrada.");
    if (reserva.status === "CANCELLED" || reserva.status === "REJECTED") {
      throw new BadRequestException(
        "Esta reserva está cancelada. Registre uma nova reserva em vez de editar esta.",
      );
    }

    const dataDaFesta = input.evento.data;

    const mudouDeDia = diaDaFesta(reserva.eventDate) !== diaDaFesta(dataDaFesta);

    // 1. A agenda comporta esta festa na data escolhida?
    if (!(await this.availability.isDateAvailable(dataDaFesta, id))) {
      const limite = getMaxReservationsPerDay();
      throw new ConflictException(
        `Esta data já tem ${limite} festa(s) — o limite operacional do dia. ` +
          "Cancele ou remarque uma das reservas antes de mover esta.",
      );
    }

    // 2. O material do pedido novo está livre nesta data?
    const kit = input.produtos.kitId
      ? await prisma.kit.findUnique({
          where: { id: input.produtos.kitId },
          select: {
            id: true,
            products: {
              where: { product: { active: true } },
              select: { productId: true, quantity: true },
            },
          },
        })
      : null;

    if (input.produtos.kitId && !kit) {
      throw new BadRequestException("O kit escolhido não existe mais.");
    }

    const conflitos = await this.availability.conflitosDeItens(
      dataDaFesta,
      { itensDoKit: kit?.products ?? [], itensAvulsos: input.produtos.itens },
      reserva.order.id,
    );
    if (conflitos.length > 0) {
      throw new ConflictException({
        message: "Faltam itens para esta data.",
        conflitos: await this.detalhar(conflitos, dataDaFesta, reserva.order.id),
      });
    }

    const total = totalDaVendaManual(input.financeiro);
    const precos = await this.precosDosItens(input.produtos.itens.map((i) => i.productId));
    const cliente = reserva.order.event.user;
    const emailNovo = input.cliente.email?.trim() || null;
    const observacoes = input.evento.observacoes?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: cliente.id },
        data: {
          name: input.cliente.nome.trim(),
          phone: input.cliente.telefone.trim(),
          // E-mail só preenche vazio. Ver a nota 2 acima.
          ...(emailNovo && !cliente.email && !cliente.passwordHash ? { email: emailNovo } : {}),
        },
      });

      await tx.event.update({
        where: { id: reserva.order.eventId },
        data: {
          type: input.evento.tipo,
          date: dataDaFesta,
          guestCount: input.evento.guestCount ?? null,
          themeId: input.evento.themeId || null,
          address: input.logistica.endereco?.trim() || null,
          neighborhood: input.logistica.bairro?.trim() || null,
          city: input.logistica.cidade?.trim() || "Chapecó",
          ...(input.origem ? { saleChannel: input.origem as never } : {}),
        },
      });

      // Os itens avulsos são substituídos, não conciliados: a lista que veio
      // do formulário é a verdade sobre o que foi vendido, e tentar casar
      // linha a linha só abriria caminho para sobrar item que a operação
      // acha que tirou.
      await tx.orderItem.deleteMany({ where: { orderId: reserva.order.id } });

      await tx.order.update({
        where: { id: reserva.order.id },
        data: {
          kitId: kit?.id ?? null,
          subtotalKit: input.financeiro.valorProdutos,
          subtotalExtras: 0,
          fulfillment: input.logistica.fulfillment,
          assembly: input.logistica.assembly,
          deliveryFee: input.financeiro.entrega,
          assemblyFee: input.financeiro.montagem,
          total,
          notes: observacoes,
          items: {
            create: input.produtos.itens.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: precos.get(item.productId) ?? 0,
            })),
          },
        },
      });

      await tx.reservation.update({
        where: { id },
        data: {
          eventDate: dataDaFesta,
          notes: observacoes,
          ...(mudouDeDia
            ? {
                rescheduledAt: new Date(),
                // A primeira data, não a penúltima: remarcada duas vezes, o
                // que interessa é de onde a festa saiu originalmente.
                rescheduledFrom: reserva.rescheduledFrom ?? reserva.eventDate,
              }
            : {}),
        },
      });
    });

    this.logger.log(
      `Reserva ${id} editada por ${editadoPorId}` +
        (mudouDeDia
          ? ` — data ${diaDaFesta(reserva.eventDate)} -> ${diaDaFesta(dataDaFesta)}`
          : "") +
        `, total R$ ${total.toFixed(2)}.`,
    );

    return { id, data: diaDaFesta(dataDaFesta), total, remarcada: mudouDeDia };
  }

  /**
   * Reaproveita o cadastro do cliente quando ele já existe.
   *
   * Procura por e-mail e, na falta dele, por telefone. É o que faz a cliente
   * que aluga todo ano aparecer como uma pessoa só, com histórico — em vez de
   * virar cinco cadastros iguais e estragar qualquer contagem de clientes.
   *
   * O cadastro nasce sem senha: ele é ficha de cliente, não acesso. Se essa
   * pessoa um dia criar conta no app com o mesmo e-mail, cai neste mesmo
   * registro e leva o histórico junto.
   */
  private async acharOuCriarCliente(dados: ManualReservationInput["cliente"]) {
    const email = dados.email?.trim() || null;
    const telefone = dados.telefone.trim();

    const existente = email
      ? await prisma.user.findUnique({ where: { email } })
      : await prisma.user.findFirst({ where: { phone: telefone, deletedAt: null } });

    if (existente && !existente.deletedAt) {
      // Telefone novo de cliente conhecido é atualização, não conflito.
      if (existente.phone !== telefone) {
        await prisma.user.update({ where: { id: existente.id }, data: { phone: telefone } });
      }
      return existente;
    }

    return prisma.user.create({
      data: {
        name: dados.nome.trim(),
        email,
        phone: telefone,
        role: "CLIENT",
      },
    });
  }

  /** Preço de tabela de cada item, congelado no pedido. */
  private async precosDosItens(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const produtos = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, unitPrice: true },
    });
    return new Map(produtos.map((p) => [p.id, Number(p.unitPrice)]));
  }

  /**
   * Enriquece o conflito com quem está segurando a peça.
   *
   * Sem isso a mensagem seria "faltam 2 mesas" e a operação teria que abrir a
   * agenda para descobrir por quê. Com o nome da outra festa, dá para decidir
   * na hora: remarcar, alugar de parceiro ou avisar a cliente.
   */
  private async detalhar(
    conflitos: { productId: string; nome: string; estoque: number; jaComprometido: number; pedido: number }[],
    data: Date,
    ignorarOrderId?: string,
  ): Promise<ConflitoDetalhado[]> {
    const inicio = new Date(data);
    inicio.setUTCHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 1);

    const idsEmFalta = new Set(conflitos.map((c) => c.productId));

    const reservas = await prisma.reservation.findMany({
      where: {
        eventDate: { gte: inicio, lt: fim },
        status: { in: [...RESERVAS_ATIVAS] },
        // Na edição, a própria reserva não é "outra festa segurando a peça".
        ...(ignorarOrderId ? { orderId: { not: ignorarOrderId } } : {}),
      },
      select: {
        id: true,
        status: true,
        order: {
          select: {
            kit: { select: { products: { select: { productId: true } } } },
            items: { select: { productId: true } },
            event: { select: { user: { select: { name: true } } } },
          },
        },
      },
    });

    return conflitos.map((c) => ({
      productId: c.productId,
      produto: c.nome,
      estoqueTotal: c.estoque,
      jaComprometido: c.jaComprometido,
      necessario: c.pedido,
      disponivel: Math.max(0, c.estoque - c.jaComprometido),
      reservasEmChoque: reservas
        .filter((r) =>
          [...(r.order.kit?.products ?? []), ...r.order.items].some((i) =>
            idsEmFalta.has(i.productId) && i.productId === c.productId,
          ),
        )
        .map((r) => ({ id: r.id, cliente: r.order.event.user.name, status: r.status })),
    }));
  }
}
