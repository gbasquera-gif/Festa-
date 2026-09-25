/**
 * O que uma proposta nova herda de outra quando é duplicada.
 *
 * A lista é explícita, campo a campo, de propósito: copiar "tudo menos X"
 * herdaria em silêncio o próximo campo de estado que alguém acrescentar ao
 * modelo. Aqui só entra o que é conteúdo comercial editável; o que é estado
 * (envio, aceite, perda, reserva, versão, token) nasce do zero.
 *
 * A cliente vem junto como ponto de partida — nome, telefone, e-mail e o
 * vínculo com o cadastro. Trocar a cliente na cópia muda só a cópia: a
 * proposta guarda os dados como texto, e editá-la nunca escreve no
 * cadastro `User`.
 */

const DIA = 86_400_000;

type Decimalish = unknown;

export type PropostaOriginal = {
  userId: string | null;
  clienteNome: string;
  clienteTelefone: string;
  clienteEmail: string | null;
  festaEm: Date;
  tipoDeFesta: string;
  cidade: string;
  local: string | null;
  convidados: number | null;
  observacoes: string | null;
  validoAte: Date;
  createdAt: Date;
  themeId: string | null;
  kitId: string | null;
  mostrarValoresIndividuais: boolean;
  percentualDoSinal: Decimalish | null;
  imagens: string[];
  subtotal: Decimalish;
  desconto: Decimalish;
  entrega: Decimalish;
  montagem: Decimalish;
  total: Decimalish;
  totalCalculado: Decimalish;
  valorFinalManual: boolean;
  canal: string | null;
  itens: {
    tipo: string;
    productId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: Decimalish;
    total: Decimalish;
    imagemUrl: string | null;
    ordem: number;
  }[];
};

/**
 * Os dados da proposta nova, prontos para um `create` só (com os itens
 * aninhados — o banco grava tudo ou nada).
 *
 * A validade repete o prazo que a original deu à cliente, contado de hoje:
 * uma proposta de 2025 duplicada hoje não pode nascer vencida.
 */
export function dadosDaDuplicata(
  original: PropostaOriginal,
  novo: { token: string; criadoPorId: string; agora: Date },
) {
  const prazoEmDias = Math.max(1, Math.round((original.validoAte.getTime() - original.createdAt.getTime()) / DIA));

  return {
    token: novo.token,
    criadoPorId: novo.criadoPorId,
    validoAte: new Date(novo.agora.getTime() + prazoEmDias * DIA),

    userId: original.userId,
    clienteNome: original.clienteNome,
    clienteTelefone: original.clienteTelefone,
    clienteEmail: original.clienteEmail,

    festaEm: original.festaEm,
    tipoDeFesta: original.tipoDeFesta,
    cidade: original.cidade,
    local: original.local,
    convidados: original.convidados,
    observacoes: original.observacoes,

    themeId: original.themeId,
    kitId: original.kitId,
    mostrarValoresIndividuais: original.mostrarValoresIndividuais,
    percentualDoSinal: original.percentualDoSinal,
    // As mesmas URLs: são referências ao que já está no storage, e a
    // exclusão de proposta nunca apaga arquivo — nada precisa ser copiado.
    imagens: [...original.imagens],
    canal: original.canal,

    subtotal: original.subtotal,
    desconto: original.desconto,
    entrega: original.entrega,
    montagem: original.montagem,
    total: original.total,
    totalCalculado: original.totalCalculado,
    valorFinalManual: original.valorFinalManual,

    itens: {
      create: [...original.itens]
        .sort((a, b) => a.ordem - b.ordem)
        .map((i, ordem) => ({
          tipo: i.tipo,
          productId: i.productId,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
          total: i.total,
          imagemUrl: i.imagemUrl,
          ordem,
        })),
    },
  };
}

/** Os campos que NUNCA passam para a cópia — conferidos no teste. */
export const CAMPOS_DE_ESTADO = [
  "id",
  "numero",
  "versao",
  "status",
  "token",
  "primeiroEnvioEm",
  "enviadoEm",
  "aprovadoEm",
  "recusadoEm",
  "motivoDaPerda",
  "categoriaDaPerda",
  "aprovadoPorNome",
  "aprovadoPorIp",
  "aprovadoPorAgente",
  "valorAprovado",
  "reservationId",
  "composicaoDoKit",
  "createdAt",
  "updatedAt",
] as const;
