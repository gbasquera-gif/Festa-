/**
 * Os dados da Festaê, num lugar só.
 *
 * Razão social, CNPJ e contatos viviam em duas constantes — a dos textos
 * legais e a do recibo — e em cópias soltas no aplicativo. Cada cópia é um
 * dado que fica para trás na próxima mudança, e a próxima mudança chegou:
 * em novembro de 2026 a Festaê passou a atender num espaço comercial.
 *
 * Tudo que identifica a empresa lê daqui: recibo, voucher, proposta, Termos,
 * Política, agenda da equipe e aplicativo. O contrato digital, quando
 * existir, também lê daqui — e guarda uma cópia no aceite, para que uma
 * mudança posterior nunca altere um contrato já aceito.
 *
 * Mudou um dado? Sobe `versao`, atualiza `atualizadaEm`. Se o texto dos
 * Termos ou da Política mudar junto, eles sobem de versão também. O teste
 * deste módulo falha se CNPJ, telefone ou endereço aparecerem escritos em
 * outro arquivo do sistema.
 */

export interface EnderecoPostal {
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

/**
 * O endereço da sede no cartão CNPJ.
 *
 * O endereço comercial mudou antes do cadastro na Receita Federal. Enquanto
 * a sede estiver aguardando atualização, nenhum documento chama o endereço
 * comercial de "sede": ele é o endereço onde a Festaê atende. Quando o novo
 * cartão CNPJ for conferido, a situação passa a CONFERIDA, com a data.
 */
export type SedeCadastral =
  | { situacao: "AGUARDANDO_ATUALIZACAO_NA_RECEITA" }
  | { situacao: "CONFERIDA"; conferidaEm: string };

export interface DadosDaEmpresa {
  /** Sobe a cada alteração de qualquer dado abaixo. */
  versao: number;
  /** Dia da última alteração, em ISO. */
  atualizadaEm: string;
  /** Exatamente como no cartão CNPJ — nada acrescentado, nada abreviado. */
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  slogan: string;
  /** Onde a Festaê atende, organiza o acervo e entrega e recebe os artigos. */
  enderecoComercial: EnderecoPostal;
  sedeCadastral: SedeCadastral;
  contato: {
    telefone: string;
    /** O mesmo número no formato que o WhatsApp entende. */
    whatsapp: string;
    email: string;
    emailDePrivacidade: string;
    site: string;
    instagram: string;
  };
}

export const EMPRESA: DadosDaEmpresa = {
  versao: 1,
  atualizadaEm: "2026-11-01",
  razaoSocial: "68.155.380 MARIA LUIZA POCAI",
  nomeFantasia: "Festaê",
  cnpj: "68.155.380/0001-77",
  slogan: "Sua festa linda, sem complicação",
  enderecoComercial: {
    logradouro: "Rua Barão do Rio Branco",
    numero: "590-E",
    complemento: "sala subsolo",
    bairro: "Jardim Itália",
    cidade: "Chapecó",
    uf: "SC",
    cep: "89802-101",
  },
  sedeCadastral: { situacao: "AGUARDANDO_ATUALIZACAO_NA_RECEITA" },
  contato: {
    telefone: "(49) 99948-7777",
    whatsapp: "5549999487777",
    email: "contato@festaechapeco.com.br",
    emailDePrivacidade: "contato@festaechapeco.com.br",
    site: "festaechapeco.com.br",
    instagram: "@festae.chapeco",
  },
};

/**
 * O endereço em duas partes, para a tela poder impedir que o CEP se parta
 * no hífen quando a linha quebra: "…, Chapecó/SC" e "CEP 89802-101".
 */
export function enderecoEmPartes(e: EnderecoPostal = EMPRESA.enderecoComercial): { semCep: string; cep: string } {
  const rua = [`${e.logradouro}, nº ${e.numero}`, e.complemento].filter(Boolean).join(", ");
  return { semCep: `${rua}, ${e.bairro}, ${e.cidade}/${e.uf}`, cep: `CEP ${e.cep}` };
}

/** "Rua Barão do Rio Branco, nº 590-E, sala subsolo, Jardim Itália, Chapecó/SC, CEP 89802-101" */
export function enderecoCompleto(e: EnderecoPostal = EMPRESA.enderecoComercial): string {
  const { semCep, cep } = enderecoEmPartes(e);
  return `${semCep}, ${cep}`;
}

/**
 * "Rua Barão do Rio Branco, 590-E, sala subsolo" — para a linha de retirada,
 * que já fala de Chapecó e não precisa repetir bairro e CEP.
 */
export function enderecoCurto(e: EnderecoPostal = EMPRESA.enderecoComercial): string {
  return [`${e.logradouro}, ${e.numero}`, e.complemento].filter(Boolean).join(", ");
}

/**
 * Como os documentos chamam o endereço: "endereço comercial" enquanto a sede
 * no CNPJ não for conferida; depois, "sede e endereço comercial".
 */
export function qualificacaoDoEndereco(empresa: DadosDaEmpresa = EMPRESA): string {
  return empresa.sedeCadastral.situacao === "CONFERIDA" ? "sede e endereço comercial" : "endereço comercial";
}

/** O mesmo, no começo de uma linha: "Endereço comercial: Rua…". */
export function rotuloDoEndereco(empresa: DadosDaEmpresa = EMPRESA): string {
  const q = qualificacaoDoEndereco(empresa);
  return q.charAt(0).toUpperCase() + q.slice(1);
}
