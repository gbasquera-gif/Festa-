import { z } from "zod";
import { EVENT_TYPES } from "./enums";
import { dataDaFestaSchema } from "./data-da-festa";
import { DEPOSIT_RATE, fromCentsInt, toCentsInt } from "./pricing";

/**
 * A proposta comercial da Festaê.
 *
 * O cálculo mora aqui, e não no backend nem na tela, porque o mesmo total
 * aparece em três lugares que não podem discordar: o formulário que a Maria
 * Luiza monta, o documento que a cliente abre no celular e o pedido que
 * nasce quando ela aprova. Dinheiro calculado em três lugares diverge no dia
 * em que alguém mexe num deles.
 */

export const STATUS_DO_ORCAMENTO = [
  "RASCUNHO",
  "ENVIADO",
  "APROVADO",
  "RECUSADO",
  "EXPIRADO",
] as const;
export type StatusDoOrcamento = (typeof STATUS_DO_ORCAMENTO)[number];

export const STATUS_DO_ORCAMENTO_LABEL: Record<StatusDoOrcamento, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
};

export const STATUS_DO_ORCAMENTO_NOTA: Record<StatusDoOrcamento, string> = {
  RASCUNHO: "ainda sendo montado — a cliente não viu",
  ENVIADO: "link na mão da cliente, aguardando resposta",
  APROVADO: "aceito pela cliente",
  RECUSADO: "a cliente não seguiu",
  EXPIRADO: "passou da validade sem resposta",
};

export const TIPOS_DA_LINHA = [
  "KIT",
  "PRODUTO",
  "BALOES",
  "SERVICO",
  "MONTAGEM",
  "ENTREGA",
  "MANUAL",
] as const;
export type TipoDaLinha = (typeof TIPOS_DA_LINHA)[number];

export const TIPO_DA_LINHA_LABEL: Record<TipoDaLinha, string> = {
  KIT: "Kit",
  PRODUTO: "Peça",
  BALOES: "Balões",
  SERVICO: "Serviço",
  MONTAGEM: "Montagem",
  ENTREGA: "Entrega",
  MANUAL: "Item personalizado",
};

export type LinhaDoOrcamento = {
  tipo: TipoDaLinha;
  productId?: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
};

export type TotaisDoOrcamento = {
  subtotal: number;
  desconto: number;
  entrega: number;
  montagem: number;
  total: number;
};

/**
 * A conta da proposta, em centavos.
 *
 * Centavos porque 3 × 16,65 em ponto flutuante dá 49,949999999999996, e uma
 * proposta que soma um centavo a menos que a soma das suas linhas é uma
 * proposta que a cliente confere e desconfia.
 *
 * O total nunca fica negativo: desconto maior que o subtotal é erro de
 * digitação, e devolver "-R$ 80,00" como investimento seria transformar um
 * engano em promessa.
 */
export function calcularOrcamento(
  linhas: readonly LinhaDoOrcamento[],
  desconto = 0,
  entrega = 0,
  montagem = 0,
): TotaisDoOrcamento {
  const subtotalEmCentavos = linhas.reduce(
    (soma, l) => soma + toCentsInt(l.valorUnitario) * Math.max(0, Math.trunc(l.quantidade)),
    0,
  );
  const descontoEmCentavos = Math.min(toCentsInt(desconto), subtotalEmCentavos);
  const totalEmCentavos =
    subtotalEmCentavos - descontoEmCentavos + toCentsInt(entrega) + toCentsInt(montagem);

  return {
    subtotal: fromCentsInt(subtotalEmCentavos),
    desconto: fromCentsInt(descontoEmCentavos),
    entrega: fromCentsInt(toCentsInt(entrega)),
    montagem: fromCentsInt(toCentsInt(montagem)),
    total: fromCentsInt(Math.max(0, totalEmCentavos)),
  };
}

/** O total de uma linha, com a mesma regra de centavos. */
export function totalDaLinha(linha: LinhaDoOrcamento): number {
  return fromCentsInt(toCentsInt(linha.valorUnitario) * Math.max(0, Math.trunc(linha.quantidade)));
}

/**
 * A situação real da proposta, já considerando a validade.
 *
 * EXPIRADO não é gravado por um relógio: é derivado na leitura. Um status
 * que depende do tempo e fica guardado no banco começa a mentir no minuto
 * seguinte ao vencimento e só se corrige quando alguém roda alguma coisa.
 */
export function situacaoDoOrcamento(
  status: StatusDoOrcamento,
  validoAte: Date | string,
  agora: Date,
): StatusDoOrcamento {
  if (status !== "ENVIADO") return status;
  return new Date(validoAte).getTime() < agora.getTime() ? "EXPIRADO" : "ENVIADO";
}

/** Só proposta enviada e dentro da validade pode ser aprovada pela cliente. */
export function podeSerAprovada(
  status: StatusDoOrcamento,
  validoAte: Date | string,
  agora: Date,
): boolean {
  return situacaoDoOrcamento(status, validoAte, agora) === "ENVIADO";
}

/**
 * Proposta que já saiu não se reescreve por cima.
 *
 * Editar cria uma versão nova e devolve a proposta ao rascunho, guardando a
 * anterior. Sem isso, "combinamos R$ 1.200" viraria uma frase sem prova.
 */
export function exigeNovaVersao(status: StatusDoOrcamento): boolean {
  return status !== "RASCUNHO";
}

