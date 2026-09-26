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
  formasDoTelefone,
  normalizarTelefone,
  totalDaVendaManual,
  type EditarReservaInput,
  type ManualReservationInput,
} from "@festae/shared";
import { AvailabilityService } from "../availability/availability.service";
import { itensDoKitDoPedido } from "../availability/item-commitment";
import {
  registrarConflitosDeAcervo,
  type ContextoDoConflito,
} from "../availability/registro-de-conflitos";

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
   * pagamento e reserva — e passa pela mesma barreira: o material está livre
   * nesta data? Uma reserva de WhatsApp que pulasse essa conferência seria
   * pior que não existir: o calendário continuaria oferecendo a peça, e a
   * operação confiaria num painel que mente.
   *
   * Grava tudo numa transação só. Metade de uma reserva — festa criada,
   * reserva não — é o tipo de registro que ninguém encontra e que some da
   * agenda justamente por não ter reserva.
   */
  async criar(
    input: ManualReservationInput,
    criadoPorId: string,
    /**
     * De onde a venda veio, para o registro de conflito de acervo saber
     * distinguir uma venda de balcão de uma proposta convertida.
     */
    contexto: { tipo: ContextoDoConflito; referencia?: string } = { tipo: "VENDA_MANUAL" },
    /**
     * A composição do kit já combinada com a cliente — a de uma proposta
     * enviada. Quando vem, ela é o kit desta venda: é conferida no estoque e
     * congelada no pedido exatamente como está, e o cadastro atual do kit não
     * é lido para isso. Só a conversão de proposta passa este parâmetro; a
     * rota de venda manual não o expõe.
     */
    kitCombinado?: { itens: { productId: string; nome: string; quantity: number }[] },
  ) {
    // Já vem ancorada ao meio-dia UTC pelo schema. Reancorar aqui seria uma
    // segunda regra de fuso à espera de divergir da primeira.
    const dataDaFesta = input.evento.data;

    // A data em si não recusa mais nada: não existe teto de festas por dia.
    // A única barreira é o material — ver abaixo.
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

    if (input.produtos.kitId && !kit && !kitCombinado) {
      throw new BadRequestException("O kit escolhido não existe mais.");
    }

    // Com composição combinada, ela manda — inclusive peça que depois foi
    // desativada no catálogo: a obrigação com a cliente continua, e o estoque
    // decide se dá para cumprir. O que não dá é peça que não existe mais:
    // trocar por outra seria vender o que a cliente não aceitou.
    if (kitCombinado) {
      const ids = kitCombinado.itens.map((i) => i.productId);
      const existentes = new Set(
        (await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id),
      );
      const faltando = kitCombinado.itens.filter((i) => !existentes.has(i.productId));
      if (faltando.length > 0) {
        throw new ConflictException(
          `A proposta foi aceita com peças que não existem mais no catálogo: ${faltando.map((i) => i.nome).join(", ")}. ` +
            "A reserva não foi criada. Combine a troca com a cliente e envie uma versão nova da proposta.",
        );
      }
    }

    const itensDoKit = kitCombinado
      ? kitCombinado.itens.map((i) => ({ productId: i.productId, quantity: i.quantity }))
      : (kit?.products ?? []);

    const pedido = {
      itensDoKit,
      itensAvulsos: input.produtos.itens,
    };

    const conflitos = await this.availability.conflitosDeItens(dataDaFesta, pedido);
    if (conflitos.length > 0) {
      await registrarConflitosDeAcervo(conflitos, dataDaFesta, contexto.tipo, contexto.referencia);
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
          nomeDoFestejado: input.evento.nomeDoFestejado || undefined,
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
          ajusteComercial: input.financeiro.ajusteComercial ?? 0,
          total,
          notes: input.evento.observacoes || undefined,
          // A composição que acabou de passar pela conferência de estoque,
          // congelada: é ela que esta festa compromete daqui em diante,
          // mesmo que o kit mude no cadastro. Vazio quando não há kit.
          kitCongeladoEm: new Date(),
          kitItems: {
            create: itensDoKit.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
          },
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
            kitId: true,
            ajusteComercial: true,
            kitCongeladoEm: true,
            kitItems: { select: { productId: true, quantity: true } },
            // Só para pedido anterior ao congelamento, lido como a edição
            // sempre leu (sem produto desativado).
            kit: {
              select: {
                products: {
                  where: { product: { active: true } },
                  select: { productId: true, quantity: true },
                },
              },
            },
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

    // O material do pedido novo está livre nesta data? É a única conferência
    // de data que existe — o limite de festas por dia não existe mais.
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

    // O kit só é relido do cadastro quando a própria edição troca de kit.
    // Mantido o mesmo kit, a reserva continua segurando o que foi vendido —
    // corrigir o endereço não pode, de carona, trazer para esta festa a
    // composição nova que alguém salvou no cadastro semana passada.
    const trocouDeKit = (input.produtos.kitId || null) !== (reserva.order.kitId ?? null);
    const itensDoKit = trocouDeKit ? (kit?.products ?? []) : itensDoKitDoPedido(reserva.order);

    const conflitos = await this.availability.conflitosDeItens(
      dataDaFesta,
      { itensDoKit, itensAvulsos: input.produtos.itens },
      reserva.order.id,
    );
    if (conflitos.length > 0) {
      await registrarConflitosDeAcervo(conflitos, dataDaFesta, "EDICAO_DE_RESERVA", id);
      throw new ConflictException({
        message: "Faltam itens para esta data.",
        conflitos: await this.detalhar(conflitos, dataDaFesta, reserva.order.id),
      });
    }

    // Edição que não fala do ajuste não está zerando a negociação: está
    // dizendo que não mexeu nela. Zerar por omissão mudaria o preço de uma
    // festa já vendida na primeira correção de endereço.
    const ajusteComercial =
      input.financeiro.ajusteComercial ?? Number(reserva.order.ajusteComercial);
    const total = totalDaVendaManual({ ...input.financeiro, ajusteComercial });
    const precos = await this.precosDosItens(input.produtos.itens.map((i) => i.productId));
    const cliente = reserva.order.event.user;
    const emailNovo = input.cliente.email?.trim() || null;
    const observacoes = input.evento.observacoes?.trim() || null;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: cliente.id },
        data: {
          name: input.cliente.nome.trim(),
          phone: normalizarTelefone(input.cliente.telefone),
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
          ...(input.evento.nomeDoFestejado !== undefined
            ? { nomeDoFestejado: input.evento.nomeDoFestejado || null }
            : {}),
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
          // Trocar de kit é a única edição que recongela: a festa passa a
          // segurar a composição do kit novo, conferida logo acima.
          ...(trocouDeKit
            ? {
                kitCongeladoEm: new Date(),
                kitItems: {
                  deleteMany: {},
                  create: (kit?.products ?? []).map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                  })),
                },
              }
            : {}),
          subtotalKit: input.financeiro.valorProdutos,
          subtotalExtras: 0,
          fulfillment: input.logistica.fulfillment,
          assembly: input.logistica.assembly,
          deliveryFee: input.financeiro.entrega,
          assemblyFee: input.financeiro.montagem,
          ajusteComercial,
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
    const telefone = normalizarTelefone(dados.telefone);

    const existente = email
      ? await prisma.user.findUnique({ where: { email } })
      : await this.clientePorTelefone(dados.telefone);

    if (existente && !existente.deletedAt) {
      // Telefone novo de cliente conhecido é atualização, não conflito. A
      // comparação é pelos dígitos: o mesmo número com outra máscara não é
      // telefone novo, e reescrevê-lo só mudaria a formatação.
      if (normalizarTelefone(existente.phone) !== telefone) {
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

  /**
   * A cliente que já tem este número, com qualquer máscara.
   *
   * Os telefones antigos não foram reescritos, então a comparação é feita
   * pelos dígitos do que está gravado. Se houver mais de um cadastro com o
   * mesmo número — duplicata de antes desta regra —, vale o mais antigo, e
   * nenhum é fundido: juntar fichas é decisão de gente, não de busca.
   */
  private async clientePorTelefone(telefone: string) {
    const formas = formasDoTelefone(telefone);
    if (formas.length === 0) return null;

    const [achado] = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
       WHERE "deletedAt" IS NULL
         AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ANY(${formas})
       ORDER BY "createdAt" ASC
       LIMIT 1`;
    return achado ? prisma.user.findUnique({ where: { id: achado.id } }) : null;
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
            kitCongeladoEm: true,
            kitItems: { select: { productId: true, quantity: true } },
            kit: { select: { products: { select: { productId: true, quantity: true } } } },
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
          [...itensDoKitDoPedido(r.order), ...r.order.items].some((i) =>
            idsEmFalta.has(i.productId) && i.productId === c.productId,
          ),
        )
        .map((r) => ({ id: r.id, cliente: r.order.event.user.name, status: r.status })),
    }));
  }
}
