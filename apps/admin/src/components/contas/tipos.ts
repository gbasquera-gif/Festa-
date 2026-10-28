import type {
  AjusteDeDiaInexistente,
  AjusteDeDiaNaoUtil,
  NaturezaDoGasto,
  Ocorrencia,
  SituacaoDaConta,
  SituacaoDaRecorrencia,
  TipoDeValor,
} from "@festae/shared";

/** Uma conta da aba Contas a pagar (um gasto com vencimento, ou em aberto). */
export type Conta = {
  id: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  categoria: string | null;
  fornecedor: string | null;
  valor: number;
  venceEm: string | null;
  pagoEm: string | null;
  formaDePagamento: string | null;
  observacao: string | null;
  competencia: string | null;
  recorrencia: { id: string; descricao: string; tipoDeValor: TipoDeValor } | null;
  situacao: SituacaoDaConta;
};

export type RespostaDasContas = {
  hoje: string;
  mes: string;
  indicadores: {
    totalEmAberto: number;
    vencido: number;
    previstoNoMes: number;
    pagoDoPrevisto: number;
    emAbertoDoPrevisto: number;
  };
  contagem: Record<SituacaoDaConta, number>;
  contas: Conta[];
  fornecedores: string[];
  conferenciasPendentes: number;
};

export type Recorrencia = {
  id: string;
  descricao: string;
  natureza: NaturezaDoGasto;
  categoria: string | null;
  fornecedor: string | null;
  tipoDeValor: TipoDeValor;
  valorPrevisto: number;
  intervaloMeses: number;
  diaDoVencimento: number;
  dataInicial: string;
  dataFinal: string | null;
  ajusteDiaInexistente: AjusteDeDiaInexistente;
  ajusteDiaNaoUtil: AjusteDeDiaNaoUtil;
  situacao: SituacaoDaRecorrencia;
  geracaoDesde: string;
  pausadaEm: string | null;
  encerradaEm: string | null;
  proximoVencimento: string | null;
  contasEmAberto: number;
  contasPagas: number;
  conferenciasPendentes: number;
  retroativasDisponiveis: Ocorrencia[];
};

export type ResumoDaGeracao = {
  recorrencias: number;
  geradas: number;
  jaExistiam: number;
  jaDecididas: number;
  conferenciasAbertas: number;
};

export type EventoDaRecorrencia = {
  id: string;
  tipo: "CRIADA" | "EDITADA" | "PAUSADA" | "RETOMADA" | "ENCERRADA" | "RETROATIVAS_GERADAS";
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | unknown[] | null;
  contasAfetadas: number;
  criadoEm: string;
};

export type Conferencia = {
  id: string;
  competencia: string;
  vencimento: string;
  recorrencia: {
    id: string;
    descricao: string;
    natureza: NaturezaDoGasto;
    fornecedor: string | null;
    tipoDeValor: TipoDeValor;
    valorPrevisto: number;
  };
  candidatos: {
    id: string;
    descricao: string;
    fornecedor: string | null;
    valor: number;
    venceEm: string | null;
    pagoEm: string | null;
  }[];
};

export type SituacaoDosAvisos = {
  config: { marcos: number[]; horaDoAviso: number; emailAtivo: boolean; mostrarValorNoEmail: boolean };
  email: { configurado: boolean; provedor: string | null; motivo: string | null };
  destinatarios: {
    id: string;
    email: string;
    nome: string | null;
    ativo: boolean;
    verificadoEm: string | null;
    codigoEnviadoEm: string | null;
    criadoEm: string;
  }[];
  envios: {
    id: string;
    dia: string;
    situacao: "PENDENTE" | "ENVIANDO" | "ENVIADO" | "FALHOU" | "ESGOTADO" | "CANCELADO" | "INCERTO";
    tentativas: number;
    enviadoEm: string | null;
    proximaTentativaEm: string;
    ultimoErro: string | null;
    criadoEm: string;
    email: string;
    avisos: number;
  }[];
  execucoes: {
    id: string;
    iniciadaEm: string;
    terminadaEm: string | null;
    sucesso: boolean | null;
    erro: string | null;
    resumo: {
      geracao?: ResumoDaGeracao;
      notificacoesCriadas?: number;
      enviosCriados?: number;
      despacho?: { enviados: number; falharam: number; esgotados: number; cancelados: number; incertos: number } | null;
    } | null;
  }[];
};

export type Notificacoes = {
  naoLidas: number;
  itens: {
    id: string;
    titulo: string;
    marco: number;
    vencimento: string;
    dia: string;
    lida: boolean;
    criadaEm: string;
    gastoId: string | null;
    paga: boolean | null;
  }[];
};
