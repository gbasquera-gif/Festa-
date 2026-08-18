/**
 * Quanto de cada item está comprometido numa data.
 *
 * A agenda sempre soube contar festas por dia, mas não sabia contar coisas.
 * Com o limite de duas festas por dia, duas clientes podiam reservar o mesmo
 * sábado escolhendo o mesmo painel — o sistema aceitava as duas, e o conflito
 * só aparecia na hora de carregar o carro, com sinal pago dos dois lados.
 *
 * O cálculo é separado do serviço de propósito: é a regra que decide se a
 * Festaê consegue cumprir o que vendeu, e regra assim precisa de teste sem
 * banco por perto.
 */

/** Um pedido que ocupa a data: o kit escolhido e os itens avulsos. */
export interface PedidoComprometido {
  /** Itens que vêm dentro do kit, já com a quantidade de cada um. */
  itensDoKit: { productId: string; quantity: number }[];
  /** Itens pedidos à parte, além do que o kit inclui. */
  itensAvulsos: { productId: string; quantity: number }[];
}

/**
 * Este produto tem peça para alugar?
 *
 * Zero passou a significar "não tenho", e não "não preenchi". A leitura
 * anterior existia porque o campo nascia vazio e nenhum produto tinha número
 * digitado — tratar zero como esgotado fechava o calendário inteiro sem
 * explicação. Com o acervo cadastrado, o problema deixou de ser o campo em
 * branco e passou a ser o oposto: item que a Festaê não tem sendo aceito na
 * reserva.
 *
 * A troca só é honesta porque agora a loja diz o motivo — o item aparece como
 * esgotado antes de ser adicionado, e o calendário nomeia o que está
 * travando. Sem essa explicação, o zero voltaria a ser um calendário vermelho
 * mudo.
 */
export function temPecaDisponivel(estoque: number): boolean {
  return estoque > 0;
}

/** Item que faltou, com o número que a operação precisa enxergar. */
export interface Conflito {
  productId: string;
  nome: string;
  estoque: number;
  jaComprometido: number;
  pedido: number;
}

/**
 * Soma, por produto, tudo que os pedidos daquele dia comprometem.
 *
 * Kit e avulso somam no mesmo balde porque saem do mesmo estoque: a mesa que
 * vai dentro do Kit Essencial é a mesma mesa que alguém pediu como adicional.
 */
export function somarCompromisso(pedidos: PedidoComprometido[]): Map<string, number> {
  const total = new Map<string, number>();

  for (const pedido of pedidos) {
    for (const item of [...pedido.itensDoKit, ...pedido.itensAvulsos]) {
      total.set(item.productId, (total.get(item.productId) ?? 0) + item.quantity);
    }
  }

  return total;
}

/**
 * O que falta para atender mais um pedido nesta data.
 *
 * Devolve lista vazia quando cabe. Quando não cabe, devolve todos os itens em
 * falta — e não só o primeiro: quem está montando a festa merece saber de uma
 * vez o que precisa trocar, em vez de descobrir um problema por tentativa.
 *
 * `estoquePorProduto` sem o produto significa estoque não cadastrado. Nesse
 * caso o item passa: barrar por cadastro incompleto travaria a venda por um
 * campo que ninguém preencheu, que é pior do que o risco que evita.
 */
export function conflitosDoPedido(
  novoPedido: PedidoComprometido,
  jaComprometido: Map<string, number>,
  estoquePorProduto: Map<string, { nome: string; estoque: number }>,
): Conflito[] {
  const pedido = somarCompromisso([novoPedido]);
  const conflitos: Conflito[] = [];

  for (const [productId, quantidade] of pedido) {
    const produto = estoquePorProduto.get(productId);
    // Sem peça nenhuma o item nunca cabe: o conflito é reportado com
    // estoque 0 para a loja poder dizer "esgotado" em vez de "sem data".
    if (!produto) continue;

    const usado = jaComprometido.get(productId) ?? 0;
    if (usado + quantidade > produto.estoque) {
      conflitos.push({
        productId,
        nome: produto.nome,
        estoque: produto.estoque,
        jaComprometido: usado,
        pedido: quantidade,
      });
    }
  }

  return conflitos;
}

/** Frase que a cliente lê quando o item não cabe na data. */
export function mensagemDeConflito(conflitos: Conflito[]): string {
  const nomes = conflitos.map((c) => c.nome);
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;

  // Sem números de estoque: para a cliente eles não querem dizer nada e ainda
  // expõem o tamanho do acervo. O painel mostra o detalhe para a operação.
  return nomes.length === 1
    ? `${lista} já está reservado para esta data. Escolha outra data ou fale com a Festaê pelo WhatsApp.`
    : `${lista} já estão reservados para esta data. Escolha outra data ou fale com a Festaê pelo WhatsApp.`;
}
