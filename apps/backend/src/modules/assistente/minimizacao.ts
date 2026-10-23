/**
 * Contato e documento digitados na pergunta não vão para a IA externa.
 *
 * Os nomes que vêm do cadastro já saem como código ([C1], [F1]…). O que a
 * pessoa digita vai como foi escrito — é a pergunta —, mas e-mail, telefone,
 * CPF e CNPJ não ajudam a IA a responder nada (nenhuma ferramenta procura
 * cliente por contato) e são dado pessoal. Saem trocados por um aviso; o
 * resto da pergunta fica igual. Datas, valores e números de contrato não
 * têm o formato de telefone nem de documento e passam como estão.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// CNPJ antes de CPF: os 11 primeiros dígitos de um CNPJ sem pontuação também casariam com CPF.
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
// DDD com ou sem parênteses, +55 opcional, 8 ou 9 dígitos com hífen, ponto ou espaço.
const TELEFONE = /(?:\+?55[\s.-]?)?(?:\(\d{2}\)|\b\d{2})[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;

export function semContatoNemDocumento(texto: string): string {
  return texto
    .replace(EMAIL, "[e-mail omitido]")
    .replace(CNPJ, "[documento omitido]")
    .replace(CPF, "[documento omitido]")
    .replace(TELEFONE, "[telefone omitido]");
}
