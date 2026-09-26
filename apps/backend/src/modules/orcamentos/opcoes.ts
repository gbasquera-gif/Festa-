import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  calcularOrcamento,
  totalDaLinha,
  valorOficialDoOrcamento,
  type LinhaDoOrcamento,
  type OpcaoDoOrcamentoInput,
} from "@festae/shared";

/**
 * As regras das opções de festa de uma proposta, sem banco por perto.
 *
 * Uma proposta tem 1..N opções; cada uma tem kit, linhas, imagens e valores
 * próprios. A cliente escolhe uma — e é só ela que vira dinheiro: valor
 * aprovado, sinal, reserva, pedido, estoque.
 *
 * O orçamento continua guardando kit, imagens e valores "de resumo" (as
 * colunas de antes das opções). Elas espelham a opção de referência — a
 * aprovada, ou a primeira enquanto nada foi aprovado —, para que listas e
 * indicadores que leem o orçamento continuem somando um número por
 * proposta: três opções continuam sendo uma proposta.
 */

/** Os valores gravados de uma opção: as parcelas da composição, o calculado e o oficial. */
export function totaisDaOpcao(opcao: Pick<OpcaoDoOrcamentoInput, "itens" | "valores">) {
  const linhas: LinhaDoOrcamento[] = opcao.itens.map((i) => ({
    tipo: i.tipo,
    descricao: i.descricao,
    quantidade: i.quantidade,
    valorUnitario: i.valorUnitario,
  }));
  const composicao = calcularOrcamento(
    linhas,
    opcao.valores.desconto,
    opcao.valores.entrega,
    opcao.valores.montagem,
  );
  const oficial = valorOficialDoOrcamento(composicao.total, opcao.valores.valorFinal);
  return {
    subtotal: composicao.subtotal,
    desconto: composicao.desconto,
    entrega: composicao.entrega,
    montagem: composicao.montagem,
    total: oficial.total,
    totalCalculado: oficial.totalCalculado,
    valorFinalManual: oficial.manual,
  };
}

/** As linhas de uma opção, prontas para gravar (sem os ids do pai). */
export function linhasDaOpcao(itens: OpcaoDoOrcamentoInput["itens"]) {
  return itens.map((i, ordem) => ({
    tipo: i.tipo as never,
    productId: i.productId || null,
    descricao: i.descricao.trim(),
    quantidade: i.quantidade,
    valorUnitario: i.valorUnitario,
    total: totalDaLinha({
      tipo: i.tipo,
      descricao: i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    }),
    imagemUrl: i.imagemUrl || null,
    ordem,
  }));
}

/** Uma opção como está no banco, no que as regras abaixo precisam. */
export type OpcaoGravada = {
  id: string;
  ordem: number;
  nome: string;
  kitId: string | null;
  imagens: string[];
  composicaoDoKit: unknown;
  subtotal: unknown;
  desconto: unknown;
  entrega: unknown;
  montagem: unknown;
  total: unknown;
  totalCalculado: unknown;
  valorFinalManual: boolean;
};

/** As colunas de resumo do orçamento, copiadas da opção de referência. */
export function espelhoDaOpcao(opcao: {
  kitId: string | null;
  imagens: string[];
  subtotal: unknown;
  desconto: unknown;
  entrega: unknown;
  montagem: unknown;
  total: unknown;
  totalCalculado: unknown;
  valorFinalManual: boolean;
}) {
  return {
    kitId: opcao.kitId,
    imagens: opcao.imagens,
    subtotal: opcao.subtotal as never,
    desconto: opcao.desconto as never,
    entrega: opcao.entrega as never,
    montagem: opcao.montagem as never,
    total: opcao.total as never,
    totalCalculado: opcao.totalCalculado as never,
    valorFinalManual: opcao.valorFinalManual,
  };
}

const porOrdem = <T extends { ordem: number }>(opcoes: readonly T[]) =>
  [...opcoes].sort((a, b) => a.ordem - b.ordem);

