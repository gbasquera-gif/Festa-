import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, prisma } from "@festae/database";
import type { ConfiguracaoDeAvisosInput, DestinatarioDeAvisoInput } from "@festae/shared";
import { emailDoCodigo } from "./mensagem";
import { lerConfiguracao, NOME_DA_TAREFA } from "./processar";
import { FalhaNoEnvio, transporteDoAmbiente } from "./transporte";

const MINUTOS_DO_CODIGO = 30;
const TENTATIVAS_DO_CODIGO = 5;
const ESPERA_ENTRE_CODIGOS_MS = 60_000;
const LIMITE_DE_DESTINATARIOS = 10;

/** O código nunca é guardado: só o hash, amarrado ao destinatário. */
function hashDoCodigo(destinatarioId: string, codigo: string): string {
  return createHash("sha256").update(`${destinatarioId}:${codigo}`).digest("hex");
}

/** Sem os campos do código: nem o hash sai da API. */
const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  nome: true,
  ativo: true,
  verificadoEm: true,
  codigoEnviadoEm: true,
  criadoEm: true,
} satisfies Prisma.DestinatarioDeAvisoSelect;

/**
 * Os avisos de contas a pagar, do lado do painel: como avisar, para quem, a
 * central de notificações e o histórico dos envios. Quem gera e manda os
 * avisos é a tarefa agendada (`processar.ts`).
 */
@Injectable()
export class AvisosService {
  async situacao() {
    const [config, destinatarios, envios, execucoes] = await Promise.all([
      lerConfiguracao(),
      prisma.destinatarioDeAviso.findMany({ select: CAMPOS_PUBLICOS, orderBy: { criadoEm: "asc" } }),
      prisma.envioDeAviso.findMany({
        orderBy: { criadoEm: "desc" },
        take: 30,
        select: {
          id: true,
          dia: true,
          situacao: true,
          tentativas: true,
          enviadoEm: true,
          proximaTentativaEm: true,
          ultimoErro: true,
          criadoEm: true,
          destinatario: { select: { email: true } },
          _count: { select: { itens: true } },
        },
      }),
      prisma.execucaoDeTarefa.findMany({
        where: { tarefa: NOME_DA_TAREFA },
        orderBy: { iniciadaEm: "desc" },
        take: 5,
      }),
    ]);
    const { transporte, motivo } = transporteDoAmbiente();
    return {
      config,
      email: { configurado: transporte !== null, provedor: transporte?.nome ?? null, motivo },
      destinatarios,
      envios: envios.map(({ _count, destinatario, ...e }) => ({ ...e, email: destinatario.email, avisos: _count.itens })),
      execucoes,
    };
  }

  async salvarConfiguracao(dados: ConfiguracaoDeAvisosInput, usuarioId: string) {
    return prisma.configuracaoDeAvisos.upsert({
      where: { id: "padrao" },
      create: { id: "padrao", ...dados, atualizadoPorId: usuarioId },
      update: { ...dados, atualizadoPorId: usuarioId },
    });
  }

