import { z } from "zod";
import { EVENT_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from "../enums";
import { MANUAL_SALE_CHANNELS } from "../sale-channels";

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
    data: z.coerce.date(),
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
 * Data, itens e valores ficam de fora de propósito. Mudar a data exigiria
 * reconferir capacidade ignorando a própria reserva (a trava de capacidade
 * ainda não sabe fazer isso) e mudar valores reescreveria o histórico de um
 * pagamento que pode já ter sido recebido. Para esses casos, o caminho
 * seguro continua sendo cancelar e registrar de novo.
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
