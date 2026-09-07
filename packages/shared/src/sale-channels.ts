/**
 * Por onde a venda foi fechada.
 *
 * Não confundir com a origem de tráfego (utm_source). A UTM responde "que
 * divulgação trouxe essa pessoa até a loja"; o canal de venda responde "onde
 * o negócio foi fechado". Uma cliente pode ver o anúncio no Instagram, abrir
 * a loja e ainda assim combinar tudo por WhatsApp — são dois fatos, e juntar
 * os dois num campo só apagaria o mais acionável dos dois.
 */
export const SALE_CHANNELS = [
  "WEB",
  "WHATSAPP",
  "INSTAGRAM",
  "INDICACAO",
  "PRESENCIAL",
  "TELEFONE",
  "OUTRO",
] as const;

export type SaleChannel = (typeof SALE_CHANNELS)[number];

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  WEB: "Loja Web",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  INDICACAO: "Indicação",
  PRESENCIAL: "Presencial",
  TELEFONE: "Telefone",
  OUTRO: "Outro",
};

export function saleChannelLabel(canal: string): string {
  return SALE_CHANNEL_LABELS[canal as SaleChannel] ?? canal;
}

/**
 * Canais oferecidos no formulário de reserva manual.
 *
 * "Loja Web" fica de fora: uma reserva digitada à mão por definição não veio
 * da loja, e deixar a opção ali só cria a chance de a operação marcar errado
 * e sujar exatamente o número que este campo existe para produzir.
 */
export const MANUAL_SALE_CHANNELS = SALE_CHANNELS.filter(
  (canal) => canal !== "WEB",
) as Exclude<SaleChannel, "WEB">[];
