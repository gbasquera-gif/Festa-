import { mesEmChapeco } from "./financeiro";
import { fromCentsInt, toCentsInt } from "./pricing";
import {
  CATEGORIA_DA_PERDA_LABEL,
  situacaoDoOrcamento,
  type CategoriaDaPerda,
  type StatusDoOrcamento,
} from "./orcamento";
import { distribuir, funilDePropostas, taxa, type PropostaDoFunil, type Taxa } from "./comercial";

/**
 * O panorama da aba Orçamentos.
 *
 * Nenhuma regra comercial nasce aqui: a coorte, a conversão e a base mínima
 * das taxas são as do funil da Visão Geral (`funilDePropostas`, `taxa`), e a
 * situação de cada proposta é a de `situacaoDoOrcamento` — a mesma que as
 * abas da lista usam. Este módulo só junta as peças num resumo.
 *
 * Uma proposta é uma linha de `Orcamento`, tenha ela uma opção ou cinco. O
 * panorama nunca lê opções: conta propostas e soma um valor por proposta.
 */

export type PropostaDoPanorama = PropostaDoFunil & {
  aprovadoEm: Date | null;
  valorAprovado: number | null;
  categoriaDaPerda: string | null;
};

/**
 * O mês a que uma proposta pertence no panorama e no filtro da lista.
 *
 * O do primeiro envio — o mesmo da coorte da conversão, para o card e a
 * taxa falarem das mesmas propostas. Proposta que nunca saiu (rascunho), ou
 * que saiu antes de o primeiro envio ser registrado, não tem essa data: vale
 * o mês em que foi criada.
 */
export function mesDeReferenciaDaProposta(p: {
  primeiroEnvioEm: Date | string | null;
  createdAt: Date | string;
}): string {
  return mesEmChapeco(new Date(p.primeiroEnvioEm ?? p.createdAt));
}

export type BlocoDoPanorama = {
  quantidade: number;
  /**
   * Um valor por proposta, nunca a soma das opções. Aprovada: o valor
   * aprovado (o da opção escolhida). Antes do aceite: o valor de referência
   * da proposta (`Orcamento.total`, que espelha a 1ª opção).
   */
  valor: number;
};

export type PanoramaDeOrcamentos = {
  /** Propostas do recorte, pelo mês de referência. É o total da aba "Todos" da lista. */
  propostas: number;
  rascunhos: BlocoDoPanorama;
  /** Enviadas, dentro da validade, sem aceite nem perda: a aba "Enviados". */
  emNegociacao: BlocoDoPanorama;
  /** Com aceite da cliente. `convertidas` é quantas delas já viraram reserva. */
  aprovadas: BlocoDoPanorama & { convertidas: number };
  /** Encerradas como perda (status RECUSADO). */
  perdidas: BlocoDoPanorama;
  /** Passaram da validade sem aceite nem perda registrada: a aba "Expirados". */
  semResposta: BlocoDoPanorama;
  /** As cinco fatias somam `propostas`. */
  confere: boolean;
  ticketMedioAprovado: number | null;

  /** A coorte da Visão Geral: primeiro envio no recorte. */
  funil: {
    enviadas: number;
    aprovadas: number;
    convertidas: number;
    perdidas: number;
    /** Antigas, do recorte, sem primeiro envio registrado: fora das taxas. */
    semPrimeiroEnvio: number;
  };
  /** Enviada → aprovada, na coorte. A mesma taxa "Enviada → aprovada" da Visão Geral. */
  conversao: Taxa;
  /** Perdas declaradas ÷ enviadas, na mesma coorte e com a mesma base mínima. */
  taxaDePerda: Taxa;
  /** Do primeiro envio ao aceite, nas aprovadas da coorte com as duas datas. */
  tempoAteAprovacao: { mediaEmDias: number | null; base: number };

  motivosDaPerda: { chave: string; rotulo: string; quantidade: number }[];
  /** Por mês: a coorte daquele mês (enviadas) e quantas dela foram aprovadas. */
  evolucao: { mes: string; enviadas: number; aprovadas: number }[];
};

export const PERDA_NAO_INFORMADA = "NAO_INFORMADO";

const DIA_EM_MS = 86_400_000;

function somar(propostas: readonly PropostaDoPanorama[], valor: (p: PropostaDoPanorama) => number): number {
  return fromCentsInt(propostas.reduce((s, p) => s + toCentsInt(valor(p)), 0));
}

/** O valor que o panorama atribui a uma proposta aprovada: o aprovado. */
function valorDaAprovada(p: PropostaDoPanorama): number {
  // `valorAprovado` é gravado no aceite com o valor da opção escolhida, e
  // também nas aprovadas antes das opções existirem. O `total` só entra se
  // um dia houver aprovada sem ele — e é o espelho da opção aprovada.
  return p.valorAprovado ?? p.total;
}

/**
 * Monta o panorama de um recorte.
 *
 * `meses` é o recorte ("2026-09", ou os doze do ano); `null` é "todos": a
 * base inteira. `evolucao` recebe os meses da linha do tempo, que podem ir
 * além do recorte (os seis meses até o mês escolhido, por exemplo).
 */
