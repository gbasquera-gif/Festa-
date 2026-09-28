import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";
import {
  mesEmChapeco,
  mesesAte,
  panoramaDeOrcamentos,
  periodoComercial,
  type PropostaDoPanorama,
  type StatusDoOrcamento,
} from "@festae/shared";

const DIA_EM_MS = 86_400_000;

/** O recorte pedido pela tela: um mês, um ano inteiro, ou tudo. */
export type RecorteDoPanorama = { ano: number | null; mes: string | null };

/**
 * O panorama da aba Orçamentos.
 *
 * A conta é toda de `panoramaDeOrcamentos` (@festae/shared), que por sua vez
 * usa o funil da Visão Geral — aqui só se decide o que ler do banco.
 *
 * O que se lê: as colunas da própria proposta, e nada das opções, linhas ou
 * imagens. Uma proposta é uma linha de `orcamentos`; o valor dela já está
 * na linha (`valorAprovado`, ou `total`, o valor de referência). E só as
 * linhas cujo primeiro envio ou criação caem na janela pedida — o panorama
 * de um mês não varre a base inteira.
 */
@Injectable()
export class PanoramaDeOrcamentosService {
  async panorama(recorte: RecorteDoPanorama) {
    const agora = new Date();
    const meses = recorte.ano === null ? null : periodoComercial(recorte.ano, recorte.mes).meses;

    // A linha do tempo: seis meses até o mês escolhido, os doze do ano
    // escolhido, ou os últimos doze quando o recorte é "todos".
    const mesesDaEvolucao =
      recorte.ano === null
        ? mesesAte(mesEmChapeco(agora), 12)
        : recorte.mes
          ? mesesAte(recorte.mes, 6)
          : (meses as string[]);

    const linhas = await prisma.orcamento.findMany({
      where: meses === null ? undefined : janela([...meses, ...mesesDaEvolucao]),
      select: {
        id: true,
        createdAt: true,
        primeiroEnvioEm: true,
        enviadoEm: true,
        status: true,
        validoAte: true,
        reservationId: true,
        total: true,
        totalCalculado: true,
        valorFinalManual: true,
        aprovadoEm: true,
        valorAprovado: true,
        categoriaDaPerda: true,
      },
    });

    const propostas: PropostaDoPanorama[] = linhas.map((l) => ({
      ...l,
      status: l.status as StatusDoOrcamento,
      total: Number(l.total),
      totalCalculado: Number(l.totalCalculado),
      valorAprovado: l.valorAprovado === null ? null : Number(l.valorAprovado),
    }));

    return {
      apuradoEm: agora.toISOString(),
      recorte: { ano: recorte.ano, mes: recorte.mes },
      ...panoramaDeOrcamentos(propostas, meses, agora, mesesDaEvolucao),
    };
  }
}

/**
 * As linhas que podem pertencer a algum dos meses: primeiro envio ou
 * criação dentro deles. Um dia de folga em cada ponta porque o mês é o de
 * Chapecó e o banco guarda UTC; quem sobra é descartado pela regra, que
 * decide o mês de cada proposta.
 */
function janela(meses: readonly string[]) {
  const ordenados = [...meses].sort();
  const inicio = new Date(Date.parse(`${ordenados[0]}-01T00:00:00.000Z`) - DIA_EM_MS);
  const [ano, mes] = ordenados[ordenados.length - 1].split("-").map(Number);
  const fim = new Date(Date.UTC(ano, mes, 1) + DIA_EM_MS);
  const entre = { gte: inicio, lt: fim };
  return { OR: [{ primeiroEnvioEm: entre }, { createdAt: entre }] };
}
