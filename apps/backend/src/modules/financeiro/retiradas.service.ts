import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import {
  CATEGORIA_DA_RETIRADA_LABEL,
  FORMA_DA_RETIRADA_LABEL,
  diaEmChapeco,
  formatarReais,
  normalizarDataDaFesta,
  pareceProLabore,
  retiradasDoAno,
  retiradasDoMes,
  retiradasNoHistorico,
  retiradasPorSocio,
  type CategoriaDaRetirada,
  type EditarRetiradaInput,
  type EditarSocioInput,
  type EstornarRetiradaInput,
  type FiltroDeRetiradas,
  type FormaDaRetirada,
  type RegistrarRetiradaInput,
  type RetiradaApurada,
  type SocioInput,
} from "@festae/shared";

const SELECAO = {
  id: true,
  socioId: true,
  categoria: true,
  valor: true,
  retiradaEm: true,
  forma: true,
  descricao: true,
  registradoEm: true,
  estornadaEm: true,
  motivoDoEstorno: true,
  socio: { select: { nome: true } },
  registradoPor: { select: { name: true } },
  estornadaPor: { select: { name: true } },
} as const;

type Linha = Prisma.RetiradaDeSocioGetPayload<{ select: typeof SELECAO }>;

/** O dia que a pessoa digitou, gravado ao meio-dia UTC: o mesmo dia em qualquer leitura. */
function diaDaRetirada(dia: string): Date {
  return normalizarDataDaFesta(dia);
}

function paraTela(r: Linha) {
  return {
    id: r.id,
    socioId: r.socioId,
    socio: r.socio.nome,
    categoria: r.categoria as CategoriaDaRetirada,
    valor: Number(r.valor),
    retiradaEm: r.retiradaEm.toISOString().slice(0, 10),
    forma: r.forma as FormaDaRetirada,
    descricao: r.descricao,
    registradoPor: r.registradoPor?.name ?? null,
    registradoEm: r.registradoEm.toISOString(),
    estornada: r.estornadaEm !== null,
    estornadaEm: r.estornadaEm?.toISOString() ?? null,
    estornadaPor: r.estornadaPor?.name ?? null,
    motivoDoEstorno: r.motivoDoEstorno,
  };
}

function apurada(r: { socioId: string; categoria: string; valor: unknown; retiradaEm: Date; estornadaEm: Date | null }): RetiradaApurada {
  return {
    socioId: r.socioId,
    categoria: r.categoria as CategoriaDaRetirada,
    valor: Number(r.valor),
    retiradaEm: r.retiradaEm,
    estornada: r.estornadaEm !== null,
  };
}

/**
 * Retiradas dos sócios.
 *
 * Tabela própria, fora de `Gasto`: retirada não é despesa operacional e não
 * pode derrubar o Resultado Operacional. Os totais saem das funções de
 * `@festae/shared` (`retiradasDoMes`, `retiradasDoAno`...), as mesmas que o
 * fluxo de caixa do panorama usa — uma regra, um lugar.
 *
 * Nada se apaga. Editar exige justificativa e guarda o antes e o depois;
 * estornar tira dos totais e mantém no histórico, riscado, com motivo e autor.
 */
/** O intervalo [início, fim) em UTC de um recorte "AAAA" ou "AAAA-MM" — a mesma leitura de `mesDaDespesa`. */
function intervaloUtc(recorte: string): { gte: Date; lt: Date } {
  const [ano, mes] = recorte.split("-").map(Number);
  return mes
    ? { gte: new Date(Date.UTC(ano, mes - 1, 1)), lt: new Date(Date.UTC(ano, mes, 1)) }
    : { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) };
}

