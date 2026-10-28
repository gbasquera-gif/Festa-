/**
 * A referência visual de uma reserva: as fotos da decoração que a cliente viu
 * na proposta que deu origem a ela.
 *
 * Só as fotos guardadas na própria proposta. A capa do kit ou do tema, que a
 * página da proposta usa quando a opção não tem foto escolhida, fica de fora:
 * é dado do catálogo, que muda depois, e a equipe precisa do que foi
 * combinado com esta cliente.
 *
 * Qual opção vale:
 * - a aprovada (`opcaoAprovadaId`);
 * - sem registro de aprovada, a única opção — proposta aprovada antes das
 *   opções existirem tem uma só, criada a partir dela;
 * - sem registro e com várias opções, nenhuma: mostrar a opção errada para
 *   quem separa a festa é pior que não mostrar;
 * - proposta sem opção nenhuma usa as imagens da própria proposta (legado).
 */
export type PropostaDaReserva = {
  imagens: string[];
  opcaoAprovadaId: string | null;
  opcaoAprovadaNome: string | null;
  opcoes: { id: string; nome: string; imagens: string[] }[];
};

export type ReferenciaVisual = {
  /** O nome da opção aprovada, quando a proposta tinha mais de uma. */
  opcao: string | null;
  imagens: string[];
};

const SEM_REFERENCIA: ReferenciaVisual = { opcao: null, imagens: [] };

export function referenciaVisual(proposta: PropostaDaReserva | null): ReferenciaVisual {
  if (!proposta) return SEM_REFERENCIA;
  const { opcoes } = proposta;
  if (opcoes.length === 0) return { opcao: null, imagens: soEnderecos(proposta.imagens) };

  const aprovada = proposta.opcaoAprovadaId
    ? opcoes.find((o) => o.id === proposta.opcaoAprovadaId)
    : opcoes.length === 1
      ? opcoes[0]
      : undefined;
  if (!aprovada) return SEM_REFERENCIA;

  return {
    opcao: opcoes.length > 1 ? (proposta.opcaoAprovadaNome?.trim() || aprovada.nome) : null,
    imagens: soEnderecos(aprovada.imagens),
  };
}

/** Endereços de imagem utilizáveis, na ordem e sem repetição. */
function soEnderecos(imagens: string[]): string[] {
  const vistos = new Set<string>();
  return imagens
    .map((u) => u.trim())
    .filter((u) => /^(https?:\/\/|\/)/i.test(u) && !vistos.has(u) && Boolean(vistos.add(u)));
}