  async adicionarDestinatario(dados: DestinatarioDeAvisoInput, usuarioId: string) {
    const total = await prisma.destinatarioDeAviso.count();
    if (total >= LIMITE_DE_DESTINATARIOS) {
      throw new BadRequestException(`No máximo ${LIMITE_DE_DESTINATARIOS} destinatários.`);
    }
    try {
      return await prisma.destinatarioDeAviso.create({
        data: { email: dados.email, nome: dados.nome, criadoPorId: usuarioId },
        select: CAMPOS_PUBLICOS,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("Este e-mail já está na lista.");
      }
      throw e;
    }
  }

  /**
   * Manda o código de 6 dígitos para o endereço. Sem confirmar, o endereço
   * não recebe aviso nenhum: é o que impede um e-mail digitado errado de
   * receber as contas da empresa.
   */
  async enviarCodigo(id: string, agora = new Date()) {
    const d = await prisma.destinatarioDeAviso.findUnique({ where: { id } });
    if (!d) throw new NotFoundException("Destinatário não encontrado.");
    if (d.verificadoEm) throw new ConflictException("Este endereço já foi confirmado.");
    if (d.codigoEnviadoEm && agora.getTime() - d.codigoEnviadoEm.getTime() < ESPERA_ENTRE_CODIGOS_MS) {
      throw new HttpException("Aguarde um minuto antes de pedir outro código.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const { transporte, motivo } = transporteDoAmbiente();
    if (!transporte) throw new ServiceUnavailableException(motivo ?? "Envio de e-mail não configurado.");

    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    // Grava antes de enviar: se o envio cair depois de sair, o código que
    // chegou à caixa é o que vale.
    await prisma.destinatarioDeAviso.update({
      where: { id },
      data: {
        codigoHash: hashDoCodigo(id, codigo),
        codigoExpiraEm: new Date(agora.getTime() + MINUTOS_DO_CODIGO * 60_000),
        codigoEnviadoEm: agora,
        tentativasDoCodigo: 0,
      },
    });
    try {
      await transporte.enviar(emailDoCodigo(d.email, codigo, MINUTOS_DO_CODIGO), `codigo-${id}-${agora.getTime()}`);
    } catch (e) {
      const motivoDaFalha = e instanceof FalhaNoEnvio ? e.motivo : "erro interno";
      throw new ServiceUnavailableException(`Não foi possível enviar o código (${motivoDaFalha}). Tente de novo em instantes.`);
    }
    return { enviado: true, validoPorMinutos: MINUTOS_DO_CODIGO };
  }

  async confirmar(id: string, codigo: string, agora = new Date()) {
    const d = await prisma.destinatarioDeAviso.findUnique({ where: { id } });
    if (!d) throw new NotFoundException("Destinatário não encontrado.");
    if (d.verificadoEm) return { confirmado: true };
    if (!d.codigoHash || !d.codigoExpiraEm || d.codigoExpiraEm < agora) {
      throw new BadRequestException("Código vencido ou não enviado. Peça um novo.");
    }
    if (d.tentativasDoCodigo >= TENTATIVAS_DO_CODIGO) {
      throw new BadRequestException("Muitas tentativas. Peça um novo código.");
    }
    const esperado = Buffer.from(d.codigoHash, "hex");
    const recebido = Buffer.from(hashDoCodigo(id, codigo), "hex");
    if (!timingSafeEqual(esperado, recebido)) {
      await prisma.destinatarioDeAviso.update({ where: { id }, data: { tentativasDoCodigo: { increment: 1 } } });
      throw new BadRequestException("Código incorreto.");
    }
    await prisma.destinatarioDeAviso.update({
      where: { id },
      data: { verificadoEm: agora, codigoHash: null, codigoExpiraEm: null, tentativasDoCodigo: 0 },
    });
    return { confirmado: true };
  }

  async ativar(id: string, ativo: boolean) {
    const { count } = await prisma.destinatarioDeAviso.updateMany({ where: { id }, data: { ativo } });
    if (count === 0) throw new NotFoundException("Destinatário não encontrado.");
    return prisma.destinatarioDeAviso.findUnique({ where: { id }, select: CAMPOS_PUBLICOS });
  }

  /** Remove. Quem já recebeu e-mail fica, desativado, para o histórico dos envios. */
  async remover(id: string) {
    const d = await prisma.destinatarioDeAviso.findUnique({ where: { id }, select: { id: true, _count: { select: { envios: true } } } });
    if (!d) throw new NotFoundException("Destinatário não encontrado.");
    if (d._count.envios > 0) {
      await prisma.destinatarioDeAviso.update({ where: { id }, data: { ativo: false } });
      return { removido: false, desativado: true };
    }
    await prisma.destinatarioDeAviso.delete({ where: { id } });
    return { removido: true, desativado: false };
  }

  /* ---------------- Central de notificações ---------------- */

  /**
   * Os avisos mais recentes. "Não lidos" conta só os de conta ainda em
   * aberto: aviso de conta já paga não pede atenção.
   */
  async notificacoes(limite = 30) {
    const [lista, naoLidas] = await Promise.all([
      prisma.notificacaoDeConta.findMany({
        orderBy: { criadaEm: "desc" },
        take: Math.min(Math.max(limite, 1), 100),
        include: { gasto: { select: { id: true, pagoEm: true, venceEm: true } } },
      }),
      prisma.notificacaoDeConta.count({ where: { lidaEm: null, gasto: { is: { pagoEm: null } } } }),
    ]);
    return {
      naoLidas,
      itens: lista.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        marco: n.marco,
        vencimento: n.vencimento,
        dia: n.dia,
        lida: n.lidaEm !== null,
        criadaEm: n.criadaEm,
        gastoId: n.gastoId,
        paga: n.gasto ? n.gasto.pagoEm !== null : null,
      })),
    };
  }

  async contarNaoLidas() {
    const naoLidas = await prisma.notificacaoDeConta.count({ where: { lidaEm: null, gasto: { is: { pagoEm: null } } } });
    return { naoLidas };
  }

  async marcarLida(id: string) {
    const { count } = await prisma.notificacaoDeConta.updateMany({ where: { id, lidaEm: null }, data: { lidaEm: new Date() } });
    if (count === 0 && !(await prisma.notificacaoDeConta.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException("Aviso não encontrado.");
    }
    return { lida: true };
  }

  async marcarTodasLidas() {
    const { count } = await prisma.notificacaoDeConta.updateMany({ where: { lidaEm: null }, data: { lidaEm: new Date() } });
    return { marcadas: count };
  }
}
