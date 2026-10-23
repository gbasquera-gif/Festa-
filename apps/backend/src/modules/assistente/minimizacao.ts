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
// Número com marca de dinheiro ou de número de documento interno ("R$ ",
// "nº ", "#") não é contato: fica como está.
const NAO_E_CONTATO = String.raw`(?<!R\$\s?)(?<![nN][º°.]\s?)(?<!#\s?)`;
// CNPJ antes de CPF: os 11 primeiros dígitos de um CNPJ sem pontuação também casariam com CPF.
const CNPJ = new RegExp(String.raw`${NAO_E_CONTATO}\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b`, "g");
const CPF = new RegExp(String.raw`${NAO_E_CONTATO}\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b`, "g");
// Com DDD (com ou sem parênteses, com ou sem 0, +55 opcional), 8 ou 9 dígitos,
// o 9 da frente separado ou não: "(49) 9 9876-0001", "049 99876-0001".
const TELEFONE_COM_DDD = new RegExp(
  String.raw`${NAO_E_CONTATO}(?:\+?55[\s.-]?)?(?:\(0?\d{2}\)|\b0?\d{2})[\s.-]?(?:9[\s.]?)?\d{4}[\s.-]?\d{4}\b`,
  "g",
);
// Celular sem DDD, com separador antes dos 4 últimos: "99876-0001", "9 9876-0001".
const CELULAR_SEM_DDD = new RegExp(String.raw`${NAO_E_CONTATO}\b9[\s.]?\d{4}[\s.-]\d{4}\b`, "g");

/**
 * Troca contato e documento por avisos. Uma sequência de 10 ou 11 dígitos
 * sem marca de dinheiro tem forma de telefone ou CPF e sai omitida: na
 * dúvida, a privacidade vale mais que um número que nenhuma ferramenta usa.
 */
export function semContatoNemDocumento(texto: string): string {
  return texto
    .replace(EMAIL, "[e-mail omitido]")
    .replace(CNPJ, "[documento omitido]")
    .replace(CPF, "[documento omitido]")
    .replace(TELEFONE_COM_DDD, "[telefone omitido]")
    .replace(CELULAR_SEM_DDD, "[telefone omitido]");
}