/** A opção de referência: a aprovada, ou a primeira enquanto nada foi aprovado. */
export function opcaoDeReferencia<T extends { id: string; ordem: number }>(proposta: {
  opcaoAprovadaId: string | null;
  opcoes: readonly T[];
}): T | null {
  const ordenadas = porOrdem(proposta.opcoes);
  return ordenadas.find((o) => o.id === proposta.opcaoAprovadaId) ?? ordenadas[0] ?? null;
}

/**
 * A opção que a cliente está aprovando.
 *
 * Com uma opção só, é ela — é o caso de toda proposta de antes das opções.
 * Com mais de uma, a escolha tem de vir explícita e ser desta proposta:
 * aprovar "a primeira" por falta de escolha seria cobrar uma festa que a
 * cliente não escolheu.
 */
export function opcaoEscolhida<T extends { id: string; ordem: number }>(
  opcoes: readonly T[],
  opcaoId: string | undefined,
): T {
  if (opcoes.length === 0) {
    throw new ConflictException("Esta proposta não tem opção de festa para aprovar. Fale com a Festaê.");
  }
  if (opcaoId) {
    const escolhida = opcoes.find((o) => o.id === opcaoId);
    if (!escolhida) {
      throw new BadRequestException("A opção escolhida não faz parte desta proposta. Recarregue a página e escolha de novo.");
    }
    return escolhida;
  }
  if (opcoes.length === 1) return opcoes[0];
  throw new BadRequestException("Escolha uma das opções antes de aprovar.");
}

/**
 * A opção que vira reserva: a aprovada.
 *
 * Proposta aprovada antes das opções existirem não tem `opcaoAprovadaId`,
 * mas tem uma opção só (o backfill) — é ela. Aprovada com várias opções e
 * sem registro de qual foi escolhida não converte: adivinhar seria vender
 * outra festa.
 */
export function opcaoParaConverter<T extends { id: string; ordem: number }>(proposta: {
  numero: number;
  opcaoAprovadaId: string | null;
  opcoes: readonly T[];
}): T {
  if (proposta.opcaoAprovadaId) {
    const aprovada = proposta.opcoes.find((o) => o.id === proposta.opcaoAprovadaId);
    if (aprovada) return aprovada;
    throw new ConflictException(
      `A opção aprovada na proposta nº ${proposta.numero} não foi encontrada. A reserva não foi criada.`,
    );
  }
  if (proposta.opcoes.length === 1) return proposta.opcoes[0];
  throw new ConflictException(
    `A proposta nº ${proposta.numero} tem ${proposta.opcoes.length} opções e nenhuma registrada como escolhida. A reserva não foi criada.`,
  );
}

/**
 * Uma opção pronta para gravar: os campos dela e as linhas, sem ids. É o
 * mesmo formato para o que vem do formulário e para o que vem de uma
 * duplicação — as duas gravam pelo mesmo caminho.
 */
export type DadosDaOpcao = {
  ordem: number;
  nome: string;
  descricao: string | null;
  kitId: string | null;
  imagens: string[];
  subtotal: unknown;
  desconto: unknown;
  entrega: unknown;
  montagem: unknown;
  total: unknown;
  totalCalculado: unknown;
  valorFinalManual: boolean;
  itens: {
    tipo: string;
    productId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: unknown;
    total: unknown;
    imagemUrl: string | null;
    ordem: number;
  }[];
};

/** As opções do formulário, com os valores calculados aqui e não na tela. */
export function dadosDasOpcoes(opcoes: readonly OpcaoDoOrcamentoInput[]): DadosDaOpcao[] {
  return opcoes.map((opcao, ordem) => ({
    ordem,
    nome: opcao.nome.trim(),
    descricao: opcao.descricao?.trim() || null,
    kitId: opcao.kitId || null,
    imagens: [...opcao.imagens],
    ...totaisDaOpcao(opcao),
    itens: linhasDaOpcao(opcao.itens),
  }));
}
