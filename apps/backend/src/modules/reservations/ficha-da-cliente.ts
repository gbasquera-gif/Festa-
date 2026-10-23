/**
 * Qual ficha de cliente uma venda usa, sem banco.
 *
 * O crédito Festaê é dinheiro da cliente guardado na Festaê: usá-lo na ficha
 * errada tira de uma pessoa e entrega a outra. A regra antiga (e-mail exato;
 * na falta dele, o telefone mais antigo) decidia sozinha em casos que não são
 * dela decidir — mãe e filha com o mesmo telefone, e-mail digitado com outra
 * capitalização, ficha antiga só com telefone e venda nova com e-mail. Aqui
 * esses casos viram pergunta: a operação escolhe a ficha, vendo as opções.
 */

/** Uma ficha que bate com o contato digitado. */
export type FichaCandidata = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  criadaEm: Date;
  /** O e-mail digitado é o desta ficha (sem diferenciar maiúsculas). */
  porEmail: boolean;
  /** O telefone digitado é o desta ficha (pelos dígitos). */
  porTelefone: boolean;
};

/** "nova": criar uma ficha nova mesmo havendo parecidas. */
export const FICHA_NOVA = "nova";

export type DecisaoDaFicha =
  | { tipo: "NOVA" }
  | { tipo: "EXISTENTE"; id: string }
  /** Mais de uma ficha possível, ou uma que diverge no e-mail: escolher. */
  | { tipo: "AMBIGUA"; candidatas: FichaCandidata[]; podeCriarNova: boolean }
  /** A escolha enviada não é uma das fichas possíveis para este contato. */
  | { tipo: "ESCOLHA_INVALIDA" };

const igualSemCaixa = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/**
 * A decisão.
 *
 * - Nenhuma ficha: nova.
 * - Uma ficha pelo e-mail: é ela.
 * - Uma ficha só pelo telefone: é ela, a menos que as duas tenham e-mail e
 *   os e-mails sejam diferentes — aí pode ser outra pessoa com o mesmo
 *   telefone, e a operação escolhe.
 * - Mais de uma: a operação escolhe.
 *
 * Ficha nova só pode ser escolhida quando nenhuma das existentes tem o e-mail
 * digitado: dois cadastros com o mesmo e-mail seriam a mesma pessoa partida
 * em duas, com o crédito de um invisível para o outro.
 */
export function decidirFicha(entrada: {
  emailDigitado?: string | null;
  candidatas: readonly FichaCandidata[];
  escolhida?: string | null;
}): DecisaoDaFicha {
  const { candidatas } = entrada;
  const podeCriarNova = !candidatas.some((c) => c.porEmail);

  if (entrada.escolhida) {
    if (entrada.escolhida === FICHA_NOVA) return podeCriarNova ? { tipo: "NOVA" } : { tipo: "ESCOLHA_INVALIDA" };
    return candidatas.some((c) => c.id === entrada.escolhida)
      ? { tipo: "EXISTENTE", id: entrada.escolhida }
      : { tipo: "ESCOLHA_INVALIDA" };
  }

  if (candidatas.length === 0) return { tipo: "NOVA" };
  if (candidatas.length === 1) {
    const [unica] = candidatas;
    if (unica.porEmail) return { tipo: "EXISTENTE", id: unica.id };
    const emailsDiferentes =
      Boolean(entrada.emailDigitado?.trim()) && Boolean(unica.email) && !igualSemCaixa(unica.email, entrada.emailDigitado);
    if (!emailsDiferentes) return { tipo: "EXISTENTE", id: unica.id };
  }
  return { tipo: "AMBIGUA", candidatas: ordenar(candidatas), podeCriarNova };
}

/** Quem bate pelo e-mail primeiro, depois pelos dois, depois a mais antiga. */
function ordenar(candidatas: readonly FichaCandidata[]): FichaCandidata[] {
  const peso = (c: FichaCandidata) => (c.porEmail ? 2 : 0) + (c.porTelefone ? 1 : 0);
  return [...candidatas].sort((a, b) => peso(b) - peso(a) || a.criadaEm.getTime() - b.criadaEm.getTime());
}
