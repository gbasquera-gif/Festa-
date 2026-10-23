// Dados fictícios da homologação de despesas. Nomes, contatos e documentos
// são inventados de propósito com cara de dado pessoal: a homologação confere
// que nenhum deles sai do servidor para a OpenAI.
//
// Datas relativas a hoje: mês passado inteiro e o dia 1º do mês atual (que
// sempre já passou).

/** Marca na descrição: a carga não se repete se já foi feita neste banco. */
export const MARCA = "[homologação]";

/** `mes`: "PASSADO" ou "ATUAL"; `dia`: dia do mês. */
export const DESPESAS_FICTICIAS = [
  { mes: "PASSADO", dia: 5, fornecedor: "Loja Fictícia de Balões", categoria: "Decoração Fictícia", natureza: "CONSUMO", valor: 320, descricao: "Balões metalizados" },
  { mes: "PASSADO", dia: 15, fornecedor: "Loja Fictícia de Balões", categoria: "Decoração Fictícia", natureza: "CONSUMO", valor: 180.5, descricao: "Reposição de balões" },
  { mes: "PASSADO", dia: 10, fornecedor: "Freelancer Paula Fictícia", categoria: "Mão de obra Fictícia", natureza: "CUSTEIO", valor: 450, descricao: "Pix para CPF 123.456.789-09 (Paula)" },
  { mes: "PASSADO", dia: 12, fornecedor: "Studio Helena Fictícia", categoria: "Marketing Fictício", natureza: "CUSTEIO", valor: 275, descricao: "Fotos; contato helena.ficticia@exemplo.invalid" },
  { mes: "PASSADO", dia: 20, fornecedor: "Gráfica Fictícia Kappa", categoria: "Marketing Fictício", natureza: "CUSTEIO", valor: 130, descricao: "Panfletos; tel (49) 99876-0003" },
  { mes: "PASSADO", dia: 22, fornecedor: "Atacado Fictício Ômega", categoria: "Decoração Fictícia", natureza: "CONSUMO", valor: 95.9, descricao: "Fitas e laços" },
  { mes: "ATUAL", dia: 1, fornecedor: "Loja Fictícia de Balões", categoria: "Decoração Fictícia", natureza: "CONSUMO", valor: 210, descricao: "Balões do mês" },
  { mes: "ATUAL", dia: 1, fornecedor: "Freelancer Paula Fictícia", categoria: "Mão de obra Fictícia", natureza: "CUSTEIO", valor: 150, descricao: "Pix para CPF 123.456.789-09 (Paula)" },
];

/**
 * O que nunca pode sair nos dados que o servidor manda à IA (resultados de
 * ferramenta e contexto), já normalizado: minúsculas, sem acento. Só pedaços
 * que existem apenas nestes nomes ("balões" não: pode ser nome de produto).
 */
export const NOMES_PROIBIDOS = ["fictic", "paula", "helena", "kappa", "omega", "freelancer"];
/** E em mensagem nenhuma, nem na pergunta: contato e documento. */
export const CONTATOS_PROIBIDOS = ["exemplo.invalid", "123.456.789", "12345678909", "99876"];

export const normalizar = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