/**
 * O sinal que reserva a data.
 *
 * O percentual vem do painel, e cada proposta pode ter o seu: a taxa padrão
 * resolve o caso comum, e a exceção existe de verdade — festa grande com
 * entrada menor, cliente antiga com condição combinada. Fixar 30% no código
 * obrigaria um deploy para honrar um acordo feito no WhatsApp.
 *
 * O arredondamento é o mesmo de `splitPayment`, em centavos: o sinal de uma
 * proposta e o sinal de uma reserva têm de dar o mesmo número, senão a
 * cliente paga um valor e o sistema cobra outro.
 */
export function calcularSinal(
  total: number,
  percentual?: number | null,
): { percentual: number; valor: number; saldo: number } {
  const taxa = percentual === null || percentual === undefined ? DEPOSIT_RATE * 100 : percentual;
  const limitada = Math.min(100, Math.max(0, taxa));
  const totalEmCentavos = toCentsInt(total);
  const sinalEmCentavos = Math.round((totalEmCentavos * limitada) / 100);
  return {
    percentual: limitada,
    valor: fromCentsInt(sinalEmCentavos),
    saldo: fromCentsInt(totalEmCentavos - sinalEmCentavos),
  };
}

export const linhaDoOrcamentoSchema = z.object({
  tipo: z.enum(TIPOS_DA_LINHA).default("PRODUTO"),
  productId: z.string().cuid().optional().or(z.literal("")).or(z.null()),
  descricao: z.string().min(2, "Descreva o item.").max(200),
  quantidade: z.coerce.number().int().min(1).max(999).default(1),
  valorUnitario: z.coerce.number().min(0).max(1_000_000),
  imagemUrl: z.string().max(500).optional().or(z.literal("")),
});

export const orcamentoSchema = z.object({
  cliente: z.object({
    userId: z.string().cuid().optional().or(z.literal("")),
    nome: z.string().min(2, "Diga o nome da cliente.").max(160),
    telefone: z.string().min(8, "Telefone é obrigatório.").max(30),
    email: z.string().email("E-mail inválido.").max(160).optional().or(z.literal("")),
  }),
  festa: z.object({
    data: dataDaFestaSchema,
    tipo: z.enum(EVENT_TYPES).default("ANIVERSARIO"),
    cidade: z.string().max(120).default("Chapecó"),
    local: z.string().max(200).optional().or(z.literal("")),
    convidados: z.coerce.number().int().min(1).max(2000).optional(),
    observacoes: z.string().max(2000).optional().or(z.literal("")),
  }),
  proposta: z.object({
    themeId: z.string().cuid().optional().or(z.literal("")),
    kitId: z.string().cuid().optional().or(z.literal("")),
    imagens: z.array(z.string().max(500)).max(12).default([]),
    /** Dias de validade a partir de hoje. */
    validadeEmDias: z.coerce.number().int().min(1).max(180).default(15),
    /**
     * Mostrar o preço de cada linha para a cliente.
     *
     * Desligado por padrão: preço item a item convida a desmontar o conjunto
     * e comparar peça por peça com quem não monta nem entrega. O que está à
     * venda é a festa pronta.
     */
    mostrarValoresIndividuais: z.coerce.boolean().default(false),
    /**
     * Percentual do sinal desta proposta. Vazio usa o padrão do painel —
     * gravar a taxa em toda proposta faria a mudança do padrão não alcançar
     * nenhuma delas.
     */
    percentualDoSinal: z.coerce.number().min(0).max(100).optional(),
  }),
  itens: z.array(linhaDoOrcamentoSchema).min(1, "A proposta precisa de ao menos um item."),
  valores: z.object({
    desconto: z.coerce.number().min(0).default(0),
    entrega: z.coerce.number().min(0).default(0),
    montagem: z.coerce.number().min(0).default(0),
  }),
});
export type OrcamentoInput = z.infer<typeof orcamentoSchema>;

/**
 * O aceite da cliente.
 *
 * Pede o nome de quem está aprovando — é a evidência mínima de manifestação,
 * e a tela diz que é isso, não assinatura eletrônica com valor jurídico.
 * Prometer mais do que se entrega num aceite é pior do que não prometer.
 */
export const aprovarPropostaSchema = z.object({
  nome: z.string().min(2, "Diga seu nome para confirmar.").max(160),
});
export type AprovarPropostaInput = z.infer<typeof aprovarPropostaSchema>;

export const recusarOrcamentoSchema = z.object({
  motivo: z.string().max(500).optional().or(z.literal("")),
});

/**
 * O primeiro nome de quem vai receber a mensagem.
 *
 * O cadastro guarda o nome completo porque é ele que vai no contrato. Na
 * conversa, chamar a cliente pelo nome inteiro soa a cobrança — então a
 * mensagem usa só o primeiro. Nome vazio não vira "Oi, !": a saudação some.
 */
export function primeiroNome(nomeCompleto: string): string {
  return nomeCompleto.trim().split(/\s+/)[0] ?? "";
}

/**
 * A mensagem que a Maria Luiza cola no WhatsApp.
 *
 * Copiar só a URL deixava para ela escrever o recado toda vez — e o recado é
 * parte da venda: diz o que é o link e que dá para aprovar por ali. Fica aqui,
 * e não na tela, porque é texto de negócio e precisa de teste.
 */
export function mensagemDaProposta(cliente: string, link: string): string {
  const nome = primeiroNome(cliente);
  return [
    `${nome ? `Oi, ${nome}!` : "Oi!"} 💛 Preparamos uma proposta para a sua festa.`,
    "",
    "Acesse o link abaixo para conferir. Se gostar, você pode aprovar por lá e já visualizar os dados para o sinal e reserva da data:",
    link,
  ].join("\n");
}