@Injectable()
export class RetiradasService {
  /**
   * Despesas pagas no recorte (ano ou mês) que parecem pró-labore pela
   * descrição ou categoria. Só leitura: alimenta o alerta da tela e a
   * conferência antes de lançar pró-labore como retirada.
   */
  async proLaboreEmDespesas(recorte: string) {
    const gastos = await prisma.gasto.findMany({
      where: { natureza: { in: ["CONSUMO", "CUSTEIO"] }, pagoEm: intervaloUtc(recorte) },
      select: { id: true, descricao: true, categoria: true, valor: true, pagoEm: true, natureza: true },
      orderBy: { pagoEm: "asc" },
    });
    const itens = gastos
      .filter((g) => pareceProLabore(g.descricao, g.categoria))
      .map((g) => ({
        id: g.id,
        descricao: g.descricao,
        natureza: g.natureza,
        valor: Number(g.valor),
        pagoEm: g.pagoEm!.toISOString().slice(0, 10),
      }));
    const total = itens.reduce((t, g) => t + Math.round(g.valor * 100), 0) / 100;
    return { recorte, quantidade: itens.length, total, itens };
  }

  /**
   * Pró-labore que talvez já esteja em Despesas no mesmo mês.
   *
   * Lançar nos dois lugares conta a mesma saída duas vezes (e uma delas já
   * está no Resultado Operacional). Sem a confirmação de quem lança, recusa
   * com a lista do que encontrou.
   */
  private async conferirDuplicidadeDoProLabore(categoria: CategoriaDaRetirada, dia: string, conferida?: boolean) {
    if (categoria !== "PRO_LABORE" || conferida) return;
    const achadas = await this.proLaboreEmDespesas(dia.slice(0, 7));
    if (achadas.quantidade === 0) return;
    throw new ConflictException({
      message:
        `Já há ${achadas.quantidade === 1 ? "uma despesa" : `${achadas.quantidade} despesas`} com cara de pró-labore neste mês ` +
        `(${formatarReais(achadas.total)}). Se for o mesmo pagamento, não lance aqui: ele já está em Despesas e no ` +
        "Resultado Operacional. Se for outro pagamento, confirme que conferiu e registre.",
      codigo: "PRO_LABORE_EM_DESPESAS",
      despesas: achadas.itens,
    });
  }

  // ------------------------------------------------------------ sócios

  async socios() {
    const lista = await prisma.socio.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
    return lista.map((s) => ({ id: s.id, nome: s.nome, ativo: s.ativo }));
  }

