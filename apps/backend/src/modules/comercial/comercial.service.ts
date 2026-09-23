import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";
import { periodoComercial, type PeriodoComercial } from "@festae/shared";
import { lerCarteiraCrua } from "../financeiro/carteira";
import { montarLinha } from "../financeiro/contratos";
import {
  detalharComercial,
  detalharPropostas,
  montarVisaoGeral,
  type DetalheComercial,
  type PropostaComDados,
} from "./visao-geral";

/**
 * A Visão Geral Comercial, lida ao vivo.
 *
 * Duas consultas, sempre as mesmas: a carteira de contratos — a MESMA que o
 * Financeiro lê — e as propostas. Todo o resto é conta em memória, em
 * `visao-geral.ts`. Sem cache: no volume de hoje (centenas de contratos) a
 * leitura inteira custa menos do que o risco de mostrar um número velho.
 */
@Injectable()
export class ComercialService {
  async visaoGeral(ano: number, mes: string | null) {
    const agora = new Date();
    const [linhas, propostas] = await Promise.all([this.carteira(agora), this.propostas()]);
    return montarVisaoGeral(linhas, propostas, periodoComercial(ano, mes), agora);
  }

  async detalhe(tipo: DetalheComercial | "PROPOSTAS", ano: number, mes: string | null) {
    const agora = new Date();
    const periodo: PeriodoComercial = periodoComercial(ano, mes);
    if (tipo === "PROPOSTAS") return detalharPropostas(await this.propostas(), periodo, agora);
    return detalharComercial(await this.carteira(agora), tipo, periodo, agora);
  }

  private async carteira(agora: Date) {
    const reservas = await lerCarteiraCrua();
    return reservas.map((reserva) => montarLinha(reserva, agora));
  }

  private async propostas(): Promise<PropostaComDados[]> {
    const linhas = await prisma.orcamento.findMany({
      select: {
        id: true,
        numero: true,
        clienteNome: true,
        createdAt: true,
        primeiroEnvioEm: true,
        enviadoEm: true,
        status: true,
        validoAte: true,
        reservationId: true,
        total: true,
        totalCalculado: true,
        valorFinalManual: true,
      },
    });
    return linhas.map((p) => ({
      id: p.id,
      numero: p.numero,
      cliente: p.clienteNome,
      createdAt: p.createdAt,
      primeiroEnvioEm: p.primeiroEnvioEm,
      enviadoEm: p.enviadoEm,
      status: p.status,
      validoAte: p.validoAte,
      reservationId: p.reservationId,
      total: Number(p.total),
      totalCalculado: Number(p.totalCalculado),
      valorFinalManual: p.valorFinalManual,
    }));
  }
}
