import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  calcularOrcamento,
  calcularSinal,
  toCentsInt,
  exigeNovaVersao,
  podeSerAprovada,
  situacaoDoOrcamento,
  totalDaLinha,
  type LinhaDoOrcamento,
  type OrcamentoInput,
  type StatusDoOrcamento,
} from "@festae/shared";
import { ManualReservationService } from "../reservations/manual-reservation.service";

/** Decimal do Prisma vira número uma vez, aqui. */
const num = (v: unknown) => Number(v);

/**
 * O token do link público.
 *
 * 32 bytes aleatórios em base64url. É a única barreira entre a proposta e
 * quem tiver o endereço, então precisa ser longo e imprevisível — id
 * sequencial deixaria qualquer pessoa passear pelas propostas das outras
 * clientes trocando um número na URL.
 */
function novoToken(): string {
  return randomBytes(32).toString("base64url");
}

@Injectable()
export class OrcamentosService {
  constructor(private readonly reservas: ManualReservationService) {}

  async listar() {
    const agora = new Date();
    const orcamentos = await prisma.orcamento.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { itens: { orderBy: { ordem: "asc" } }, theme: { select: { name: true } } },
    });

    return {
      apuradoEm: agora.toISOString(),
      orcamentos: orcamentos.map((o) => this.resumir(o, agora)),
    };
  }

  async obter(id: string) {
    const o = await prisma.orcamento.findUnique({
      where: { id },
      include: {
        itens: { orderBy: { ordem: "asc" } },
        theme: { select: { id: true, name: true, coverImageUrl: true } },
        kit: { select: { id: true, name: true, coverImageUrl: true, images: true } },
        versoes: { orderBy: { versao: "desc" }, select: { versao: true, total: true, criadoEm: true } },
      },
    });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    const conteudo = await this.conteudo();
    return { ...this.detalhar(o, new Date()), sinal: await this.sinalDa(o, conteudo) };
  }

  async criar(input: OrcamentoInput, criadoPorId: string) {
    const totais = this.totaisDe(input);
    const validoAte = new Date(Date.now() + input.proposta.validadeEmDias * 86_400_000);

    const criado = await prisma.orcamento.create({
      data: {
        token: novoToken(),
        userId: input.cliente.userId || undefined,
        clienteNome: input.cliente.nome.trim(),
        clienteTelefone: input.cliente.telefone.trim(),
        clienteEmail: input.cliente.email?.trim() || undefined,
        festaEm: input.festa.data,
        tipoDeFesta: input.festa.tipo as never,
        cidade: input.festa.cidade || "Chapecó",
        local: input.festa.local || undefined,
        convidados: input.festa.convidados,
        observacoes: input.festa.observacoes || undefined,
        validoAte,
        themeId: input.proposta.themeId || undefined,
        kitId: input.proposta.kitId || undefined,
        percentualDoSinal: input.proposta.percentualDoSinal ?? null,
        mostrarValoresIndividuais: input.proposta.mostrarValoresIndividuais ?? false,
        imagens: input.proposta.imagens,
        ...totais,
        criadoPorId,
        itens: { create: this.linhasParaBanco(input.itens) },
      },
      include: { itens: true },
    });

    return { id: criado.id, numero: criado.numero, token: criado.token };
  }

  /**
   * Edita a proposta.
   *
   * Rascunho se edita no lugar. O que já saiu para a cliente vira versão
   * nova: a anterior é fotografada em `OrcamentoVersao` e a proposta volta a
   * rascunho, esperando um envio explícito. Reescrever por cima apagaria o
   * valor que a cliente tem na mão — e é exatamente esse valor que ela vai
   * cobrar depois.
   */
  async atualizar(id: string, input: OrcamentoInput) {
    const atual = await prisma.orcamento.findUnique({ where: { id }, include: { itens: true } });
    if (!atual) throw new NotFoundException("Orçamento não encontrado.");
    if (atual.status === "APROVADO") {
      throw new ConflictException(
        "Esta proposta já foi aprovada pela cliente. Crie uma nova proposta em vez de alterar o que ela aceitou.",
      );
    }

    const precisaVersionar = exigeNovaVersao(atual.status as StatusDoOrcamento);
    const totais = this.totaisDe(input);
    const validoAte = new Date(Date.now() + input.proposta.validadeEmDias * 86_400_000);

    await prisma.$transaction(async (tx) => {
      if (precisaVersionar) {
        await tx.orcamentoVersao.create({
          data: {
            orcamentoId: atual.id,
            versao: atual.versao,
            total: atual.total,
            conteudo: JSON.parse(JSON.stringify(atual)),
          },
        });
      }

      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: atual.id } });
      await tx.orcamento.update({
        where: { id: atual.id },
        data: {
          clienteNome: input.cliente.nome.trim(),
          clienteTelefone: input.cliente.telefone.trim(),
          clienteEmail: input.cliente.email?.trim() || null,
          userId: input.cliente.userId || null,
          festaEm: input.festa.data,
          tipoDeFesta: input.festa.tipo as never,
          cidade: input.festa.cidade || "Chapecó",
          local: input.festa.local || null,
          convidados: input.festa.convidados ?? null,
          observacoes: input.festa.observacoes || null,
          validoAte,
          themeId: input.proposta.themeId || null,
          kitId: input.proposta.kitId || null,
          percentualDoSinal: input.proposta.percentualDoSinal ?? null,
          mostrarValoresIndividuais: input.proposta.mostrarValoresIndividuais ?? false,
          imagens: input.proposta.imagens,
          ...totais,
          versao: precisaVersionar ? atual.versao + 1 : atual.versao,
          status: "RASCUNHO",
          enviadoEm: precisaVersionar ? null : atual.enviadoEm,
          itens: { create: this.linhasParaBanco(input.itens) },
        },
      });
    });

    return { versionada: precisaVersionar };
  }

  /** Marca como enviada e devolve o link. O envio em si é a Maria Luiza. */
  async enviar(id: string) {
    const o = await prisma.orcamento.findUnique({ where: { id }, include: { itens: true } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status === "APROVADO") throw new ConflictException("Esta proposta já foi aprovada.");
    if (o.itens.length === 0) {
      throw new BadRequestException("A proposta precisa de ao menos um item antes de ser enviada.");
    }

    await prisma.orcamento.update({
      where: { id },
      data: { status: "ENVIADO", enviadoEm: new Date(), recusadoEm: null, motivoDaPerda: null },
    });
    return { token: o.token };
  }

  async recusar(id: string, motivo?: string) {
    const o = await prisma.orcamento.findUnique({ where: { id } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status === "APROVADO") {
      throw new ConflictException("Esta proposta já foi aprovada — não dá para marcá-la como perdida.");
    }
    await prisma.orcamento.update({
      where: { id },
      data: { status: "RECUSADO", recusadoEm: new Date(), motivoDaPerda: motivo?.trim() || null },
    });
    return { ok: true };
  }

  /** O documento que a cliente abre. Só o que a proposta precisa mostrar. */
  async propostaPublica(token: string) {
    const o = await prisma.orcamento.findUnique({
      where: { token },
      include: {
        itens: { orderBy: { ordem: "asc" } },
        theme: { select: { name: true, coverImageUrl: true } },
        kit: { select: { name: true, coverImageUrl: true, images: true } },
      },
    });
    if (!o || o.status === "RASCUNHO") {
      // Rascunho responde 404 e não 403: quem tem um link de rascunho não
      // precisa saber que ele existe e ainda não foi enviado.
      throw new NotFoundException("Proposta não encontrada.");
    }

    const agora = new Date();
    const situacao = situacaoDoOrcamento(o.status as StatusDoOrcamento, o.validoAte, agora);
    const conteudo = await this.conteudo();
    const sinal = await this.sinalDa(o, conteudo);

    return {
      numero: o.numero,
      versao: o.versao,
      situacao,
      podeAprovar: podeSerAprovada(o.status as StatusDoOrcamento, o.validoAte, agora),
      cliente: { nome: o.clienteNome },
      festa: {
        em: o.festaEm.toISOString(),
        tipo: o.tipoDeFesta,
        cidade: o.cidade,
        local: o.local,
        convidados: o.convidados,
      },
      tema: o.theme?.name ?? null,
      kit: o.kit?.name ?? null,
      imagens: this.imagensDa(o),
      observacoes: o.observacoes,
      mostrarValores: o.mostrarValoresIndividuais,
      itens: o.itens.map((i) => ({
        tipo: i.tipo,
        descricao: i.descricao,
        quantidade: i.quantidade,
        // Sem valor quando a proposta não mostra preço por linha. Esconder
        // no CSS deixaria o número no HTML, ao alcance de quem abre o código
        // da página — e o ponto não é estético, é comercial.
        valorUnitario: o.mostrarValoresIndividuais ? num(i.valorUnitario) : null,
        total: o.mostrarValoresIndividuais ? num(i.total) : null,
        imagemUrl: i.imagemUrl,
      })),
      valores: {
        subtotal: o.mostrarValoresIndividuais ? num(o.subtotal) : null,
        desconto: num(o.desconto),
        entrega: o.mostrarValoresIndividuais ? num(o.entrega) : null,
        montagem: o.mostrarValoresIndividuais ? num(o.montagem) : null,
        total: num(o.total),
      },
      validoAte: o.validoAte.toISOString(),
      aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
      aprovadoPorNome: o.aprovadoPorNome,
      sinal,
      conteudo,
    };
  }

  /**
   * O passo "reserve sua data".
   *
   * Aprovar não é pagar. A proposta aprovada fica aguardando o sinal, e é
   * isso que a tela diz — inventar um Payment PAID no aceite faria o
   * Financeiro contar como recebido um dinheiro que ninguém viu.
   *
   * `pago` não é um estado novo: é lido dos Payments da reserva que nasceu
   * desta proposta, pela mesma regra de sempre (só PAID conta). Enquanto não
   * há reserva, não há o que ter sido recebido.
   */
  private async sinalDa(
    o: { total: unknown; percentualDoSinal: unknown; reservationId: string | null },
    conteudo: Record<string, { titulo: string | null; texto: string | null }>,
  ) {
    const padrao = Number(conteudo.sinal_percentual?.texto);
    const percentual =
      o.percentualDoSinal !== null && o.percentualDoSinal !== undefined
        ? num(o.percentualDoSinal)
        : Number.isFinite(padrao) && conteudo.sinal_percentual?.texto
          ? padrao
          : null;

    const conta = calcularSinal(num(o.total), percentual);

    let recebido = 0;
    if (o.reservationId) {
      const reserva = await prisma.reservation.findUnique({
        where: { id: o.reservationId },
        select: { order: { select: { payments: { where: { status: "PAID" }, select: { amount: true } } } } },
      });
      recebido = (reserva?.order.payments ?? []).reduce((soma, p) => soma + num(p.amount), 0);
    }

    return {
      percentual: conta.percentual,
      valor: conta.valor,
      saldo: conta.saldo,
      recebido,
      pago: toCentsInt(recebido) >= toCentsInt(conta.valor) && toCentsInt(conta.valor) > 0,
      pix: {
        chave: conteudo.pix_chave?.texto ?? null,
        favorecido: conteudo.pix_favorecido?.texto ?? null,
        instrucao: conteudo.pix_instrucao?.texto ?? null,
      },
    };
  }

  /**
   * O aceite da cliente.
   *
   * Não cria reserva. Aprovar registra a manifestação; transformar em venda é
   * um passo separado no painel, porque é ele que confere disponibilidade —
   * e disponibilidade não pode ser decidida por um clique de quem não vê o
   * estoque. Entre a proposta e o aceite, o balão pode ter acabado.
   */
  async aprovarPorToken(token: string, nome: string, ip?: string, agente?: string) {
    const o = await prisma.orcamento.findUnique({ where: { token } });
    if (!o || o.status === "RASCUNHO") throw new NotFoundException("Proposta não encontrada.");

    const agora = new Date();
    if (o.status === "APROVADO") {
      return { jaAprovada: true, aprovadoEm: o.aprovadoEm?.toISOString() ?? null };
    }
    if (!podeSerAprovada(o.status as StatusDoOrcamento, o.validoAte, agora)) {
      throw new ConflictException(
        "Esta proposta não está mais disponível para aprovação. Fale com a Festaê para receber uma atualizada.",
      );
    }

    await prisma.orcamento.update({
      where: { id: o.id },
      data: {
        status: "APROVADO",
        aprovadoEm: agora,
        aprovadoPorNome: nome.trim(),
        aprovadoPorIp: ip?.slice(0, 60),
        aprovadoPorAgente: agente?.slice(0, 300),
        valorAprovado: o.total,
      },
    });

    return { jaAprovada: false, aprovadoEm: agora.toISOString() };
  }

  /**
   * Proposta aprovada vira venda — pelo caminho que já existe.
   *
   * Monta a entrada da venda manual e chama o mesmo serviço da reserva de
   * balcão. Não há segunda lógica de venda, e por isso a checagem de
   * disponibilidade item a item acontece igual: se faltar peça para a data, o
   * 409 sobe com os conflitos detalhados e nada é criado.
   *
   * Linhas manuais e serviços entram no valor e não no estoque: elas não têm
   * `productId`, então não viram item de pedido — o dinheiro é registrado,
   * o acervo não é inventado.
   */
  async converter(id: string, criadoPorId: string, origem = "WHATSAPP") {
    const o = await prisma.orcamento.findUnique({ where: { id }, include: { itens: true } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status !== "APROVADO") {
      throw new ConflictException(
        "Só proposta aprovada vira reserva. Registre a aprovação da cliente antes de converter.",
      );
    }
    if (o.reservationId) {
      throw new ConflictException("Esta proposta já virou a reserva desta festa.");
    }

    const itensDeCatalogo = o.itens
      .filter((i) => i.productId)
      .map((i) => ({ productId: i.productId as string, quantity: i.quantidade }));

    const reserva = await this.reservas.criar(
      {
        cliente: {
          nome: o.clienteNome,
          telefone: o.clienteTelefone,
          email: o.clienteEmail ?? undefined,
        },
        evento: {
          data: o.festaEm,
          tipo: o.tipoDeFesta as never,
          themeId: o.themeId ?? undefined,
          guestCount: o.convidados ?? undefined,
          observacoes: o.observacoes ?? undefined,
        },
        produtos: { kitId: o.kitId ?? undefined, itens: itensDeCatalogo },
        logistica: {
          fulfillment: num(o.entrega) > 0 ? "DELIVERY" : "PICKUP",
          assembly: num(o.montagem) > 0,
          endereco: o.local ?? undefined,
          cidade: o.cidade,
        },
        financeiro: {
          valorProdutos: num(o.subtotal),
          entrega: num(o.entrega),
          montagem: num(o.montagem),
          desconto: num(o.desconto),
          sinal: 0,
          formaPagamento: "PIX",
          statusPagamento: "PENDING",
        },
        origem,
        observacoesInternas: `Nasceu da proposta nº ${o.numero} (versão ${o.versao}).`,
      } as never,
      criadoPorId,
    );

    await prisma.orcamento.update({
      where: { id: o.id },
      data: { reservationId: (reserva as { id: string }).id },
    });

    return { reservaId: (reserva as { id: string }).id };
  }

  /** Conteúdo institucional da proposta, como um mapa simples. */
  async conteudo(): Promise<Record<string, { titulo: string | null; texto: string | null; imagemUrl: string | null }>> {
    const blocos = await prisma.conteudoInstitucional.findMany();
    const mapa: Record<string, { titulo: string | null; texto: string | null; imagemUrl: string | null }> = {};
    for (const b of blocos) {
      mapa[b.chave] = { titulo: b.titulo, texto: b.texto, imagemUrl: b.imagemUrl };
    }
    return mapa;
  }

  async salvarConteudo(
    blocos: { chave: string; titulo?: string; texto?: string; imagemUrl?: string }[],
  ) {
    for (const b of blocos) {
      await prisma.conteudoInstitucional.upsert({
        where: { chave: b.chave },
        create: {
          chave: b.chave,
          titulo: b.titulo || null,
          texto: b.texto || null,
          imagemUrl: b.imagemUrl || null,
        },
        update: {
          titulo: b.titulo || null,
          texto: b.texto || null,
          imagemUrl: b.imagemUrl || null,
        },
      });
    }
    return this.conteudo();
  }

  // ---------------------------------------------------------------- privados

  private totaisDe(input: OrcamentoInput) {
    const linhas: LinhaDoOrcamento[] = input.itens.map((i) => ({
      tipo: i.tipo,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    }));
    return calcularOrcamento(
      linhas,
      input.valores.desconto,
      input.valores.entrega,
      input.valores.montagem,
    );
  }

  private linhasParaBanco(itens: OrcamentoInput["itens"]) {
    return itens.map((i, ordem) => ({
      tipo: i.tipo as never,
      productId: i.productId || undefined,
      descricao: i.descricao.trim(),
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      total: totalDaLinha({
        tipo: i.tipo,
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitario: i.valorUnitario,
      }),
      imagemUrl: i.imagemUrl || undefined,
      ordem,
    }));
  }

  /** As imagens escolhidas; sem escolha, a capa do kit ou do tema. */
  private imagensDa(o: {
    imagens: string[];
    kit: { coverImageUrl: string | null; images: string[] } | null;
    theme: { coverImageUrl: string | null } | null;
  }): string[] {
    if (o.imagens.length > 0) return o.imagens;
    const candidatas = [o.kit?.coverImageUrl, ...(o.kit?.images ?? []), o.theme?.coverImageUrl];
    return candidatas.filter((u): u is string => Boolean(u)).slice(0, 4);
  }

  private resumir(o: Record<string, never> | any, agora: Date) {
    return {
      id: o.id,
      numero: o.numero,
      versao: o.versao,
      situacao: situacaoDoOrcamento(o.status as StatusDoOrcamento, o.validoAte, agora),
      status: o.status,
      cliente: o.clienteNome,
      telefone: o.clienteTelefone,
      festaEm: o.festaEm.toISOString().slice(0, 10),
      tipoDeFesta: o.tipoDeFesta,
      cidade: o.cidade,
      tema: o.theme?.name ?? null,
      itens: o.itens.length,
      total: num(o.total),
      validoAte: o.validoAte.toISOString(),
      criadoEm: o.createdAt.toISOString(),
      enviadoEm: o.enviadoEm?.toISOString() ?? null,
      aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
      motivoDaPerda: o.motivoDaPerda ?? null,
      token: o.token,
      reservaId: o.reservationId ?? null,
    };
  }

  private detalhar(o: any, agora: Date) {
    return {
      ...this.resumir(o, agora),
      clienteId: o.userId,
      clienteEmail: o.clienteEmail,
      // A evidência do aceite viaja junto com o detalhe: é ela que a tela
      // mostra para quem precisa saber quem aprovou, quando e por quanto.
      aprovadoPorNome: o.aprovadoPorNome,
      valorAprovado: o.valorAprovado === null ? null : num(o.valorAprovado),
      local: o.local,
      convidados: o.convidados,
      observacoes: o.observacoes,
      themeId: o.themeId,
      kitId: o.kitId,
      percentualDoSinal: o.percentualDoSinal === null ? null : num(o.percentualDoSinal),
      mostrarValoresIndividuais: o.mostrarValoresIndividuais,
      imagens: o.imagens,
      valores: {
        subtotal: num(o.subtotal),
        desconto: num(o.desconto),
        entrega: num(o.entrega),
        montagem: num(o.montagem),
        total: num(o.total),
      },
      linhas: o.itens.map((i: any) => ({
        id: i.id,
        tipo: i.tipo,
        productId: i.productId,
        descricao: i.descricao,
        quantidade: i.quantidade,
        valorUnitario: num(i.valorUnitario),
        total: num(i.total),
        imagemUrl: i.imagemUrl,
      })),
      versoes: (o.versoes ?? []).map((v: any) => ({
        versao: v.versao,
        total: num(v.total),
        criadoEm: v.criadoEm.toISOString(),
      })),
    };
  }
}
