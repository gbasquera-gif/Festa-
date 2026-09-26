import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import {
  calcularSinal,
  composicaoParaExibir,
  lerComposicaoCongelada,
  montarComposicaoDoKit,
  fromCentsInt,
  toCentsInt,
  exigeNovaVersao,
  normalizarTelefone,
  podeSerAprovada,
  situacaoDoOrcamento,
  type CategoriaDaPerda,
  type OrcamentoInput,
  type SaleChannel,
  type StatusDoOrcamento,
} from "@festae/shared";
import { ManualReservationService } from "../reservations/manual-reservation.service";
import { ReservationsService } from "../reservations/reservations.service";
import { dadosDaDuplicata } from "./duplicacao";
import { kitDaConversao } from "./kit-da-conversao";
import {
  dadosDasOpcoes,
  espelhoDaOpcao,
  opcaoDeReferencia,
  opcaoEscolhida,
  opcaoParaConverter,
  type DadosDaOpcao,
} from "./opcoes";

type Tx = Prisma.TransactionClient;

/** As opções de uma proposta, na ordem, com as linhas de cada uma. */
const OPCOES_COM_ITENS = {
  orderBy: { ordem: "asc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
} as const;

/** O mesmo, com o que a tela precisa do kit de cada opção. */
const OPCOES_PARA_MOSTRAR = {
  orderBy: { ordem: "asc" },
  include: {
    itens: { orderBy: { ordem: "asc" } },
    kit: { select: { id: true, name: true, coverImageUrl: true, images: true } },
  },
} as const;

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
  constructor(
    private readonly reservas: ManualReservationService,
    private readonly pagamentos: ReservationsService,
  ) {}

  async listar() {
    const agora = new Date();
    const orcamentos = await prisma.orcamento.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        theme: { select: { name: true } },
        opcoes: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, _count: { select: { itens: true } } } },
      },
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
        theme: { select: { id: true, name: true, coverImageUrl: true } },
        opcoes: OPCOES_PARA_MOSTRAR,
        versoes: { orderBy: { versao: "desc" }, select: { versao: true, total: true, criadoEm: true } },
      },
    });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    const conteudo = await this.conteudo();
    const percentual = this.percentualDoSinal(o, conteudo);

    const opcoes = await Promise.all(
      o.opcoes.map(async (op) => ({
        id: op.id,
        ordem: op.ordem,
        nome: op.nome,
        descricao: op.descricao,
        kitId: op.kitId,
        kit: op.kit ? { id: op.kit.id, nome: op.kit.name } : null,
        imagens: op.imagens,
        aprovada: op.id === o.opcaoAprovadaId,
        composicaoDoKit: composicaoParaExibir({
          status: o.status,
          congelada: op.composicaoDoKit,
          catalogo: op.kitId ? await this.composicaoDoCatalogo(op.kitId) : null,
        }),
        valores: this.valoresDe(op),
        sinal: calcularSinal(num(op.total), percentual),
        linhas: op.itens.map((i) => this.linhaDetalhada(i)),
      })),
    );

    // O que o detalhe mostra "da proposta" é o da opção de referência: a
    // aprovada, ou a primeira enquanto nada foi aprovado.
    const referencia = opcaoDeReferencia(o);
    const daReferencia = opcoes.find((x) => x.id === referencia?.id) ?? null;
    return {
      ...this.detalhar(o, new Date()),
      linhas: daReferencia?.linhas ?? [],
      composicaoDoKit: daReferencia?.composicaoDoKit ?? null,
      opcoes,
      sinal: await this.sinalDa(o, conteudo),
    };
  }

  /**
   * Cria a proposta com as suas opções.
   *
   * Uma transação: a proposta, cada opção e as linhas de cada opção são
   * gravadas juntas ou não são gravadas. As colunas de valor da proposta
   * espelham a primeira opção (ver `opcoes.ts`).
   */
  async criar(input: OrcamentoInput, criadoPorId: string) {
    const opcoes = dadosDasOpcoes(input.opcoes);
    const validoAte = new Date(Date.now() + input.proposta.validadeEmDias * 86_400_000);

    const criado = await prisma.$transaction(async (tx) => {
      const orcamento = await tx.orcamento.create({
      data: {
        token: novoToken(),
        userId: input.cliente.userId || undefined,
        clienteNome: input.cliente.nome.trim(),
        clienteTelefone: normalizarTelefone(input.cliente.telefone),
        clienteEmail: input.cliente.email?.trim() || undefined,
        nomeDoFestejado: input.festa.nomeDoFestejado?.trim() || undefined,
        festaEm: input.festa.data,
        tipoDeFesta: input.festa.tipo as never,
        cidade: input.festa.cidade || "Chapecó",
        local: input.festa.local || undefined,
        convidados: input.festa.convidados,
        observacoes: input.festa.observacoes || undefined,
        validoAte,
        themeId: input.proposta.themeId || undefined,
        percentualDoSinal: input.proposta.percentualDoSinal ?? null,
        mostrarValoresIndividuais: input.proposta.mostrarValoresIndividuais ?? false,
        canal: input.proposta.canal ?? null,
        ...espelhoDaOpcao(opcoes[0]),
        criadoPorId,
      },
      });
      await this.gravarOpcoes(tx, orcamento.id, opcoes);
      return orcamento;
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
    const atual = await prisma.orcamento.findUnique({
      where: { id },
      include: { itens: true, opcoes: OPCOES_COM_ITENS },
    });
    if (!atual) throw new NotFoundException("Orçamento não encontrado.");
    if (atual.status === "APROVADO") {
      throw new ConflictException(
        "Esta proposta já foi aprovada pela cliente. Crie uma nova proposta em vez de alterar o que ela aceitou.",
      );
    }

    const precisaVersionar = exigeNovaVersao(atual.status as StatusDoOrcamento);
    const opcoes = dadosDasOpcoes(input.opcoes);
    const validoAte = new Date(Date.now() + input.proposta.validadeEmDias * 86_400_000);

    await prisma.$transaction(async (tx) => {
      if (precisaVersionar) {
        // A fotografia leva a proposta inteira: todas as opções, com kit,
        // composição congelada, imagens, linhas e valores de cada uma.
        await tx.orcamentoVersao.create({
          data: {
            orcamentoId: atual.id,
            versao: atual.versao,
            total: atual.total,
            conteudo: JSON.parse(JSON.stringify(atual)),
          },
        });
      }

      // As opções são regravadas inteiras. Rascunho e proposta enviada podem
      // ser editados; aprovada, não (acima) — então nenhuma opção aprovada
      // é apagada aqui.
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: atual.id } });
      await tx.orcamentoOpcao.deleteMany({ where: { orcamentoId: atual.id } });
      await tx.orcamento.update({
        where: { id: atual.id },
        data: {
          clienteNome: input.cliente.nome.trim(),
          clienteTelefone: normalizarTelefone(input.cliente.telefone),
          clienteEmail: input.cliente.email?.trim() || null,
          userId: input.cliente.userId || null,
          nomeDoFestejado: input.festa.nomeDoFestejado?.trim() || null,
          festaEm: input.festa.data,
          tipoDeFesta: input.festa.tipo as never,
          cidade: input.festa.cidade || "Chapecó",
          local: input.festa.local || null,
          convidados: input.festa.convidados ?? null,
          observacoes: input.festa.observacoes || null,
          validoAte,
          themeId: input.proposta.themeId || null,
          percentualDoSinal: input.proposta.percentualDoSinal ?? null,
          mostrarValoresIndividuais: input.proposta.mostrarValoresIndividuais ?? false,
          canal: input.proposta.canal ?? null,
          ...espelhoDaOpcao(opcoes[0]),
          versao: precisaVersionar ? atual.versao + 1 : atual.versao,
          status: "RASCUNHO",
          // De volta a rascunho, a composição volta a ser a do catálogo; o
          // próximo envio congela a desta versão. A da versão anterior fica
          // na fotografia de `OrcamentoVersao`.
          composicaoDoKit: Prisma.DbNull,
          enviadoEm: precisaVersionar ? null : atual.enviadoEm,
        },
      });
      await this.gravarOpcoes(tx, atual.id, opcoes);
    });

    return { versionada: precisaVersionar };
  }

  /** Marca como enviada e devolve o link. O envio em si é a Maria Luiza. */
  async enviar(id: string) {
    const o = await prisma.orcamento.findUnique({ where: { id }, include: { opcoes: OPCOES_COM_ITENS } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status === "APROVADO") throw new ConflictException("Esta proposta já foi aprovada.");
    if (o.opcoes.length === 0) {
      throw new BadRequestException("A proposta precisa de ao menos uma opção de festa antes de ser enviada.");
    }
    const vazia = o.opcoes.find((op) => op.itens.length === 0);
    if (vazia) {
      throw new BadRequestException(
        `A opção “${vazia.nome}” precisa de ao menos um item antes de a proposta ser enviada.`,
      );
    }

    const agora = new Date();
    // O primeiro envio só é gravado quando dá para provar que é o primeiro:
    // proposta na versão 1 e sem envio registrado. Proposta antiga que já
    // tinha saído (e foi editada, ou está sendo reenviada) fica sem ele — a
    // data verdadeira não existe em lugar nenhum, e a de hoje mentiria.
    const ePrimeiroEnvio = o.primeiroEnvioEm === null && o.enviadoEm === null && o.versao === 1;

    // A composição do kit de cada opção congela no primeiro envio desta
    // versão e não muda mais: reenviar o mesmo link não pode trocar o que a
    // cliente já viu. Mudar a proposta é editar, e editar gera versão nova.
    const congelar: { id: string; composicao: object }[] = [];
    for (const op of o.opcoes) {
      if (!op.kitId || lerComposicaoCongelada(op.composicaoDoKit) !== null) continue;
      const composicao = await this.composicaoDoCatalogo(op.kitId);
      if (composicao) congelar.push({ id: op.id, composicao });
    }
    // A coluna antiga da proposta acompanha a opção de referência.
    const referencia = opcaoDeReferencia(o);
    const daReferencia =
      congelar.find((c) => c.id === referencia?.id)?.composicao ??
      (lerComposicaoCongelada(referencia?.composicaoDoKit) ? referencia?.composicaoDoKit : null);

    await prisma.$transaction(async (tx) => {
      for (const c of congelar) {
        await tx.orcamentoOpcao.update({ where: { id: c.id }, data: { composicaoDoKit: c.composicao } });
      }
      await tx.orcamento.update({
        where: { id },
        data: {
          status: "ENVIADO",
          enviadoEm: agora,
          ...(ePrimeiroEnvio ? { primeiroEnvioEm: agora } : {}),
          ...(daReferencia ? { composicaoDoKit: daReferencia as object } : {}),
          recusadoEm: null,
          motivoDaPerda: null,
          categoriaDaPerda: null,
        },
      });
    });
    return { token: o.token };
  }

  async recusar(id: string, categoria: CategoriaDaPerda, motivo?: string) {
    const o = await prisma.orcamento.findUnique({ where: { id } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status === "APROVADO") {
      throw new ConflictException("Esta proposta já foi aprovada — não dá para marcá-la como perdida.");
    }
    await prisma.orcamento.update({
      where: { id },
      data: {
        status: "RECUSADO",
        recusadoEm: new Date(),
        categoriaDaPerda: categoria,
        motivoDaPerda: motivo?.trim() || null,
      },
    });
    return { ok: true };
  }

  /**
   * Apaga uma proposta de vez.
   *
   * A linha é a reserva, não o aceite: o que nunca virou venda pode ser
   * apagado — rascunho, proposta enviada sem resposta e até proposta aprovada
   * que ainda não foi convertida. O que virou reserva fica para sempre, com
   * pedido e recebimentos junto.
   *
   * Proposta recusada também fica: o motivo da perda é o histórico que diz
   * onde a Festaê deixa de vender, e isso não é lixo — é a estatística que
   * ainda não existe.
   *
   * Apagar uma proposta aprovada apaga o aceite da cliente, então a tela
   * mostra quem aprovou e quando antes de confirmar, e só ADMIN chega aqui.
   *
   * A exclusão leva junto apenas o que é exclusivo dela — itens e versões,
   * por cascata do próprio banco. Reserva, pedido, pagamento, cliente e
   * catálogo são apontados pela proposta, não o contrário: apagar a proposta
   * não os toca. As imagens no bucket também ficam: a mesma URL pode ter sido
   * escolhida do catálogo e estar em uso em outra proposta.
   */
  async excluir(id: string) {
    const o = await prisma.orcamento.findUnique({
      where: { id },
      select: { id: true, numero: true, status: true, reservationId: true },
    });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");

    const impedimentos: string[] = [];
    if (o.reservationId) {
      impedimentos.push("ela já virou reserva, com pedido e recebimentos ligados a ela");
    }
    if (o.status === "RECUSADO") {
      impedimentos.push("ela está registrada como perdida, e esse registro é o histórico da venda");
    }

    if (impedimentos.length > 0) {
      throw new ConflictException(
        `A proposta nº ${o.numero} não pode ser excluída: ${impedimentos.join(", ")}. ` +
          "Excluir apagaria esse histórico. Para desfazer a venda, cancele a reserva na tela de Reservas.",
      );
    }

    // A condição vai no próprio DELETE, e não só na leitura acima: entre uma
    // coisa e outra a proposta pode ter sido convertida em reserva, e uma
    // venda não pode perder para um clique que já estava na tela.
    const { count } = await prisma.orcamento.deleteMany({
      where: {
        id,
        status: { in: ["RASCUNHO", "ENVIADO", "APROVADO"] },
        reservationId: null,
      },
    });
    if (count === 0) {
      throw new ConflictException(
        "A proposta mudou de situação enquanto esta tela estava aberta e não foi excluída. " +
          "Recarregue para ver como ela está agora.",
      );
    }

    return { excluido: true, numero: o.numero };
  }

  /** O documento que a cliente abre. Só o que a proposta precisa mostrar. */
  async propostaPublica(token: string) {
    const o = await prisma.orcamento.findUnique({
      where: { token },
      include: {
        theme: { select: { name: true, coverImageUrl: true } },
        opcoes: OPCOES_PARA_MOSTRAR,
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
    const percentual = this.percentualDoSinal(o, conteudo);
    const mostrar = o.mostrarValoresIndividuais;

    const opcoes = o.opcoes.map((op) => {
      const congelada = lerComposicaoCongelada(op.composicaoDoKit);
      return {
        id: op.id,
        nome: op.nome,
        descricao: op.descricao,
        // Só a composição congelada: é o que a cliente recebeu. Opção que
        // saiu antes do congelamento existir não mostra composição nenhuma.
        kit: congelada?.kitNome ?? op.kit?.name ?? null,
        composicaoDoKit: congelada?.itens ?? null,
        imagens: this.imagensDa({ imagens: op.imagens, kit: op.kit, theme: o.theme }),
        itens: op.itens.map((i) => ({
          tipo: i.tipo,
          descricao: i.descricao,
          quantidade: i.quantidade,
          // Sem valor quando a proposta não mostra preço por linha. Esconder
          // no CSS deixaria o número no HTML, ao alcance de quem abre o código
          // da página — e o ponto não é estético, é comercial.
          valorUnitario: mostrar ? num(i.valorUnitario) : null,
          total: mostrar ? num(i.total) : null,
          imagemUrl: i.imagemUrl,
        })),
        valores: {
          subtotal: mostrar ? num(op.subtotal) : null,
          desconto: num(op.desconto),
          entrega: mostrar ? num(op.entrega) : null,
          montagem: mostrar ? num(op.montagem) : null,
          total: num(op.total),
        },
        /** O sinal se a cliente escolher esta opção. */
        sinal: calcularSinal(num(op.total), percentual),
      };
    });

    // O topo do documento fala da opção de referência: a aprovada, ou a
    // primeira. É o que a página mostrava antes das opções, e é o que uma
    // proposta de uma opção só continua mostrando.
    const referencia = opcaoDeReferencia(o);
    const daReferencia = opcoes.find((x) => x.id === referencia?.id) ?? opcoes[0] ?? null;

    return {
      numero: o.numero,
      versao: o.versao,
      situacao,
      podeAprovar: podeSerAprovada(o.status as StatusDoOrcamento, o.validoAte, agora),
      cliente: { nome: o.clienteNome },
      /** Para quem é a festa: o festejado, ou a cliente quando ele não foi informado. */
      festaPara: o.nomeDoFestejado?.trim() || o.clienteNome,
      festa: {
        em: o.festaEm.toISOString(),
        tipo: o.tipoDeFesta,
        cidade: o.cidade,
        local: o.local,
        convidados: o.convidados,
      },
      tema: o.theme?.name ?? null,
      opcoes,
      opcaoAprovadaId: o.status === "APROVADO" ? (o.opcaoAprovadaId ?? (opcoes.length === 1 ? opcoes[0].id : null)) : null,
      opcaoAprovadaNome: o.opcaoAprovadaNome,
      kit: daReferencia?.kit ?? null,
      composicaoDoKit: daReferencia?.composicaoDoKit ?? null,
      imagens: daReferencia?.imagens ?? [],
      observacoes: o.observacoes,
      mostrarValores: mostrar,
      itens: daReferencia?.itens ?? [],
      valores: daReferencia?.valores ?? { subtotal: null, desconto: 0, entrega: null, montagem: null, total: 0 },
      validoAte: o.validoAte.toISOString(),
      aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
      aprovadoPorNome: o.aprovadoPorNome,
      valorAprovado: o.valorAprovado === null ? null : num(o.valorAprovado),
      sinal: await this.sinalDa(o, conteudo),
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
    // `total` é o espelho da opção de referência: depois do aceite, a opção
    // escolhida. O sinal nunca soma opções.
    const conta = calcularSinal(num(o.total), this.percentualDoSinal(o, conteudo));

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

  /** O percentual do sinal: o da proposta, ou o padrão do painel. */
  private percentualDoSinal(
    o: { percentualDoSinal: unknown },
    conteudo: Record<string, { titulo: string | null; texto: string | null }>,
  ): number | null {
    const padrao = Number(conteudo.sinal_percentual?.texto);
    return o.percentualDoSinal !== null && o.percentualDoSinal !== undefined
      ? num(o.percentualDoSinal)
      : Number.isFinite(padrao) && conteudo.sinal_percentual?.texto
        ? padrao
        : null;
  }

  /**
   * O aceite da cliente.
   *
   * Não cria reserva. Aprovar registra a manifestação; transformar em venda é
   * um passo separado no painel, porque é ele que confere disponibilidade —
   * e disponibilidade não pode ser decidida por um clique de quem não vê o
   * estoque. Entre a proposta e o aceite, o balão pode ter acabado.
   */
  async aprovarPorToken(token: string, nome: string, opcaoId?: string, ip?: string, agente?: string) {
    const o = await prisma.orcamento.findUnique({
      where: { token },
      include: { opcoes: { orderBy: { ordem: "asc" } } },
    });
    if (!o || o.status === "RASCUNHO") throw new NotFoundException("Proposta não encontrada.");

    const agora = new Date();
    if (o.status === "APROVADO") {
      return {
        jaAprovada: true,
        aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
        opcaoAprovadaId: o.opcaoAprovadaId,
        opcaoAprovadaNome: o.opcaoAprovadaNome,
      };
    }
    if (!podeSerAprovada(o.status as StatusDoOrcamento, o.validoAte, agora)) {
      throw new ConflictException(
        "Esta proposta não está mais disponível para aprovação. Fale com a Festaê para receber uma atualizada.",
      );
    }

    // A opção tem de ser desta proposta, e explícita quando há mais de uma.
    const escolhida = opcaoEscolhida(o.opcoes, opcaoId);

    // O aceite registra a opção, o nome dela naquele momento e o valor dela.
    // As colunas de resumo passam a espelhar a escolhida, e é assim que as
    // outras opções ficam fora de todo número que lê a proposta.
    //
    // A condição de status vai no próprio UPDATE: dois cliques (ou duas
    // abas) não aprovam duas opções.
    const { count } = await prisma.orcamento.updateMany({
      where: { id: o.id, status: "ENVIADO", versao: o.versao },
      data: {
        status: "APROVADO",
        aprovadoEm: agora,
        aprovadoPorNome: nome.trim(),
        aprovadoPorIp: ip?.slice(0, 60),
        aprovadoPorAgente: agente?.slice(0, 300),
        valorAprovado: escolhida.total,
        opcaoAprovadaId: escolhida.id,
        opcaoAprovadaNome: escolhida.nome,
        ...espelhoDaOpcao(escolhida),
        composicaoDoKit: lerComposicaoCongelada(escolhida.composicaoDoKit)
          ? (escolhida.composicaoDoKit as object)
          : Prisma.DbNull,
      },
    });
    if (count === 0) {
      const agoraEsta = await prisma.orcamento.findUnique({
        where: { id: o.id },
        select: { status: true, aprovadoEm: true, opcaoAprovadaId: true, opcaoAprovadaNome: true },
      });
      if (agoraEsta?.status === "APROVADO") {
        return {
          jaAprovada: true,
          aprovadoEm: agoraEsta.aprovadoEm?.toISOString() ?? null,
          opcaoAprovadaId: agoraEsta.opcaoAprovadaId,
          opcaoAprovadaNome: agoraEsta.opcaoAprovadaNome,
        };
      }
      throw new ConflictException(
        "Esta proposta mudou enquanto a página estava aberta. Recarregue para ver a versão atual.",
      );
    }

    return {
      jaAprovada: false,
      aprovadoEm: agora.toISOString(),
      opcaoAprovadaId: escolhida.id,
      opcaoAprovadaNome: escolhida.nome,
    };
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
   *
   * Só a opção aprovada vira reserva: os itens, o kit congelado, a entrega,
   * a montagem e os valores são dela. As outras opções não entram em nada.
   */
  async converter(id: string, criadoPorId: string, canalInformado?: SaleChannel) {
    const o = await prisma.orcamento.findUnique({ where: { id }, include: { opcoes: OPCOES_COM_ITENS } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");

    // A venda nasce com a origem declarada: a da proposta, ou a que quem
    // converte informa agora. Nunca uma escolhida pelo sistema — o canal
    // "padrão" que existia aqui gravava toda proposta convertida como
    // WhatsApp, e é exatamente o número que a Inteligência vai ler.
    const canal = o.canal ?? canalInformado ?? null;
    if (!canal) {
      throw new BadRequestException(
        "Informe por qual canal esta cliente chegou antes de converter a proposta.",
      );
    }
    if (o.status !== "APROVADO") {
      throw new ConflictException(
        "Só proposta aprovada vira reserva. Registre a aprovação da cliente antes de converter.",
      );
    }
    if (o.reservationId) {
      throw new ConflictException("Esta proposta já virou a reserva desta festa.");
    }

    const opcao = opcaoParaConverter(o);

    const itensDeCatalogo = opcao.itens
      .filter((i) => i.productId)
      .map((i) => ({ productId: i.productId as string, quantity: i.quantidade }));

    // Proposta enviada com a composição congelada: é ela que a cliente
    // aceitou, e é ela que vira reserva — conferida no estoque e congelada no
    // pedido. O kit atual do catálogo só é lido para proposta antiga, que
    // saiu antes de a composição ser registrada.
    const kitCombinado = kitDaConversao({
      numero: o.numero,
      kitId: opcao.kitId,
      composicaoDoKit: opcao.composicaoDoKit,
    });

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
          nomeDoFestejado: o.nomeDoFestejado ?? undefined,
        },
        produtos: { kitId: opcao.kitId ?? undefined, itens: itensDeCatalogo },
        logistica: {
          fulfillment: num(opcao.entrega) > 0 ? "DELIVERY" : "PICKUP",
          assembly: num(opcao.montagem) > 0,
          endereco: o.local ?? undefined,
          cidade: o.cidade,
        },
        financeiro: this.financeiroDaConversao({ ...opcao, valorAprovado: o.valorAprovado }),
        origem: canal,
        observacoesInternas:
          o.opcoes.length > 1
            ? `Nasceu da proposta nº ${o.numero} (versão ${o.versao}), opção “${opcao.nome}”.`
            : `Nasceu da proposta nº ${o.numero} (versão ${o.versao}).`,
      } as never,
      criadoPorId,
      { tipo: "CONVERSAO_DE_PROPOSTA", referencia: o.id },
      kitCombinado ?? undefined,
    );

    await prisma.orcamento.update({
      where: { id: o.id },
      data: {
        reservationId: (reserva as { id: string }).id,
        // Informado na conversão, o canal fica também na proposta: o funil e
        // a venda passam a contar a mesma origem.
        ...(o.canal ? {} : { canal }),
      },
    });

    return { reservaId: (reserva as { id: string }).id };
  }

  /**
   * A Festaê confirma que o sinal caiu.
   *
   * Um botão só, no lugar onde a proposta está sendo acompanhada, porque era
   * o que faltava: converter e depois procurar a reserva noutra tela para
   * digitar o valor à mão é onde se erra o número e onde se esquece de
   * lançar.
   *
   * O que ele NÃO faz: calcular dinheiro por conta própria. Converte pelo
   * mesmo caminho da venda manual (com a checagem de disponibilidade) e
   * registra o recebimento chamando o MESMO `registrarPagamento` da tela de
   * Reservas — com o lock `FOR UPDATE`, a recusa de sobrepagamento e o
   * encerramento de pendências que já existiam. Nenhuma segunda lógica
   * financeira nasce aqui.
   */
  async confirmarSinal(
    id: string,
    usuarioId: string,
    dados: { forma?: string; recebidoEm?: string; canal?: SaleChannel } = {},
  ) {
    const o = await prisma.orcamento.findUnique({ where: { id } });
    if (!o) throw new NotFoundException("Orçamento não encontrado.");
    if (o.status !== "APROVADO") {
      throw new ConflictException(
        "Só proposta aprovada tem sinal a confirmar. Registre a aprovação da cliente antes.",
      );
    }

    const conteudo = await this.conteudo();
    const sinal = await this.sinalDa(o, conteudo);
    if (toCentsInt(sinal.valor) <= 0) {
      throw new BadRequestException(
        "O sinal desta proposta é zero. Registre o recebimento direto na reserva.",
      );
    }
    // Já coberto é já coberto: sem esta guarda, confirmar duas vezes criaria
    // um segundo DEPOSIT que o saldo do pedido ainda comporta — dinheiro que
    // ninguém recebeu entrando no caixa.
    if (sinal.pago) {
      throw new ConflictException(
        `O sinal desta proposta já está confirmado (${sinal.recebido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} recebidos). Lance qualquer valor a mais pela tela de Reservas.`,
      );
    }

    // Converter primeiro: é aqui que a disponibilidade é conferida, e é aqui
    // que a conversão pode ser recusada. Registrar o pagamento antes deixaria
    // dinheiro lançado numa venda que não existe.
    const reservaId =
      o.reservationId ?? (await this.converter(id, usuarioId, dados.canal)).reservaId;

    await this.pagamentos.registrarPagamento(
      reservaId,
      {
        tipo: "DEPOSIT",
        valor: sinal.valor,
        forma: dados.forma ?? "PIX",
        recebidoEm: dados.recebidoEm,
      },
      usuarioId,
    );

    return { reservaId, valor: sinal.valor, jaTinhaReserva: Boolean(o.reservationId) };
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

  /**
   * Uma proposta nova a partir de outra, para usar como modelo.
   *
   * Nasce RASCUNHO, com id, número e token novos, na versão 1, sem envio,
   * aceite, perda, reserva nem pagamento — de qualquer situação que a
   * original esteja, inclusive aprovada ou convertida. A original não é
   * tocada: é só lida.
   *
   * Uma transação: o banco grava a proposta, as opções e as linhas juntas
   * ou não grava nada.
   */
  async duplicar(id: string, criadoPorId: string) {
    const original = await prisma.orcamento.findUnique({ where: { id }, include: { opcoes: OPCOES_COM_ITENS } });
    if (!original) throw new NotFoundException("Orçamento não encontrado.");

    const { proposta, opcoes } = dadosDaDuplicata(original, { token: novoToken(), criadoPorId, agora: new Date() });
    if (opcoes.length === 0) {
      throw new ConflictException(`A proposta nº ${original.numero} não tem opção de festa para copiar.`);
    }
    const nova = await prisma.$transaction(async (tx) => {
      const criada = await tx.orcamento.create({
        data: { ...proposta, ...espelhoDaOpcao(opcoes[0]) } as never,
        select: { id: true, numero: true },
      });
      await this.gravarOpcoes(tx, criada.id, opcoes);
      return criada;
    });
    return { id: nova.id, numero: nova.numero, origem: original.numero };
  }

  // ---------------------------------------------------------------- privados

  /** A composição de hoje de um kit do catálogo; nula se o kit não existe mais. */
  private async composicaoDoCatalogo(kitId: string) {
    const kit = await prisma.kit.findUnique({
      where: { id: kitId },
      select: {
        id: true,
        name: true,
        products: { select: { quantity: true, product: { select: { id: true, name: true, active: true } } } },
      },
    });
    return kit ? montarComposicaoDoKit(kit) : null;
  }

  /**
   * O financeiro do pedido que nasce da proposta.
   *
   * Cada parcela vai como é: os produtos pelo que valem, a entrega e a
   * montagem pelo que foram cobradas, o desconto pelo desconto que existiu de
   * verdade na composição. A negociação do fechamento vai separada, no
   * ajuste, que pode ser para cima ou para baixo.
   *
   * Empurrar a diferença para dentro de `valorProdutos` ou de `desconto`
   * fecharia a mesma conta e estragaria o relatório: o primeiro inventaria
   * preço de acervo vendido, o segundo daria sinal a uma diferença que às
   * vezes é acréscimo.
   */
  private financeiroDaConversao(o: {
    subtotal: unknown;
    desconto: unknown;
    entrega: unknown;
    montagem: unknown;
    total: unknown;
    totalCalculado: unknown;
    valorAprovado: unknown;
  }) {
    // O aprovado manda. Editar proposta aprovada é recusado, então os dois
    // coincidem — mas se algum dia deixarem de coincidir, quem vale é o que
    // a cliente aceitou.
    const oficial =
      o.valorAprovado !== null && o.valorAprovado !== undefined ? num(o.valorAprovado) : num(o.total);

    return {
      valorProdutos: num(o.subtotal),
      entrega: num(o.entrega),
      montagem: num(o.montagem),
      desconto: num(o.desconto),
      ajusteComercial: fromCentsInt(toCentsInt(oficial) - toCentsInt(num(o.totalCalculado))),
      sinal: 0,
      formaPagamento: "PIX",
      statusPagamento: "PENDING",
    };
  }

  /**
   * Grava as opções de uma proposta e as linhas de cada uma.
   *
   * Cada linha leva os dois vínculos — a proposta e a opção —, para que o
   * que já lia as linhas pela proposta (e a exclusão em cascata) continue
   * valendo.
   */
  private async gravarOpcoes(tx: Tx, orcamentoId: string, opcoes: readonly DadosDaOpcao[]) {
    for (const { itens, ...opcao } of opcoes) {
      const criada = await tx.orcamentoOpcao.create({
        data: { ...opcao, orcamentoId } as never,
        select: { id: true },
      });
      if (itens.length > 0) {
        await tx.orcamentoItem.createMany({
          data: itens.map((i) => ({ ...i, orcamentoId, opcaoId: criada.id })) as never,
        });
      }
    }
  }

  /** Os valores de uma opção, como o painel mostra. */
  private valoresDe(o: {
    subtotal: unknown;
    desconto: unknown;
    entrega: unknown;
    montagem: unknown;
    total: unknown;
    totalCalculado: unknown;
    valorFinalManual: boolean;
  }) {
    return {
      subtotal: num(o.subtotal),
      desconto: num(o.desconto),
      entrega: num(o.entrega),
      montagem: num(o.montagem),
      /** O oficial: o que a cliente vê, aprova e paga. */
      total: num(o.total),
      /** A soma da composição, para o painel mostrar a negociação. */
      totalCalculado: num(o.totalCalculado),
      valorFinalManual: o.valorFinalManual === true,
    };
  }

  private linhaDetalhada(i: {
    id: string;
    tipo: string;
    productId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: unknown;
    total: unknown;
    imagemUrl: string | null;
  }) {
    return {
      id: i.id,
      tipo: i.tipo,
      productId: i.productId,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: num(i.valorUnitario),
      total: num(i.total),
      imagemUrl: i.imagemUrl,
    };
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
      festejado: o.nomeDoFestejado ?? null,
      /** Quantas opções de festa a proposta oferece. Três opções são uma proposta. */
      opcoes: Array.isArray(o.opcoes) ? o.opcoes.length : 1,
      /** As linhas da opção de referência (a aprovada, ou a primeira). */
      itens: this.linhasDaReferencia(o),
      total: num(o.total),
      validoAte: o.validoAte.toISOString(),
      criadoEm: o.createdAt.toISOString(),
      enviadoEm: o.enviadoEm?.toISOString() ?? null,
      aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
      motivoDaPerda: o.motivoDaPerda ?? null,
      categoriaDaPerda: o.categoriaDaPerda ?? null,
      canal: o.canal ?? null,
      primeiroEnvioEm: o.primeiroEnvioEm?.toISOString() ?? null,
      token: o.token,
      reservaId: o.reservationId ?? null,
    };
  }

  private linhasDaReferencia(o: any): number {
    const referencia = opcaoDeReferencia<any>({ opcaoAprovadaId: o.opcaoAprovadaId ?? null, opcoes: o.opcoes ?? [] });
    if (!referencia) return 0;
    return referencia._count?.itens ?? referencia.itens?.length ?? 0;
  }

  private detalhar(o: any, agora: Date) {
    return {
      ...this.resumir(o, agora),
      clienteId: o.userId,
      clienteEmail: o.clienteEmail,
      nomeDoFestejado: o.nomeDoFestejado ?? null,
      opcaoAprovadaId: o.opcaoAprovadaId ?? null,
      opcaoAprovadaNome: o.opcaoAprovadaNome ?? null,
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
      valores: this.valoresDe(o),
      versoes: (o.versoes ?? []).map((v: any) => ({
        versao: v.versao,
        total: num(v.total),
        criadoEm: v.criadoEm.toISOString(),
      })),
    };
  }
}
