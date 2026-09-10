import { z } from "zod";
import { EVENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from "../enums";
import { MANUAL_SALE_CHANNELS, SALE_CHANNELS } from "../sale-channels";
import { dataDaFestaSchema } from "../data-da-festa";

/**
 * Uma venda fechada fora da loja, digitada no painel.
 *
 * A maior parte das vendas da Festaê nasce numa conversa de WhatsApp, não no
 * app. Enquanto essas reservas viviam só na cabeça da equipe e num caderno,
 * duas coisas quebravam: o calendário da loja oferecia datas já vendidas, e
 * o material saía duas vezes no mesmo sábado.
 *
 * Por isso este formulário não é um cadastro paralelo: ele alimenta os mesmos
 * pedido, reserva e pagamento que a loja cria. Tudo que a loja confere antes
 * de aceitar uma reserva — capacidade do dia, estoque item a item — vale aqui
 * igual.
 */
export const manualReservationSchema = z.object({
  cliente: z.object({
    nome: z.string().min(2, "Diga o nome da cliente.").max(160),
    /**
     * Telefone é obrigatório mesmo com e-mail em branco: é por ele que a
     * operação fala com a cliente no dia, e uma reserva sem contato é uma
     * festa que ninguém consegue confirmar.
     */
    telefone: z.string().min(8, "Telefone é obrigatório.").max(30),
    whatsapp: z.string().max(30).optional(),
    email: z.string().email("E-mail inválido.").max(160).optional().or(z.literal("")),
  }),

  evento: z.object({
    data: dataDaFestaSchema,
    tipo: z.enum(EVENT_TYPES),
    themeId: z.string().cuid().optional().or(z.literal("")),
    guestCount: z.coerce.number().int().min(1).max(2000).optional(),
    observacoes: z.string().max(2000).optional(),
  }),

  produtos: z.object({
    kitId: z.string().cuid().optional().or(z.literal("")),
    /** Itens avulsos e unidades extras de itens do kit. */
    itens: z
      .array(
        z.object({
          productId: z.string().cuid(),
          quantity: z.coerce.number().int().min(1).max(999),
        }),
      )
      .default([]),
  }),

  logistica: z.object({
    fulfillment: z.enum(["PICKUP", "DELIVERY"]),
    assembly: z.boolean().default(false),
    endereco: z.string().max(255).optional(),
    bairro: z.string().max(120).optional(),
    cidade: z.string().max(120).optional(),
  }),

  financeiro: z.object({
    /**
     * O valor sai do painel, não do motor de preços.
     *
     * Deliberado: na venda por WhatsApp a Maria Luiza negocia — dá desconto,
     * arredonda, cobra uma taxa combinada. Recalcular por cima disso faria o
     * sistema discordar do que a cliente já ouviu e aceitou, e o registro
     * deixaria de valer como memória do acordo.
     */
    valorProdutos: z.coerce.number().min(0),
    entrega: z.coerce.number().min(0).default(0),
    montagem: z.coerce.number().min(0).default(0),
    desconto: z.coerce.number().min(0).default(0),
    sinal: z.coerce.number().min(0).default(0),
    formaPagamento: z.enum(PAYMENT_METHODS).default("PIX"),
    statusPagamento: z.enum(PAYMENT_STATUSES).default("PENDING"),
  }),

  /** Obrigatório: é a única chance de saber por onde esta venda entrou. */
  origem: z.enum(MANUAL_SALE_CHANNELS as unknown as [string, ...string[]]),
});

export type ManualReservationInput = z.infer<typeof manualReservationSchema>;

/**
 * Total da venda manual, em reais.
 *
 * Uma função só, usada pelo painel para mostrar e pelo servidor para gravar,
 * porque duas contas iguais escritas em lugares diferentes acabam diferentes.
 */
export function totalDaVendaManual(f: {
  valorProdutos: number;
  entrega?: number;
  montagem?: number;
  desconto?: number;
}): number {
  const bruto = f.valorProdutos + (f.entrega ?? 0) + (f.montagem ?? 0) - (f.desconto ?? 0);
  return Math.max(0, Math.round(bruto * 100) / 100);
}

/**
 * O desconto que estava embutido num pedido já gravado.
 *
 * O banco não guarda desconto: guarda as parcelas (produtos, entrega,
 * montagem) e o total combinado. Enquanto o pedido só era criado, isso
 * bastava — o desconto era a diferença e ninguém precisava dela de volta.
 *
 * A edição precisa. Reabrir o formulário sem reconstituir o desconto faria a
 * tela mostrar um total maior do que o que foi vendido, e a primeira gravação
 * aumentaria o preço de uma festa que a cliente já pagou. É a inversa exata
 * de `totalDaVendaManual`.
 */
export function descontoEmbutido(p: {
  valorProdutos: number;
  entrega?: number;
  montagem?: number;
  total: number;
}): number {
  const bruto = p.valorProdutos + (p.entrega ?? 0) + (p.montagem ?? 0);
  return Math.max(0, Math.round((bruto - p.total) * 100) / 100);
}

export const marcarTarefaSchema = z.object({
  key: z.string().min(1).max(60),
  done: z.boolean(),
});
export type MarcarTarefaInput = z.infer<typeof marcarTarefaSchema>;

/**
 * Correção de dados de uma reserva já registrada.
 *
 * Recorte deliberado: só campos que não mexem em agenda, estoque nem
 * dinheiro. Nome, telefone, endereço e observações são onde o erro de
 * digitação acontece e onde ele dói — telefone errado é a festa que ninguém
 * confirma no dia; endereço errado é a entrega no lugar errado.
 *
 * Data, itens e valores ficam de fora porque têm caminho próprio: mudar
 * qualquer um deles reconfere agenda e estoque, e isso é `editarReservaSchema`.
 * Aqui é o atalho para o que não move nada — e é atalho justamente por não
 * precisar tirar quem está atendendo da lista de festas do dia.
 */
export const corrigirDadosSchema = z.object({
  nome: z.string().min(2).max(160).optional(),
  telefone: z.string().min(8).max(30).optional(),
  endereco: z.string().max(255).optional().or(z.literal("")),
  bairro: z.string().max(120).optional().or(z.literal("")),
  observacoes: z.string().max(2000).optional().or(z.literal("")),
});
export type CorrigirDadosInput = z.infer<typeof corrigirDadosSchema>;

/**
 * Nova data de uma festa já reservada.
 *
 * Só a data. Mudar itens ou valores junto seria outra operação, com outras
 * conferências — e misturar as duas num formulário só é o caminho mais curto
 * para alguém remarcar e alterar o pedido sem perceber que fez as duas coisas.
 */
export const alterarDataSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD."),
});
export type AlterarDataInput = z.infer<typeof alterarDataSchema>;

/**
 * Edição completa de uma reserva já existente.
 *
 * Mesma forma da reserva manual, porque é a mesma festa sendo descrita — mas
 * com duas diferenças que vêm de a reserva já existir:
 *
 * 1. `origem` é opcional. Uma reserva nascida na loja tem origem WEB, e
 *    obrigar a operação a reescolher o canal para corrigir uma quantidade
 *    seria pedir que ela invente um dado que já existe.
 *
 * 2. O bloco financeiro não fala em pagamento recebido. Sinal já pago é
 *    registro de dinheiro que entrou, com referência no Mercado Pago; um
 *    formulário de edição não pode reescrever isso. O que muda aqui são os
 *    valores do pedido — e o saldo se ajusta sozinho.
 */
export const editarReservaSchema = manualReservationSchema
  .extend({
    origem: z.enum(SALE_CHANNELS as unknown as [string, ...string[]]).optional(),
    financeiro: z.object({
      valorProdutos: z.coerce.number().min(0),
      entrega: z.coerce.number().min(0).default(0),
      montagem: z.coerce.number().min(0).default(0),
      desconto: z.coerce.number().min(0).default(0),
    }),
  });

export type EditarReservaInput = z.infer<typeof editarReservaSchema>;