export function panoramaDeOrcamentos(
  todas: readonly PropostaDoPanorama[],
  meses: readonly string[] | null,
  agora: Date,
  mesesDaEvolucao: readonly string[] = [],
): PanoramaDeOrcamentos {
  // "Todos" vira a lista de todos os meses em que há alguma data — a coorte
  // da Visão Geral é definida por meses, e assim a mesma função serve.
  const recorte =
    meses ??
    [...new Set(todas.flatMap((p) => [p.createdAt, p.primeiroEnvioEm].filter((d): d is Date => d !== null).map(mesEmChapeco)))];
  const noRecorte = new Set(recorte);

  const doRecorte = todas.filter((p) => noRecorte.has(mesDeReferenciaDaProposta(p)));
  const situacao = (p: PropostaDoPanorama): StatusDoOrcamento => situacaoDoOrcamento(p.status, p.validoAte, agora);
  const com = (s: StatusDoOrcamento) => doRecorte.filter((p) => situacao(p) === s);

  const rascunhos = com("RASCUNHO");
  const emNegociacao = com("ENVIADO");
  const aprovadas = com("APROVADO");
  const perdidas = com("RECUSADO");
  const expiradas = com("EXPIRADO");

  const valorAprovado = somar(aprovadas, valorDaAprovada);
  const ticketMedioAprovado =
    aprovadas.length > 0 ? fromCentsInt(Math.round(toCentsInt(valorAprovado) / aprovadas.length)) : null;

  const funil = funilDePropostas(todas, recorte, agora);
  const idsDaCoorte = new Set(funil.idsDaCoorte);
  const coorte = todas.filter((p) => idsDaCoorte.has(p.id));

  const tempos = coorte
    .filter((p) => p.status === "APROVADO" && p.aprovadoEm && p.primeiroEnvioEm)
    .map((p) => (p.aprovadoEm!.getTime() - p.primeiroEnvioEm!.getTime()) / DIA_EM_MS)
    // Aceite antes do primeiro envio registrado não é um tempo: é dado de
    // antes do registro, e entraria negativo na média.
    .filter((dias) => dias >= 0);

  const motivosDaPerda = distribuir(perdidas, (p) => p.categoriaDaPerda ?? PERDA_NAO_INFORMADA).map((f) => ({
    chave: f.chave,
    rotulo:
      f.chave === PERDA_NAO_INFORMADA
        ? "Não informado"
        : (CATEGORIA_DA_PERDA_LABEL[f.chave as CategoriaDaPerda] ?? f.chave),
    quantidade: f.quantidade,
  }));

  // A coorte de um mês só pode conter propostas com primeiro envio naquele
  // mês: separar antes e entregar a cada mês só as dele dá exatamente o
  // mesmo funil, sem varrer a base inteira doze vezes.
  const porMesDeEnvio = new Map<string, PropostaDoPanorama[]>();
  for (const p of todas) {
    if (!p.primeiroEnvioEm) continue;
    const mes = mesEmChapeco(p.primeiroEnvioEm);
    const lista = porMesDeEnvio.get(mes);
    if (lista) lista.push(p);
    else porMesDeEnvio.set(mes, [p]);
  }
  const evolucao = mesesDaEvolucao.map((mes) => {
    const doMes = funilDePropostas(porMesDeEnvio.get(mes) ?? [], [mes], agora);
    return { mes, enviadas: doMes.enviadas, aprovadas: doMes.aprovadas };
  });

  const bloco = (lista: readonly PropostaDoPanorama[]): BlocoDoPanorama => ({
    quantidade: lista.length,
    valor: somar(lista, (p) => p.total),
  });

  return {
    propostas: doRecorte.length,
    rascunhos: bloco(rascunhos),
    emNegociacao: bloco(emNegociacao),
    aprovadas: {
      quantidade: aprovadas.length,
      valor: valorAprovado,
      convertidas: aprovadas.filter((p) => p.reservationId !== null).length,
    },
    perdidas: bloco(perdidas),
    semResposta: bloco(expiradas),
    confere:
      rascunhos.length + emNegociacao.length + aprovadas.length + perdidas.length + expiradas.length ===
      doRecorte.length,
    ticketMedioAprovado,
    funil: {
      enviadas: funil.enviadas,
      aprovadas: funil.aprovadas,
      convertidas: funil.convertidas,
      perdidas: funil.perdidasDeclaradas,
      semPrimeiroEnvio: funil.semPrimeiroEnvio,
    },
    conversao: funil.aprovacao,
    taxaDePerda: taxa(funil.perdidasDeclaradas, funil.enviadas),
    tempoAteAprovacao: {
      mediaEmDias: tempos.length > 0 ? tempos.reduce((s, d) => s + d, 0) / tempos.length : null,
      base: tempos.length,
    },
    motivosDaPerda,
    evolucao,
  };
}

/** Os `quantos` meses que terminam em `ultimo` ("AAAA-MM"), do mais antigo ao mais novo. */
export function mesesAte(ultimo: string, quantos: number): string[] {
  const [ano, mes] = ultimo.split("-").map(Number);
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - 1 - (quantos - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