  async criarSocio(dados: SocioInput) {
    try {
      const s = await prisma.socio.create({ data: { nome: dados.nome.trim() } });
      return { id: s.id, nome: s.nome, ativo: s.ativo };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Já existe um sócio com esse nome.");
      }
      throw e;
    }
  }

  async editarSocio(id: string, dados: EditarSocioInput) {
    try {
      const s = await prisma.socio.update({
        where: { id },
        data: { ...(dados.nome !== undefined ? { nome: dados.nome.trim() } : {}), ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}) },
      });
      return { id: s.id, nome: s.nome, ativo: s.ativo };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw new NotFoundException("Sócio não encontrado.");
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Já existe um sócio com esse nome.");
      }
      throw e;
    }
  }

  // ------------------------------------------------------------ leitura

  /** Todas as retiradas no formato da apuração (estornadas marcadas). */
  async apuradas(): Promise<RetiradaApurada[]> {
    const linhas = await prisma.retiradaDeSocio.findMany({
      select: { socioId: true, categoria: true, valor: true, retiradaEm: true, estornadaEm: true },
    });
    return linhas.map(apurada);
  }

  /**
   * A lista filtrada e os indicadores da seção.
   *
   * Os indicadores seguem o ano e o mês do filtro global do Financeiro: o mês
   * escolhido, o ano inteiro escolhido e o histórico. A lista aceita, além
   * disso, período livre, sócio e categoria — e não muda os indicadores, que
   * respondem "quanto saiu", não "quanto há nesta busca" (esse fica no
   * rodapé da lista).
   */
  async listar(filtro: FiltroDeRetiradas, agora = new Date()) {
    const mesCorrente = diaEmChapeco(agora).slice(0, 7);
    const ano = filtro.ano ? Number(filtro.ano) : Number(mesCorrente.slice(0, 4));
    const mes = filtro.mes && filtro.mes !== "todos" ? `${ano}-${filtro.mes}` : null;

    const where: Prisma.RetiradaDeSocioWhereInput = {};
    if (filtro.de || filtro.ate) {
      where.retiradaEm = {
        ...(filtro.de ? { gte: new Date(`${filtro.de}T00:00:00.000Z`) } : {}),
        ...(filtro.ate ? { lte: new Date(`${filtro.ate}T23:59:59.999Z`) } : {}),
      };
    } else if (mes) {
      const inicio = new Date(`${mes}-01T00:00:00.000Z`);
      const fim = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1));
      where.retiradaEm = { gte: inicio, lt: fim };
    } else if (filtro.ano) {
      where.retiradaEm = { gte: new Date(`${ano}-01-01T00:00:00.000Z`), lt: new Date(`${ano + 1}-01-01T00:00:00.000Z`) };
    }
    if (filtro.socioId) where.socioId = filtro.socioId;
    if (filtro.categoria) where.categoria = filtro.categoria;
    if (filtro.incluirEstornadas === "nao") where.estornadaEm = null;

    const [linhas, todas, socios] = await Promise.all([
      prisma.retiradaDeSocio.findMany({ where, select: SELECAO, orderBy: [{ retiradaEm: "desc" }, { registradoEm: "desc" }] }),
      this.apuradas(),
      this.socios(),
    ]);

    const nomes = new Map(socios.map((s) => [s.id, s.nome]));
    const itens = linhas.map(paraTela);
    const doFiltro = retiradasNoHistorico(linhas.map(apurada));

    // Por sócio: mês, ano e histórico lado a lado, para cada um.
    const porSocioNoMes = new Map(mes ? retiradasPorSocio(todas.filter((r) => r.retiradaEm.toISOString().slice(0, 7) === mes)).map((x) => [x.socioId, x.totais]) : []);
    const porSocioNoAno = new Map(retiradasPorSocio(todas.filter((r) => r.retiradaEm.toISOString().startsWith(`${ano}-`))).map((x) => [x.socioId, x.totais]));
    const porSocioNoHistorico = retiradasPorSocio(todas);

    return {
      recorte: { ano, mes },
      indicadores: {
        mes: mes ? retiradasDoMes(todas, mes) : null,
        ano: retiradasDoAno(todas, ano),
        historico: retiradasNoHistorico(todas),
      },
      porSocio: porSocioNoHistorico.map((x) => ({
        socioId: x.socioId,
        socio: nomes.get(x.socioId) ?? "—",
        mes: porSocioNoMes.get(x.socioId)?.total ?? 0,
        ano: porSocioNoAno.get(x.socioId)?.total ?? 0,
        historico: x.totais.total,
        porCategoria: x.totais,
      })),
      itens,
      totalDoFiltro: doFiltro,
      /** Alerta só de leitura: pró-labore que parece estar em Despesas no ano. */
      proLaboreEmDespesas: await this.proLaboreEmDespesas(String(ano)),
    };
  }

  /** O histórico de alterações de uma retirada. */
  async historico(id: string) {
    const alteracoes = await prisma.alteracaoFinanceira.findMany({
      where: { entidade: "RETIRADA_DE_SOCIO", entidadeId: id },
      orderBy: { criadoEm: "desc" },
      include: { usuario: { select: { name: true } } },
    });
    return alteracoes.map((a) => ({
      acao: a.acao,
      antes: a.antes,
      depois: a.depois,
      justificativa: a.justificativa,
      usuario: a.usuario?.name ?? null,
      criadoEm: a.criadoEm.toISOString(),
    }));
  }

  // ------------------------------------------------------------ escrita

  /**
   * Registra uma retirada. A mesma `chave` devolve o que já foi gravado:
   * clique duplo e reenvio do navegador não lançam duas vezes.
   */
  async registrar(dados: RegistrarRetiradaInput, usuarioId: string) {
    const ja = await prisma.retiradaDeSocio.findUnique({ where: { chaveDeIdempotencia: dados.chave }, select: SELECAO });
    if (ja) return { ...paraTela(ja), repetida: true };

    const socio = await prisma.socio.findUnique({ where: { id: dados.socioId } });
    if (!socio) throw new BadRequestException("Sócio não encontrado.");
    if (!socio.ativo) throw new BadRequestException("Este sócio está inativo. Reative-o antes de lançar uma retirada.");
    const retiradaEm = this.conferirData(dados.retiradaEm);
    await this.conferirDuplicidadeDoProLabore(dados.categoria, dados.retiradaEm, dados.semDuplicidadeConferida);

    try {
      const criada = await prisma.retiradaDeSocio.create({
        data: {
          socioId: dados.socioId,
          categoria: dados.categoria,
          valor: dados.valor,
          retiradaEm,
          forma: dados.forma,
          descricao: dados.descricao?.trim() || null,
          registradoPorId: usuarioId,
          chaveDeIdempotencia: dados.chave,
        },
        select: SELECAO,
      });
      return { ...paraTela(criada), repetida: false };
    } catch (e) {
      // Dois envios iguais ao mesmo tempo: o segundo esbarra na chave única.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const doPrimeiro = await prisma.retiradaDeSocio.findUnique({ where: { chaveDeIdempotencia: dados.chave }, select: SELECAO });
        if (doPrimeiro) return { ...paraTela(doPrimeiro), repetida: true };
      }
      throw e;
    }
  }

  /** Edita, com justificativa, guardando o antes e o depois do que mudou. */
  async editar(id: string, dados: EditarRetiradaInput, usuarioId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM retiradas_de_socios WHERE id = ${id} FOR UPDATE`;
      const atual = await tx.retiradaDeSocio.findUnique({ where: { id } });
      if (!atual) throw new NotFoundException("Retirada não encontrada.");
      if (atual.estornadaEm) throw new ConflictException("Retirada estornada não se edita. Lance uma nova, se for o caso.");

      const antes: Record<string, unknown> = {};
      const depois: Record<string, unknown> = {};
      const data: Prisma.RetiradaDeSocioUncheckedUpdateInput = {};
      const mudou = (campo: string, velho: unknown, novo: unknown) => {
        antes[campo] = velho;
        depois[campo] = novo;
      };

      if (dados.socioId !== undefined && dados.socioId !== atual.socioId) {
        const socio = await tx.socio.findUnique({ where: { id: dados.socioId } });
        if (!socio) throw new BadRequestException("Sócio não encontrado.");
        mudou("socioId", atual.socioId, dados.socioId);
        data.socioId = dados.socioId;
      }
      if (dados.categoria !== undefined && dados.categoria !== atual.categoria) {
        mudou("categoria", CATEGORIA_DA_RETIRADA_LABEL[atual.categoria], CATEGORIA_DA_RETIRADA_LABEL[dados.categoria]);
        data.categoria = dados.categoria;
      }
      if (dados.valor !== undefined && Math.round(dados.valor * 100) !== Math.round(Number(atual.valor) * 100)) {
        mudou("valor", Number(atual.valor), dados.valor);
        data.valor = dados.valor;
      }
      if (dados.retiradaEm !== undefined && dados.retiradaEm !== atual.retiradaEm.toISOString().slice(0, 10)) {
        mudou("retiradaEm", atual.retiradaEm.toISOString().slice(0, 10), dados.retiradaEm);
        data.retiradaEm = this.conferirData(dados.retiradaEm);
      }
      if (dados.forma !== undefined && dados.forma !== atual.forma) {
        mudou("forma", FORMA_DA_RETIRADA_LABEL[atual.forma], FORMA_DA_RETIRADA_LABEL[dados.forma]);
        data.forma = dados.forma;
      }
      if (dados.descricao !== undefined && (dados.descricao?.trim() || null) !== atual.descricao) {
        mudou("descricao", atual.descricao, dados.descricao?.trim() || null);
        data.descricao = dados.descricao?.trim() || null;
      }
      if (Object.keys(data).length === 0) throw new BadRequestException("Nada foi alterado.");
      // Virou pró-labore, ou o pró-labore mudou de mês: a mesma conferência do registro.
      const categoriaFinal = (data.categoria as CategoriaDaRetirada | undefined) ?? atual.categoria;
      const diaFinal = dados.retiradaEm ?? atual.retiradaEm.toISOString().slice(0, 10);
      if (data.categoria !== undefined || data.retiradaEm !== undefined) {
        await this.conferirDuplicidadeDoProLabore(categoriaFinal, diaFinal, dados.semDuplicidadeConferida);
      }

      await tx.retiradaDeSocio.update({ where: { id }, data });
      await tx.alteracaoFinanceira.create({
        data: {
          entidade: "RETIRADA_DE_SOCIO",
          entidadeId: id,
          acao: "EDICAO",
          antes: antes as never,
          depois: depois as never,
          justificativa: dados.justificativa,
          usuarioId,
        },
      });
      const linha = await tx.retiradaDeSocio.findUniqueOrThrow({ where: { id }, select: SELECAO });
      return paraTela(linha);
    });
  }

  /** Estorna: sai dos totais, fica no histórico com motivo e autor. */
  async estornar(id: string, dados: EstornarRetiradaInput, usuarioId: string) {
    return prisma.$transaction(async (tx) => {
      const agora = new Date();
      const { count } = await tx.retiradaDeSocio.updateMany({
        where: { id, estornadaEm: null },
        data: { estornadaEm: agora, estornadaPorId: usuarioId, motivoDoEstorno: dados.motivo },
      });
      if (count === 0) {
        const existe = await tx.retiradaDeSocio.findUnique({ where: { id }, select: { id: true } });
        if (!existe) throw new NotFoundException("Retirada não encontrada.");
        throw new ConflictException("Esta retirada já foi estornada.");
      }
      const linha = await tx.retiradaDeSocio.findUniqueOrThrow({ where: { id }, select: SELECAO });
      await tx.alteracaoFinanceira.create({
        data: {
          entidade: "RETIRADA_DE_SOCIO",
          entidadeId: id,
          acao: "ESTORNO",
          antes: { estornada: false, valor: Number(linha.valor) } as never,
          depois: { estornada: true } as never,
          justificativa: dados.motivo,
          usuarioId,
        },
      });
      return paraTela(linha);
    });
  }

  /** A lista em CSV (separador ;, vírgula decimal), para abrir na planilha. */
  async csv(filtro: FiltroDeRetiradas): Promise<string> {
    const { itens } = await this.listar(filtro);
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cabecalho = ["Data", "Sócio", "Categoria", "Valor", "Forma", "Observação", "Lançado por", "Situação", "Motivo do estorno"];
    const linhas = itens.map((r) =>
      [
        r.retiradaEm.split("-").reverse().join("/"),
        r.socio,
        CATEGORIA_DA_RETIRADA_LABEL[r.categoria],
        r.valor.toFixed(2).replace(".", ","),
        FORMA_DA_RETIRADA_LABEL[r.forma],
        r.descricao ?? "",
        r.registradoPor ?? "",
        r.estornada ? "Estornada" : "Válida",
        r.motivoDoEstorno ?? "",
      ]
        .map(esc)
        .join(";"),
    );
    // BOM: o Excel abre acentos certos.
    return "﻿" + [cabecalho.map(esc).join(";"), ...linhas].join("\r\n");
  }

  private conferirData(dia: string): Date {
    const data = diaDaRetirada(dia);
    if (data.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException("A data da retirada não pode estar no futuro.");
    }
    return data;
  }
}
