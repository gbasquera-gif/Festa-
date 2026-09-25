import {
  FUSO_DE_CHAPECO_EM_MINUTOS,
  acervoDoMes,
  acumuladoNoAno,
  fromCentsInt,
  indicadoresDoMes,
  mesAnterior,
  mesEmChapeco,
  periodoComercial,
  receitaPorCompetencia,
  resultadoOperacionalDoMes,
  resumoDaCarteira,
  toCentsInt,
  variacao,
  type ContratoApurado,
  type GastoApurado,
  type Variacao,
} from "@festae/shared";
import type { LinhaDaCarteira } from "./contratos";
import { montarVisaoGeral } from "../comercial/visao-geral";

/**
 * O Relatório Executivo Financeiro, como função pura.
 *
 * Não tem fórmula própria. Cada número sai da MESMA função de
 * @festae/shared que a Visão Geral do Financeiro usa, sobre os MESMOS
 * contratos e gastos — é isso que faz o PDF mostrar exatamente o número da
 * tela. A carteira futura sai da mesma conta da Visão Geral Comercial.
 *
 * Competência e caixa ficam em blocos separados e nunca se somam:
 * faturamento é o contrato no mês da festa; recebimento é pagamento PAID.
 */

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-09" -> "Setembro de 2026". Sem depender do ICU do servidor. */
export function nomeDoMes(mes: string): string {
  const [ano, numero] = mes.split("-").map(Number);
  return `${MESES[numero - 1]} de ${ano}`;
}

/** "25/09/2026 às 17:26", no relógio de Chapecó. */
export function momentoEmChapeco(instante: Date): string {
  const local = new Date(instante.getTime() + FUSO_DE_CHAPECO_EM_MINUTOS * 60_000);
  const d = (n: number) => String(n).padStart(2, "0");
  return (
    `${d(local.getUTCDate())}/${d(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ` +
    `às ${d(local.getUTCHours())}:${d(local.getUTCMinutes())}`
  );
}

/** Os meses de `de` até `ate`, inclusive, como "AAAA-MM". */
function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, numero] = de.split("-").map(Number);
  for (let guarda = 0; guarda < 1200; guarda++) {
    const mes = `${ano}-${String(numero).padStart(2, "0")}`;
    if (mes > ate) break;
    meses.push(mes);
    numero += 1;
    if (numero === 13) {
      numero = 1;
      ano += 1;
    }
  }
  return meses;
}

export type RelatorioExecutivo = {
  mes: string;
  ano: number;
  periodo: string;
  emitidoEm: string;
  emitidoEmTexto: string;
  faturamento: {
    /** Igual a `panorama.operacional.faturamento`. */
    mes: number;
    festasNoMes: number;
    /** Igual a `panorama.ytd.faturamento`: janeiro até o mês escolhido. */
    ano: number;
    /**
     * Desde a primeira competência existente nos dados até o mês escolhido.
     * Festa de mês posterior não entra: é contratado, não faturado ainda.
     */
    total: number;
    desde: string | null;
  };
  resultado: {
    faturamento: number;
    despesas: number;
    resultado: number;
    margem: number | null;
  };
  acervoNoMes: number;
  recebimentos: {
    /** Carteira ativa inteira, não só o mês. */
    contratado: number;
    recebido: number;
    aReceber: number;
    /**
     * Parte do contratado já coberta por pagamento: (contratado − a receber)
     * ÷ contratado. É o mesmo saldo da tela, então nunca passa de 100%,
     * mesmo quando um contrato recebeu a mais.
     */
    indice: number | null;
    /** O que foi recebido além do valor de algum contrato. */
    recebidoAlemDoContratado: number;
    recebidoSemData: number;
  };
  carteiraFutura: {
    dias: number;
    de: string;
    ate: string;
    contratado: number;
    festas: number;
    recebido: number;
    aReceber: number;
  };
  comparacao: {
    mesAnterior: string;
    periodoAnterior: string;
    temBase: boolean;
    faturamento: Variacao;
    resultado: Variacao;
  };
};

export function montarRelatorioExecutivo(entrada: {
  contratos: readonly ContratoApurado[];
  gastos: readonly GastoApurado[];
  carteira: readonly LinhaDaCarteira[];
  ano: number;
  mes: string;
  agora: Date;
}): RelatorioExecutivo {
  const { contratos, gastos, carteira, ano, mes, agora } = entrada;

  // As mesmas chamadas de `FinanceiroService.panorama`.
  const operacional = resultadoOperacionalDoMes(contratos, gastos, mes);
  const indicadores = indicadoresDoMes(contratos, gastos, mes);
  const ytd = acumuladoNoAno(contratos, gastos, ano, mes);
  const anterior = mesAnterior(mes);
  const doAnterior = resultadoOperacionalDoMes(contratos, gastos, anterior);

  // Acumulado total: a mesma receita por competência, mês a mês, desde o
  // primeiro mês com festa vigente. Nenhuma data de abertura escrita aqui.
  const competencias = contratos.filter((c) => !c.cancelado).map((c) => mesEmChapeco(c.festaEm));
  const primeiro = competencias.length > 0 ? competencias.reduce((a, b) => (a < b ? a : b)) : null;
  const meses = primeiro && primeiro <= mes ? mesesEntre(primeiro, mes) : [];
  const total = fromCentsInt(
    meses.reduce((soma, m) => soma + toCentsInt(receitaPorCompetencia(contratos, m)), 0),
  );

  const carteiraAtiva = resumoDaCarteira(contratos, agora);
  const coberto = fromCentsInt(toCentsInt(carteiraAtiva.contratado) - toCentsInt(carteiraAtiva.saldoEmAberto));
  const futura = montarVisaoGeral(carteira, [], periodoComercial(ano, mes), agora).carteiraFutura;

  return {
    mes,
    ano,
    periodo: nomeDoMes(mes),
    emitidoEm: agora.toISOString(),
    emitidoEmTexto: momentoEmChapeco(agora),
    faturamento: {
      mes: operacional.receita,
      festasNoMes: indicadores.festasNoMes,
      ano: ytd.faturamento,
      total,
      desde: meses.length > 0 ? meses[0] : null,
    },
    resultado: {
      faturamento: operacional.receita,
      despesas: operacional.despesa,
      resultado: operacional.resultado,
      margem: operacional.margem,
    },
    acervoNoMes: acervoDoMes(gastos, mes),
    recebimentos: {
      contratado: carteiraAtiva.contratado,
      recebido: carteiraAtiva.recebido,
      aReceber: carteiraAtiva.saldoEmAberto,
      indice: carteiraAtiva.contratado > 0 ? coberto / carteiraAtiva.contratado : null,
      recebidoAlemDoContratado: fromCentsInt(
        Math.max(0, toCentsInt(carteiraAtiva.recebido) - toCentsInt(coberto)),
      ),
      recebidoSemData: carteiraAtiva.recebidoSemData,
    },
    carteiraFutura: futura,
    comparacao: {
      mesAnterior: anterior,
      periodoAnterior: nomeDoMes(anterior),
      temBase: doAnterior.receita > 0 || doAnterior.despesa > 0,
      faturamento: variacao(operacional.receita, doAnterior.receita),
      resultado: variacao(operacional.resultado, doAnterior.resultado),
    },
  };
}
