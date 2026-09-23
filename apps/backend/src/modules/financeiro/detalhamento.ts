import { mesEmChapeco, receitaPorCompetencia, totalAReceber, toCentsInt } from "@festae/shared";
import type { LinhaDaCarteira } from "./contratos";

/**
 * De que contratos um indicador é feito.
 *
 * O painel mostrava R$ 9.029,00 a receber e não havia como perguntar "de
 * quem?". A resposta existia — é a mesma carteira que a aba Vendas/Contratos
 * lê — mas ninguém ia procurar noutra tela, e número que não se explica
 * ninguém cobra.
 *
 * O ponto desta camada é reconciliação: as linhas saem do MESMO conjunto que
 * o KPI soma, e o total é recalculado pela MESMA função de @festae/shared que
 * o panorama usa. Um detalhamento com consulta própria seria um segundo
 * cálculo, e dois cálculos divergem — sempre, e no pior dia.
 */

export const TIPOS_DE_DETALHE = ["A_RECEBER", "FATURAMENTO", "FESTAS"] as const;
export type TipoDeDetalhe = (typeof TIPOS_DE_DETALHE)[number];

export function ehTipoDeDetalhe(valor: string): valor is TipoDeDetalhe {
  return (TIPOS_DE_DETALHE as readonly string[]).includes(valor);
}

export type EscopoDoDetalhe = "MES" | "ANO";

export type LinhaDoDetalhe = {
  reservaId: string;
  numero: number;
  cliente: string;
  festaEm: string;
  tipoDeFesta: string;
  cidade: string;
  entrega: boolean;
  status: string;
  situacao: string;
  valor: number;
  recebido: number;
  saldo: number;
};

export type Detalhamento = {
  tipo: TipoDeDetalhe;
  escopo: EscopoDoDetalhe | null;
  /** "2026-09", "2026" ou null quando o indicador não tem recorte de período. */
  periodo: string | null;
  linhas: LinhaDoDetalhe[];
  totais: { contratado: number; recebido: number; saldo: number; festas: number };
  /**
   * O total das linhas bate com o indicador apurado pela regra compartilhada.
   *
   * Existe para ser falso em vez de silencioso: se algum dia as duas contas
   * divergirem, a tela diz isso em vez de exibir um total plausível e errado.
   */
  confere: boolean;
};

export function paraLinha({ comercial }: LinhaDaCarteira): LinhaDoDetalhe {
  return {
    reservaId: comercial.id,
    numero: comercial.numero,
    cliente: comercial.cliente.nome,
    festaEm: comercial.festaEm,
    tipoDeFesta: comercial.tipoDeFesta,
    cidade: comercial.cidade,
    entrega: comercial.entrega,
    status: comercial.status,
    situacao: comercial.situacao,
    valor: comercial.valor,
    recebido: comercial.recebido,
    saldo: comercial.saldo,
  };
}

/** Os meses de um recorte. Um só, ou janeiro até o mês escolhido. */
export function mesesDoEscopo(escopo: EscopoDoDetalhe, mes: string): string[] {
  if (escopo === "MES") return [mes];
  const [ano, numero] = mes.split("-");
  const limite = Number(numero);
  return Array.from({ length: limite }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

const somaCentavos = (valores: readonly number[]) =>
  valores.reduce((soma, v) => soma + toCentsInt(v), 0);

export function detalhar(
  linhas: readonly LinhaDaCarteira[],
  tipo: TipoDeDetalhe,
  escopo: EscopoDoDetalhe,
  mes: string,
): Detalhamento {
  // Cancelada aparece na carteira porque a operação precisa vê-la, e não
  // entra em indicador nenhum. O corte é o mesmo de `vigentes()`.
  const vigentes = linhas.filter((l) => l.comercial.vigente);

  if (tipo === "A_RECEBER") {
    // A receber não tem competência: é o saldo aberto de tudo que está de pé,
    // hoje. Recortá-lo por mês responderia outra pergunta.
    const comSaldo = vigentes
      .filter((l) => toCentsInt(l.comercial.saldo) > 0)
      .sort((a, b) => b.comercial.saldo - a.comercial.saldo);

    const esperado = totalAReceber(vigentes.map((l) => l.apurado));
    return montar("A_RECEBER", null, null, comSaldo, esperado, "saldo");
  }

  const meses = mesesDoEscopo(escopo, mes);
  const doPeriodo = vigentes
    .filter((l) => meses.includes(mesEmChapeco(new Date(`${l.comercial.festaEm}T12:00:00.000Z`))))
    .sort((a, b) => a.comercial.festaEm.localeCompare(b.comercial.festaEm));

  const periodo = escopo === "MES" ? mes : mes.slice(0, 4);

  if (tipo === "FESTAS") {
    const esperado = meses.reduce(
      (n, m) =>
        n +
        vigentes.filter(
          (l) => mesEmChapeco(new Date(`${l.comercial.festaEm}T12:00:00.000Z`)) === m,
        ).length,
      0,
    );
    return montar("FESTAS", escopo, periodo, doPeriodo, esperado, "festas");
  }

  const esperado = somar(meses.map((m) => receitaPorCompetencia(vigentes.map((l) => l.apurado), m)));
  return montar("FATURAMENTO", escopo, periodo, doPeriodo, esperado, "contratado");
}

function somar(valores: readonly number[]): number {
  return somaCentavos(valores) / 100;
}

function montar(
  tipo: TipoDeDetalhe,
  escopo: EscopoDoDetalhe | null,
  periodo: string | null,
  selecionadas: readonly LinhaDaCarteira[],
  esperado: number,
  conferir: "saldo" | "contratado" | "festas",
): Detalhamento {
  const linhas = selecionadas.map(paraLinha);
  const totais = {
    contratado: somaCentavos(linhas.map((l) => l.valor)) / 100,
    recebido: somaCentavos(linhas.map((l) => l.recebido)) / 100,
    saldo: somaCentavos(linhas.map((l) => l.saldo)) / 100,
    festas: linhas.length,
  };

  const medido =
    conferir === "festas" ? totais.festas : conferir === "saldo" ? totais.saldo : totais.contratado;
  const confere =
    conferir === "festas" ? medido === esperado : toCentsInt(medido) === toCentsInt(esperado);

  return { tipo, escopo, periodo, linhas, totais, confere };
}
