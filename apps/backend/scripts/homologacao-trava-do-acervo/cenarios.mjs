// Cenários da trava única do acervo contra o servidor de homologação (banco
// LOCAL, dados fictícios). Uso: ver README.md.
//
// Todo pedido passa pela API HTTP de verdade: loja, venda manual, edição,
// remarcação, link da proposta, conversão e calendário. As rotas /__trv/*
// só montam o cenário e seguram linhas do banco por um instante — é isso que
// faz duas operações se cruzarem entre a conferência e a gravação, em vez de
// depender da sorte. Cada cenário usa um dia e peças só dele, e termina
// conferindo a regra que não pode quebrar: nada comprometido além do acervo.

const BASE = process.env.BASE ?? "http://localhost:3350";
const API = `${BASE}/api/v1`;

let ok = 0;
let falhas = 0;
function conferir(nome, cond, extra) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✗ ${nome}`, extra !== undefined ? JSON.stringify(extra).slice(0, 900) : "");
  }
}
async function http(metodo, url, corpo, token) {
  const inicio = Date.now();
  const r = await fetch(url, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  return { status: r.status, json, texto, ms: Date.now() - inicio };
}
const aux = async (metodo, caminho, corpo) => {
  const r = await http(metodo, BASE + caminho, corpo);
  if (r.status !== 200) throw new Error(`${caminho}: ${r.status} ${r.texto}`);
  return r.json;
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const { token: ADMIN } = await aux("GET", "/__trv/token?papel=ADMIN");
const req = (metodo, caminho, corpo, token = ADMIN) => http(metodo, API + caminho, corpo, token);
/** O corpo de erro do Nest traz o objeto da exceção no topo ou dentro de `message`. */
const erro = (r) => (r.json && typeof r.json.message === "object" ? r.json.message : r.json ?? {});
const deu = (r) => r.status === 200 || r.status === 201;
const resumo = (rs) => rs.map((r) => [r.status, typeof erro(r).message === "string" ? erro(r).message.slice(0, 90) : erro(r).codigo]);

const suf = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]).slice(-5);
let proximoDia = 40;
const novoDia = () => new Date(Date.now() + proximoDia++ * 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const telefone = () => `0048${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;

const produto = async (nome, estoque) => ({
  nome: `${nome} ${suf}`,
  ...(await aux("POST", "/__trv/produto", { nome: `${nome} ${suf}`, estoque })),
});
const kitCom = (nome, p, quantidade = 1) =>
  aux("POST", "/__trv/kit", { nome: `${nome} ${suf}`, pecas: [{ produtoId: p.id, quantidade }] });

/** Um carrinho da loja (cliente nova, kit escolhido), pronto para virar reserva. */
async function carrinho(data, kit) {
  const cliente = await aux("GET", "/__trv/token?papel=CLIENT&nome=Cliente%20Loja");
  const c = await aux("POST", "/__trv/carrinho", { clienteId: cliente.id, data, kitId: kit.id });
  return { ...c, token: cliente.token };
}
const pedirNaLoja = (c) => req("POST", `/events/${c.eventId}/reservation`, {}, c.token);

const corpoDaVenda = (data, itens) => ({
  cliente: { nome: `Cliente Venda ${suf}`, telefone: telefone() },
  evento: { data, tipo: "ANIVERSARIO" },
  produtos: { itens: itens.map(([p, quantity]) => ({ productId: p.id, quantity })) },
  logistica: { fulfillment: "PICKUP", assembly: false },
  financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
  origem: "WHATSAPP",
});
const venderNoBalcao = (data, itens) => req("POST", "/reservations/manual", corpoDaVenda(data, itens));
async function vendaRegistrada(data, itens) {
  const corpo = corpoDaVenda(data, itens);
  const r = await req("POST", "/reservations/manual", corpo);
  if (!deu(r)) throw new Error(`venda: ${r.status} ${r.texto}`);
  return { id: r.json.id, corpo };
}
/** A reserva como o painel a abre (GET /reservations/:id): traz a versão. */
const reservaNoPainel = async (id) => (await req("GET", `/reservations/${id}`)).json;
const corpoDaEdicao = (venda, { data, itens, observacoes }) => ({
  cliente: venda.corpo.cliente,
  evento: { data, tipo: "ANIVERSARIO", ...(observacoes ? { observacoes } : {}) },
  produtos: { itens: itens.map(([p, quantity]) => ({ productId: p.id, quantity })) },
  logistica: venda.corpo.logistica,
  financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0 },
});
/**
 * Edição como o painel faz: manda a versão da reserva que estava na tela
 * quando o formulário abriu. Sem `versao`, abre o formulário agora (versão
 * atual); com `versao`, simula uma tela aberta antes.
 */
const editarCom = async (venda, { data, itens, observacoes, versao }) =>
  req("PATCH", `/reservations/${venda.id}`, {
    ...corpoDaEdicao(venda, { data, itens, observacoes }),
    versao: versao ?? (await reservaNoPainel(venda.id)).versao,
  });
const editar = (venda, data, itens) => editarCom(venda, { data, itens });
/** Remarcação como o painel faz: manda a data que a pessoa estava vendo. */
const remarcar = async (id, data, dataAtual) =>
  req("PATCH", `/reservations/${id}/data`, {
    data,
    dataAtual: dataAtual ?? String((await reservaNoPainel(id)).eventDate).slice(0, 10),
  });
const pagar = (id) => req("POST", `/reservations/${id}/pagamentos`, { tipo: "DEPOSIT", valor: 30, forma: "PIX" });

const linha = (p, quantidade) => ({ tipo: "PRODUTO", productId: p.id, descricao: p.nome, quantidade, valorUnitario: 50 });
async function propostaCriada(data, itens) {
  const r = await req("POST", "/orcamentos", {
    cliente: { nome: `Cliente Proposta ${suf}`, telefone: telefone() },
    festa: { data, tipo: "ANIVERSARIO", cidade: "Chapecó" },
    proposta: { validadeEmDias: 15, canal: null },
    opcoes: [
      {
        nome: "Opcao unica",
        imagens: [],
        itens: itens.map(([p, q]) => linha(p, q)),
        valores: { desconto: 0, entrega: 0, montagem: 0, valorFinal: null },
      },
    ],
  });
  if (!deu(r)) throw new Error(`proposta: ${r.status} ${r.texto}`);
  return { id: r.json.id };
}
const enviarProposta = (id) => req("PATCH", `/orcamentos/${id}/enviar`);
async function propostaEnviada(data, itens) {
  const { id } = await propostaCriada(data, itens);
  const e = await enviarProposta(id);
  if (!deu(e)) throw new Error(`enviar: ${e.status} ${e.texto}`);
  const o = await aux("GET", `/__trv/orcamento?id=${id}`);
  return { id, token: o.token, numero: o.numero };
}
const aprovarPeloLink = (p) => http("POST", `${API}/proposta/${p.token}/aprovar`, { nome: "Cliente da Proposta" });
async function propostaAprovada(data, itens) {
  const p = await propostaEnviada(data, itens);
  const a = await aprovarPeloLink(p);
  if (!deu(a)) throw new Error(`aprovar: ${a.status} ${a.texto}`);
  return p;
}
const converter = (p) => req("POST", `/orcamentos/${p.id}/converter`, { canal: "WHATSAPP" });

/**
 * Segura as linhas e dispara as operações enquanto estão seguras: cada uma
 * passa da conferência e fica parada antes de gravar. Soltas, gravam — a não
 * ser que a trava do dia as faça passar uma de cada vez.
 */
async function cruzar(tabela, ids, disparos, ms = 1500) {
  const trava = aux("POST", "/__trv/segurar", { tabela, ids, ms });
  for (let i = 0; i < 100 && (await aux("GET", "/__trv/segurando")).segurando === 0; i++) await esperar(10);
  const resultados = await Promise.all(
    disparos.map(async ([aposMs, fn]) => {
      await esperar(aposMs);
      return fn();
    }),
  );
  await trava;
  return resultados;
}
const acervo = (p, dia) => aux("GET", `/__trv/acervo?produtoId=${p.id}&dia=${dia}`);
async function semExcesso(nome, p, dia) {
  const a = await acervo(p, dia);
  conferir(
    `${nome}: comprometido no dia (reservas ${a.emReservas} + propostas aprovadas ${a.emPropostas}) não passa do acervo (${a.estoque})`,
    a.emReservas + a.emPropostas <= a.estoque,
    a,
  );
  return a;
}

// ----------------------------------------------------------------------------
console.log("1. Loja × loja: dois pedidos pela última unidade, no mesmo instante");
{
  const D = novoDia();
  const p = await produto("Painel Unico", 1);
  const k = await kitCom("Kit Painel", p);
  const c1 = await carrinho(D, k);
  const c2 = await carrinho(D, k);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => pedirNaLoja(c1)],
    [0, () => pedirNaLoja(c2)],
  ]);
  conferir("só um pedido vira reserva; o outro recebe 409", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  await semExcesso("loja × loja", p, D);
}

console.log("2. Venda manual × venda manual: a última unidade, no mesmo instante");
{
  const D = novoDia();
  const p = await produto("Mesa Unica", 1);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => venderNoBalcao(D, [[p, 1]])],
    [0, () => venderNoBalcao(D, [[p, 1]])],
  ]);
  const recusa = rs.find((r) => r.status === 409);
  conferir("só uma venda entra; a outra recebe 409", rs.filter(deu).length === 1 && Boolean(recusa), resumo(rs));
  conferir(
    "a recusa traz o detalhe da falta e a reserva que levou a peça",
    recusa && erro(recusa).conflitos?.[0]?.disponivel === 0 && erro(recusa).conflitos?.[0]?.reservasEmChoque?.length === 1,
    recusa && erro(recusa),
  );
  await semExcesso("venda × venda", p, D);
}

console.log("3. Loja × venda manual: canais diferentes, a mesma peça, no mesmo instante");
{
  const D = novoDia();
  const p = await produto("Arco Unico", 1);
  const k = await kitCom("Kit Arco", p);
  const c = await carrinho(D, k);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => pedirNaLoja(c)],
    [0, () => venderNoBalcao(D, [[p, 1]])],
  ]);
  conferir("só um dos dois canais leva a peça", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  await semExcesso("loja × venda", p, D);
}

console.log("4. Loja × aprovação pelo link: a loja chega primeiro, a aprovação logo depois");
{
  const D = novoDia();
  const p = await produto("Cilindro Unico", 1);
  const k = await kitCom("Kit Cilindro", p);
  const c = await carrinho(D, k);
  const prop = await propostaEnviada(D, [[p, 1]]);
  const [loja, aprov] = await cruzar("produtos", [p.id], [
    [0, () => pedirNaLoja(c)],
    [400, () => aprovarPeloLink(prop)],
  ]);
  conferir("a loja leva a peça", deu(loja), resumo([loja]));
  conferir(
    "a aprovação que chega depois é recusada por falta (409 FALTA_DE_MATERIAL), sem número de estoque",
    aprov.status === 409 && erro(aprov).codigo === "FALTA_DE_MATERIAL" && !/\d/.test(String(erro(aprov).message).replace(suf, "")),
    resumo([aprov]),
  );
  await semExcesso("loja × aprovação", p, D);
}

console.log("5. A loja respeita proposta aprovada aguardando sinal");
{
  const D = novoDia();
  const p = await produto("Bandeja Unica", 1);
  const k = await kitCom("Kit Bandeja", p);
  await propostaAprovada(D, [[p, 1]]);
  const c = await carrinho(D, k);
  const r = await pedirNaLoja(c);
  conferir("o pedido da loja é recusado (409)", r.status === 409, resumo([r]));
  conferir(
    "a cliente lê só o nome da peça, sem números do acervo",
    typeof r.json?.message === "string" && r.json.message.includes("já está reservado") && !/\d/.test(r.json.message.replace(suf, "")),
    r.json,
  );
  await semExcesso("loja × proposta aprovada", p, D);
}

console.log("6. A venda manual respeita proposta aprovada aguardando sinal");
{
  const D = novoDia();
  const p = await produto("Boleira Unica", 1);
  const prop = await propostaAprovada(D, [[p, 1]]);
  const r = await venderNoBalcao(D, [[p, 1]]);
  const c = erro(r).conflitos?.[0];
  conferir("a venda é recusada (409)", r.status === 409, resumo([r]));
  conferir(
    "o painel vê qual proposta segura a peça (número e cliente)",
    c?.propostasEmChoque?.[0]?.numero === prop.numero && c?.propostasEmChoque?.[0]?.cliente === `Cliente Proposta ${suf}`,
    c,
  );
  await semExcesso("venda × proposta aprovada", p, D);
}

console.log("7. O calendário da loja mostra o dia segurado por proposta aprovada");
{
  const D = novoDia();
  const p = await produto("Totem Unico", 1);
  const k = await kitCom("Kit Totem", p);
  await propostaAprovada(D, [[p, 1]]);
  const mes = D.slice(0, 7);
  const r = await http("GET", `${API}/availability?month=${mes}&kitId=${k.id}`);
  const dia = (r.json ?? []).find((d) => d.date === D);
  const outro = (r.json ?? []).find((d) => d.date !== D);
  conferir("o dia aparece indisponível, com a peça em falta", dia?.available === false && dia?.itensIndisponiveis?.[0]?.productId === p.id, dia);
  conferir("os outros dias do mês continuam livres", outro?.available === true, outro);
}

console.log("8. Conversão: a proposta aprovada não disputa a peça consigo mesma");
{
  const D = novoDia();
  const p = await produto("Painel Conversao", 1);
  const prop = await propostaAprovada(D, [[p, 1]]);
  const r = await converter(prop);
  const o = await aux("GET", `/__trv/orcamento?id=${prop.id}`);
  conferir("a conversão passa", deu(r) && Boolean(r.json?.reservaId), resumo([r]));
  conferir("a proposta aponta para a reserva criada", o.reservationId === r.json?.reservaId, o);
  const a = await semExcesso("conversão", p, D);
  conferir("a peça passa a contar pela reserva, não mais pela proposta", a.emReservas === 1 && a.emPropostas === 0, a);
}

console.log("9. Conversão em dobro (dois cliques): uma proposta, uma reserva");
{
  const D = novoDia();
  const p = await produto("Mesa Conversao", 5);
  const prop = await propostaAprovada(D, [[p, 1]]);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => converter(prop)],
    [0, () => converter(prop)],
  ]);
  const a = await acervo(p, D);
  conferir("só uma conversão grava; a outra recebe 409", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  conferir("existe uma reserva só para a proposta", a.reservas === 1, a);
}

console.log("10. A edição de reserva respeita proposta aprovada");
{
  const D = novoDia();
  const p = await produto("Cortina Edicao", 2);
  const venda = await vendaRegistrada(D, [[p, 1]]);
  const prop = await propostaAprovada(D, [[p, 1]]);
  const r = await editar(venda, D, [[p, 2]]);
  conferir("aumentar para 2 é recusado (409)", r.status === 409, resumo([r]));
  conferir("o detalhe aponta a proposta que segura a peça", erro(r).conflitos?.[0]?.propostasEmChoque?.[0]?.numero === prop.numero, erro(r));
  await semExcesso("edição × proposta aprovada", p, D);
}

console.log("11. A remarcação respeita proposta aprovada no dia novo");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Arco Remarcacao", 1);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  await propostaAprovada(D2, [[p, 1]]);
  const r = await remarcar(venda.id, D2);
  const depois = await aux("GET", `/__trv/reserva?id=${venda.id}`);
  conferir("a remarcação é recusada (409)", r.status === 409, resumo([r]));
  conferir("a reserva continua no dia de antes", depois.eventDate.slice(0, 10) === D1, depois);
  await semExcesso("remarcação × proposta aprovada", p, D2);
}

console.log("12. Remarcação × remarcação para o mesmo dia, no mesmo instante");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const D3 = novoDia();
  const p = await produto("Painel Remarcacao", 1);
  const v1 = await vendaRegistrada(D1, [[p, 1]]);
  const v2 = await vendaRegistrada(D2, [[p, 1]]);
  const rs = await cruzar("reservas", [v1.id, v2.id], [
    [0, () => remarcar(v1.id, D3)],
    [0, () => remarcar(v2.id, D3)],
  ]);
  conferir("só uma das duas vai para o dia novo; a outra recebe 409", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  await semExcesso("remarcação × remarcação", p, D3);
}

console.log("13. Edição × venda manual: a mesma peça, no mesmo dia, no mesmo instante");
{
  const D = novoDia();
  const p = await produto("Bolo Edicao", 2);
  const venda = await vendaRegistrada(D, [[p, 1]]);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => editar(venda, D, [[p, 2]])],
    [0, () => venderNoBalcao(D, [[p, 1]])],
  ]);
  conferir("só uma das duas operações leva a segunda unidade", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  await semExcesso("edição × venda", p, D);
}

console.log("14. Remarcações em sentidos opostos (D1→D2 e D2→D1) ao mesmo tempo: sem travamento");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Mesa Troca", 10);
  const v1 = await vendaRegistrada(D1, [[p, 1]]);
  const v2 = await vendaRegistrada(D2, [[p, 1]]);
  const inicio = Date.now();
  const rs = await cruzar("reservas", [v1.id, v2.id], [
    [0, () => remarcar(v1.id, D2)],
    [0, () => remarcar(v2.id, D1)],
  ]);
  conferir("as duas remarcações passam", rs.every(deu), resumo(rs));
  conferir("nenhuma espera além da trava do teste (sem impasse)", Date.now() - inicio < 6_000, Date.now() - inicio);
}

console.log("15. Edição e pagamento manual na mesma reserva, ao mesmo tempo: sem travamento");
{
  const D = novoDia();
  const p = await produto("Cadeira Pagamento", 5);
  const venda = await vendaRegistrada(D, [[p, 1]]);
  const inicio = Date.now();
  const rs = await cruzar("reservas", [venda.id], [
    [0, () => editar(venda, D, [[p, 2]])],
    [100, () => pagar(venda.id)],
  ]);
  conferir("edição e pagamento passam", rs.every(deu), resumo(rs));
  conferir("nenhuma espera além da trava do teste (sem impasse)", Date.now() - inicio < 6_000, Date.now() - inicio);
}

console.log("16. A tela da proposta continua somando as aprovadas como antes");
{
  const D = novoDia();
  const p = await produto("Painel Proposta", 1);
  const primeira = await propostaAprovada(D, [[p, 1]]);
  const segunda = await propostaCriada(D, [[p, 1]]);
  const d = (await req("GET", `/orcamentos/${segunda.id}/disponibilidade`)).json;
  conferir(
    "a segunda proposta aparece sem a peça, segurada pela primeira",
    d?.opcoes?.[0]?.disponivel === false && d?.seguradoPor?.some((x) => x.id === primeira.id),
    d,
  );
  const e = await enviarProposta(segunda.id);
  if (e.status === 409) {
    // Com a conferência no envio (entrega A), a recusa vem já no envio.
    conferir(
      "o envio é recusado, apontando a proposta aprovada que segura a peça",
      erro(e).codigo === "OPCOES_INDISPONIVEIS" &&
        erro(e).opcoes?.[0]?.faltas?.[0]?.responsaveis?.some((x) => x.tipo === "PROPOSTA" && x.id === primeira.id),
      erro(e),
    );
  } else {
    const o = await aux("GET", `/__trv/orcamento?id=${segunda.id}`);
    const a = await aprovarPeloLink({ token: o.token });
    conferir("e não pode ser aprovada (409 FALTA_DE_MATERIAL)", a.status === 409 && erro(a).codigo === "FALTA_DE_MATERIAL", resumo([a]));
  }
}

// ----------------------------------------------------------------------------
// Data da festa: a da reserva e a do evento andam juntas.
const datas = (reservaId) => aux("GET", `/__trv/datas?reservaId=${reservaId}`);
/** A festa como a tela Eventos a abre. */
const festaNoPainel = async (eventId) => (await req("GET", `/events/${eventId}`)).json;
const comoEstava = (festa, campos) =>
  Object.fromEntries(campos.map((c) => [c, c === "date" ? String(festa.date).slice(0, 10) : (festa[c] ?? null)]));
/**
 * Eventos → "Editar festa". Pelo painel (ADMIN), manda como os campos
 * estavam quando a tela abriu: sem `antes`, abre a tela agora; com `antes`,
 * simula uma tela aberta antes; `antes: null` simula o painel antigo. Pelo
 * login da cliente, não manda nada (o app instalado não manda).
 */
const corrigirFesta = async (eventId, corpo, token = ADMIN, antes) => {
  if (token !== ADMIN || antes === null) return req("PATCH", `/events/${eventId}`, corpo, token);
  const ref = antes ?? comoEstava(await festaNoPainel(eventId), Object.keys(corpo));
  return req("PATCH", `/events/${eventId}`, { ...corpo, antes: ref }, token);
};
async function datasConsistentes(nome, reservaId) {
  const d = await datas(reservaId);
  conferir(`${nome}: data da reserva e data do evento iguais (${d.reserva})`, d.reserva === d.evento, d);
  return d;
}

console.log("17. Eventos → Corrigir festa com reserva ativa: a data não muda sozinha");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Painel Corrigir", 1);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const { eventId } = await datas(venda.id);
  const r = await corrigirFesta(eventId, { date: D2 });
  conferir(
    "mudar o dia é recusado (409 DATA_DA_FESTA_COM_RESERVA), apontando a reserva",
    r.status === 409 && erro(r).codigo === "DATA_DA_FESTA_COM_RESERVA" && erro(r).reservaId === venda.id,
    resumo([r]),
  );
  conferir("a mensagem orienta a remarcar pela reserva", String(erro(r).message).includes("Alterar data da festa"), erro(r).message);
  const d = await datasConsistentes("depois da recusa", venda.id);
  conferir("nada mudou: a festa continua no dia de antes", d.reserva === D1, d);
  const outros = await corrigirFesta(eventId, { guestCount: 80 });
  conferir("os outros campos (convidados) continuam editáveis", deu(outros), resumo([outros]));
  const a2 = await acervo(p, D2);
  conferir("o dia pedido continua livre para outra venda (a peça segue no dia da reserva)", a2.emReservas === 0, a2);
}

console.log("18. A cliente não contorna pela mesma rota, com o próprio login");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Arco Cliente", 1);
  const k = await kitCom("Kit Cliente", p);
  const c = await carrinho(D1, k);
  const pedido = await pedirNaLoja(c);
  conferir("reserva pedida pela loja", deu(pedido), resumo([pedido]));
  const { token } = await aux("GET", `/__trv/token-da-dona?eventId=${c.eventId}`);
  const r = await corrigirFesta(c.eventId, { date: D2 }, token);
  conferir(
    "a dona da festa também é recusada (409), com orientação para falar com a Festaê e sem dado interno",
    r.status === 409 && String(erro(r).message).includes("WhatsApp") && erro(r).reservaId === undefined,
    erro(r),
  );
  await datasConsistentes("depois da tentativa da cliente", pedido.json.id);
}

console.log("19. Carrinho sem reserva: a data pode mudar, e a reserva nasce no dia novo");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Mesa Carrinho", 1);
  const k = await kitCom("Kit Carrinho", p);
  const c = await carrinho(D1, k);
  const r = await corrigirFesta(c.eventId, { date: D2 });
  conferir("sem reserva, mudar a data passa", deu(r), resumo([r]));
  const pedido = await pedirNaLoja(c);
  const d = await datasConsistentes("reserva pedida depois", pedido.json.id);
  conferir("a reserva nasce no dia novo", d.reserva === D2, d);
}

console.log("20. Registro antigo divergente: nada é corrigido sozinho; a equipe alinha ou remarca");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const D3 = novoDia();
  const p = await produto("Totem Antigo", 1);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  await aux("POST", "/__trv/divergir", { reservaId: venda.id, data: D2 });
  const { eventId } = await datas(venda.id);
  const lista = (await req("GET", "/events/admin/all")).json ?? [];
  const linha = lista.find((e) => e.id === eventId);
  conferir("a lista de Eventos traz as duas datas para o painel sinalizar", linha?.order?.reservation?.eventDate?.slice(0, 10) === D1 && linha?.date?.slice(0, 10) === D2, linha?.order?.reservation);
  const outra = await corrigirFesta(eventId, { date: D3 });
  conferir("levar o cadastro para um terceiro dia é recusado", outra.status === 409, resumo([outra]));
  let d = await datas(venda.id);
  conferir("a recusa não altera nenhuma das duas datas", d.reserva === D1 && d.evento === D2, d);
  const alinhar = await corrigirFesta(eventId, { date: D1 });
  conferir("alinhar o cadastro ao dia da reserva é permitido (decisão da equipe)", deu(alinhar), resumo([alinhar]));
  await datasConsistentes("depois de alinhar", venda.id);
  const a1 = await acervo(p, D1);
  conferir("o acervo não mudou: a peça segue no dia da reserva", a1.emReservas === 1, a1);
}

console.log("21. Remarcar mantém as duas datas juntas e guarda a data anterior");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const D3 = novoDia();
  const p = await produto("Cadeira Historico", 3);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  conferir("primeira remarcação passa", deu(await remarcar(venda.id, D2)));
  conferir("segunda remarcação passa", deu(await remarcar(venda.id, D3)));
  const d = await datasConsistentes("depois de duas remarcações", venda.id);
  conferir("o histórico guarda a data original, não a do meio", d.reserva === D3 && d.remarcadaDe === D1, d);
}

console.log("22. Corrigir festa × pedido da loja, no mesmo instante (carrinho sem reserva)");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Painel Corrida Data", 1);
  const k = await kitCom("Kit Corrida Data", p);
  const c = await carrinho(D1, k);
  const [pedido, mudanca] = await cruzar("pedidos", [c.orderId], [
    [0, () => pedirNaLoja(c)],
    [300, () => corrigirFesta(c.eventId, { date: D2 })],
  ]);
  conferir("só uma das duas vale: a reserva no dia de antes ou a data nova sem reserva", deu(pedido) !== deu(mudanca), resumo([pedido, mudanca]));
  if (deu(pedido)) {
    const d = await datasConsistentes("a loja reservou primeiro", pedido.json.id);
    conferir("e a mudança de data foi recusada por já haver reserva", mudanca.status === 409 && d.reserva === D1, d);
  }
}

console.log("23. Remarcação em corrida com venda, edição e confirmação de pagamento");
{
  // Remarcação × venda manual pela última unidade no dia novo.
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Arco Remarca Venda", 1);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const rs = await cruzar("produtos", [p.id], [
    [0, () => remarcar(venda.id, D2)],
    [0, () => venderNoBalcao(D2, [[p, 1]])],
  ]);
  conferir("remarcação × venda: só uma leva a unidade do dia novo", rs.filter(deu).length === 1 && rs.some((r) => r.status === 409), resumo(rs));
  await semExcesso("remarcação × venda", p, D2);
  await datasConsistentes("remarcação × venda", venda.id);
}
{
  // Remarcação × edição da mesma reserva: passam uma de cada vez (trava do pedido).
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Mesa Remarca Edicao", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const rs = await cruzar("reservas", [venda.id], [
    [0, () => remarcar(venda.id, D2)],
    [100, () => editar(venda, D1, [[p, 2]])],
  ]);
  conferir("remarcação × edição: nenhuma das duas trava ou dá erro interno", rs.every((r) => r.status < 500), resumo(rs));
  conferir(
    "remarcação × edição abertas juntas: uma grava, a outra é recusada por versão (nada some calado)",
    rs.filter(deu).length === 1 && rs.some((r) => r.status === 409 && ["RESERVA_ALTERADA", "DATA_DA_RESERVA_MUDOU"].includes(erro(r).codigo)),
    resumo(rs),
  );
  const d = await datasConsistentes("remarcação × edição", venda.id);
  await semExcesso("remarcação × edição, no dia em que a festa ficou", p, d.reserva);
}
{
  // Remarcação × confirmação de pagamento de uma reserva da loja aguardando sinal.
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Bolo Remarca Pagamento", 2);
  const k = await kitCom("Kit Remarca Pagamento", p);
  const c = await carrinho(D1, k);
  const pedido = await pedirNaLoja(c);
  const id = pedido.json.id;
  const inicio = Date.now();
  const rs = await cruzar("reservas", [id], [
    [0, () => remarcar(id, D2)],
    [100, () => pagar(id)],
  ]);
  const d = await datasConsistentes("remarcação × pagamento", id);
  conferir("remarcação e pagamento passam, sem impasse", rs.every(deu) && Date.now() - inicio < 6_000, resumo(rs));
  conferir("a reserva fica confirmada no dia novo", d.status === "CONFIRMED" && d.reserva === D2, d);
}

// ----------------------------------------------------------------------------
// Edição × remarcação: nenhuma gravação apaga outra sem avisar.
const dataBr = (iso) => iso.split("-").reverse().join("/");

console.log("24. Edição feita numa tela aberta antes de uma remarcação: recusada, a remarcação fica");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Toalha Versao", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const tela = await reservaNoPainel(venda.id); // a operadora abre o formulário
  conferir("o painel recebe a versão da reserva", typeof tela.versao === "string" && tela.versao.length >= 16, tela.versao);
  const rr = await remarcar(venda.id, D2); // outra pessoa remarca
  conferir("a remarcação passa", deu(rr), resumo([rr]));
  const re = await editarCom(venda, { data: D1, itens: [[p, 1]], versao: tela.versao, observacoes: "Trocar a cor da toalha" });
  conferir("a edição da tela velha é recusada (409 RESERVA_ALTERADA)", re.status === 409 && erro(re).codigo === "RESERVA_ALTERADA", resumo([re]));
  conferir("e a recusa diz em que dia a festa está agora", erro(re).dataAtual === D2 && String(erro(re).message).includes(dataBr(D2)), erro(re));
  const d = await datasConsistentes("depois da recusa", venda.id);
  conferir("a remarcação continua valendo (dia novo, com a data anterior guardada)", d.reserva === D2 && d.remarcadaDe === D1, d);
  const a1 = await acervo(p, D1);
  const a2 = await acervo(p, D2);
  conferir("o acervo acompanha: nada preso no dia antigo, a peça presa no novo", a1.emReservas === 0 && a2.emReservas === 1, { a1, a2 });
  const agora = await reservaNoPainel(venda.id);
  conferir("nada da edição recusada foi gravado", !String(agora.notes ?? "").includes("toalha"), agora.notes);
  const re2 = await editarCom(venda, { data: D2, itens: [[p, 1]], versao: agora.versao, observacoes: "Trocar a cor da toalha" });
  conferir("recarregada a reserva, a mesma correção passa e o dia novo fica", deu(re2) && (await datas(venda.id)).reserva === D2, resumo([re2]));
}

console.log("25. Remarcação pela data velha depois de uma edição que mudou o dia: recusada");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const D3 = novoDia();
  const p = await produto("Balao Versao", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const vista = String((await reservaNoPainel(venda.id)).eventDate).slice(0, 10); // diálogo de remarcar aberto
  const re = await editar(venda, D3, [[p, 1]]); // outra pessoa edita e leva a festa para D3
  conferir("a edição que muda o dia passa", deu(re), resumo([re]));
  const rr = await remarcar(venda.id, D2, vista);
  conferir("a remarcação pela data velha é recusada (409 DATA_DA_RESERVA_MUDOU)", rr.status === 409 && erro(rr).codigo === "DATA_DA_RESERVA_MUDOU", resumo([rr]));
  conferir("e a recusa diz a data atual", String(erro(rr).message).includes(dataBr(D3)) && erro(rr).dataAtual === D3, erro(rr));
  const d = await datasConsistentes("depois da recusa", venda.id);
  conferir("a festa continua no dia que a edição gravou", d.reserva === D3, d);
  conferir("nada ficou preso no dia que a remarcação pediu", (await acervo(p, D2)).emReservas === 0);
}

console.log("26. Duas edições abertas ao mesmo tempo: a segunda não apaga a primeira");
{
  const D1 = novoDia();
  const p = await produto("Mesa Duas Telas", 3);
  const q = await produto("Cadeira Duas Telas", 3);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const v = (await reservaNoPainel(venda.id)).versao;
  const a = await editarCom(venda, { data: D1, itens: [[p, 1], [q, 2]], versao: v }); // acrescenta cadeiras
  const b = await editarCom(venda, { data: D1, itens: [[p, 1]], versao: v, observacoes: "Endereço corrigido" }); // tela velha
  conferir("a primeira grava e a segunda é recusada (409 RESERVA_ALTERADA)", deu(a) && b.status === 409 && erro(b).codigo === "RESERVA_ALTERADA", resumo([a, b]));
  conferir("as cadeiras da primeira edição continuam na reserva", (await acervo(q, D1)).emReservas === 2);
}

console.log("27. Edição e remarcação da mesma tela, no mesmo instante: só uma grava");
{
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Painel Instante", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const tela = await reservaNoPainel(venda.id);
  const rs = await cruzar("reservas", [venda.id], [
    [0, () => remarcar(venda.id, D2, String(tela.eventDate).slice(0, 10))],
    [100, () => editarCom(venda, { data: D1, itens: [[p, 2]], versao: tela.versao })],
  ]);
  conferir(
    "exatamente uma grava; a outra recebe 409 de versão",
    rs.filter(deu).length === 1 && rs.some((r) => r.status === 409 && ["RESERVA_ALTERADA", "DATA_DA_RESERVA_MUDOU"].includes(erro(r).codigo)),
    resumo(rs),
  );
  const d = await datasConsistentes("no mesmo instante", venda.id);
  const remarcou = deu(rs[0]);
  const final = remarcou
    ? d.reserva === D2 && (await acervo(p, D2)).emReservas === 1 && (await acervo(p, D1)).emReservas === 0
    : d.reserva === D1 && (await acervo(p, D1)).emReservas === 2 && (await acervo(p, D2)).emReservas === 0;
  conferir(`o estado final é exatamente o de quem gravou (${remarcou ? "remarcação" : "edição"})`, final, d);
  await semExcesso("no mesmo instante, dia antigo", p, D1);
  await semExcesso("no mesmo instante, dia novo", p, D2);
}

{
  // O espelho: a edição chega primeiro e a remarcação da mesma tela, depois.
  const D1 = novoDia();
  const D2 = novoDia();
  const p = await produto("Painel Instante Espelho", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const tela = await reservaNoPainel(venda.id);
  const rs = await cruzar("reservas", [venda.id], [
    [0, () => editarCom(venda, { data: D1, itens: [[p, 2]], versao: tela.versao })],
    [100, () => remarcar(venda.id, D2, String(tela.eventDate).slice(0, 10))],
  ]);
  const d = await datasConsistentes("espelho", venda.id);
  const a1 = await acervo(p, D1);
  const a2 = await acervo(p, D2);
  if (rs.every(deu)) {
    // A edição não mexeu na data: a data que a remarcação via continua
    // valendo, e ela leva o pedido JÁ EDITADO (2 peças) para o dia novo,
    // conferido sob a trava. As duas vontades ficam — nenhuma some.
    conferir(
      "espelho: as duas gravam sem se apagar (dia da remarcação, com as 2 peças da edição)",
      d.reserva === D2 && d.remarcadaDe === D1 && a2.emReservas === 2 && a1.emReservas === 0,
      { d, a1, a2 },
    );
  } else {
    conferir(
      "espelho: se uma é recusada, é por versão (409) e o estado é o de quem gravou",
      rs.some((r) => r.status === 409 && ["RESERVA_ALTERADA", "DATA_DA_RESERVA_MUDOU"].includes(erro(r).codigo)) &&
        (deu(rs[0]) ? d.reserva === D1 && a1.emReservas === 2 : d.reserva === D2 && a2.emReservas === 1),
      { rs: resumo(rs), d, a1, a2 },
    );
  }
  await semExcesso("espelho, dia novo", p, D2);
}

console.log("28. Painel aberto antes da atualização (sem versão): recusa com orientação, nada gravado");
{
  const D1 = novoDia();
  const p = await produto("Vaso Painel Antigo", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const semVersao = await req("PATCH", `/reservations/${venda.id}`, corpoDaEdicao(venda, { data: novoDia(), itens: [[p, 1]] }));
  conferir(
    "edição sem versão: 400 VERSAO_DA_RESERVA_AUSENTE, pedindo para recarregar",
    semVersao.status === 400 && erro(semVersao).codigo === "VERSAO_DA_RESERVA_AUSENTE" && /recarregue/i.test(erro(semVersao).message),
    resumo([semVersao]),
  );
  const semData = await req("PATCH", `/reservations/${venda.id}/data`, { data: novoDia() });
  conferir(
    "remarcação sem a data atual: 400 VERSAO_DA_RESERVA_AUSENTE",
    semData.status === 400 && erro(semData).codigo === "VERSAO_DA_RESERVA_AUSENTE",
    resumo([semData]),
  );
  conferir("nada mudou na reserva", (await datas(venda.id)).reserva === D1);
}

console.log("29. Sem falso conflito: pagamento entre abrir e salvar não trava a edição");
{
  const D1 = novoDia();
  const p = await produto("Bandeja Pagamento", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const v1 = (await reservaNoPainel(venda.id)).versao;
  const pg = await pagar(venda.id); // o ADMIN registra o sinal enquanto a edição está aberta
  conferir("o pagamento é registrado", deu(pg), resumo([pg]));
  conferir("pagamento não muda a versão", (await reservaNoPainel(venda.id)).versao === v1);
  const re = await editarCom(venda, { data: D1, itens: [[p, 1]], versao: v1, observacoes: "Entrega pelo portão lateral" });
  conferir("a edição aberta antes do pagamento passa", deu(re), resumo([re]));
  const v2 = (await reservaNoPainel(venda.id)).versao;
  conferir("gravada a edição, a versão muda", typeof v2 === "string" && v2 !== v1, { v1, v2 });
  const reuso = await editarCom(venda, { data: D1, itens: [[p, 1]], versao: v1 });
  conferir("a versão antiga não serve mais (409)", reuso.status === 409 && erro(reuso).codigo === "RESERVA_ALTERADA", resumo([reuso]));
}

// ----------------------------------------------------------------------------
// Correções cadastrais (Operação → "Corrigir dados" e Eventos → "Editar
// festa"): só o campo que outra pessoa mudou é conflito.
/** Os dados como a tela "Corrigir dados" os abre. */
const dadosNaTela = async (reservaId) => {
  const r = await reservaNoPainel(reservaId);
  return {
    nome: r.order.event.user.name,
    telefone: r.order.event.user.phone,
    endereco: r.order.event.address ?? null,
    bairro: r.order.event.neighborhood ?? null,
    observacoes: r.notes ?? null,
  };
};
/** "Corrigir dados": manda só os campos dados, com os valores de quando a tela abriu. */
const corrigirDados = async (reservaId, campos, tela) => {
  const ref = tela === null ? null : (tela ?? (await dadosNaTela(reservaId)));
  return req("PATCH", `/operacao/reservas/${reservaId}/dados`, {
    ...campos,
    ...(ref ? { antes: Object.fromEntries(Object.keys(campos).map((c) => [c, ref[c] ?? null])) } : {}),
  });
};
const tel = () => `0049${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;

console.log("30. Corrigir dados numa tela velha depois de outra correção do mesmo campo: recusada");
{
  const D1 = novoDia();
  const p = await produto("Toalha Cadastro", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const tela = await dadosNaTela(venda.id); // a operadora B abre "Corrigir dados"
  const certo = tel();
  const a = await corrigirDados(venda.id, { telefone: certo }); // A corrige o telefone
  conferir("a primeira correção do telefone passa", deu(a), resumo([a]));
  const b = await corrigirDados(venda.id, { telefone: tel() }, tela); // B grava o que tinha na tela
  conferir("a tela velha é recusada (409 CADASTRO_ALTERADO, campo telefone)", b.status === 409 && erro(b).codigo === "CADASTRO_ALTERADO" && JSON.stringify(erro(b).campos) === '["telefone"]', resumo([b]));
  conferir("a recusa não mostra o telefone de ninguém", !String(erro(b).message).includes(certo.slice(-6)), erro(b).message);
  const agora = await dadosNaTela(venda.id);
  conferir("o telefone corrigido por A continua gravado", String(agora.telefone).endsWith(certo.slice(-8)), agora.telefone);
}

console.log("31. Correções em campos diferentes passam todas (sem conflito falso)");
{
  const D1 = novoDia();
  const p = await produto("Mesa Cadastro", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const tela = await dadosNaTela(venda.id);
  const { eventId } = await datas(venda.id);
  const festaTela = await festaNoPainel(eventId);
  const a = await corrigirDados(venda.id, { endereco: "Rua das Flores, 100" }); // A corrige o endereço
  const novoTel = tel();
  const b = await corrigirDados(venda.id, { telefone: novoTel }, tela); // B, tela velha, só o telefone
  conferir("endereço (A) e telefone (B), da mesma tela velha, passam os dois", deu(a) && deu(b), resumo([a, b]));
  const c = await corrigirFesta(eventId, { guestCount: 70 }, ADMIN, comoEstava(festaTela, ["guestCount"])); // Eventos, tela velha
  conferir("Eventos (tela velha) mudando só os convidados também passa", deu(c), resumo([c]));
  const igual = await corrigirDados(venda.id, { endereco: "Rua das Flores, 100" }, tela); // C, mesma correção que A
  conferir("corrigir para o mesmo valor que outra pessoa já gravou não é conflito", deu(igual), resumo([igual]));
  const agora = await dadosNaTela(venda.id);
  const festa = await festaNoPainel(eventId);
  conferir(
    "as três correções ficaram (endereço, telefone e convidados)",
    agora.endereco === "Rua das Flores, 100" && String(agora.telefone).endsWith(novoTel.slice(-8)) && festa.guestCount === 70,
    { agora: { endereco: agora.endereco }, convidados: festa.guestCount },
  );
}

console.log("32. Eventos: tela velha recusada no campo que outra pessoa mudou; a edição da reserva respeita a correção");
{
  const D1 = novoDia();
  const p = await produto("Painel Cadastro", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const { eventId } = await datas(venda.id);
  const festaTela = await festaNoPainel(eventId);
  const a = await corrigirFesta(eventId, { guestCount: 80 }); // outra aba de Eventos
  const b = await corrigirFesta(eventId, { guestCount: 60 }, ADMIN, comoEstava(festaTela, ["guestCount"]));
  conferir("convidados: a tela velha é recusada (409 CADASTRO_ALTERADO)", deu(a) && b.status === 409 && erro(b).codigo === "CADASTRO_ALTERADO", resumo([a, b]));
  conferir("ficam os 80 convidados gravados antes", (await festaNoPainel(eventId)).guestCount === 80);
  const edicao = await reservaNoPainel(venda.id); // o formulário de edição da reserva abre
  const correcao = await corrigirDados(venda.id, { telefone: tel() }); // alguém corrige o telefone
  const salva = await editarCom(venda, { data: D1, itens: [[p, 1]], versao: edicao.versao });
  conferir(
    "a edição da reserva aberta antes da correção é recusada (409 RESERVA_ALTERADA), e o telefone corrigido fica",
    deu(correcao) && salva.status === 409 && erro(salva).codigo === "RESERVA_ALTERADA",
    resumo([correcao, salva]),
  );
}

console.log("33. No mesmo instante: o mesmo campo, só uma grava; campos diferentes, as duas");
{
  const D1 = novoDia();
  const p = await produto("Vaso Cadastro", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const { orderId } = await aux("GET", `/__trv/reserva?id=${venda.id}`);
  const tela = await dadosNaTela(venda.id);
  const rs = await cruzar("pedidos", [orderId], [
    [0, () => corrigirDados(venda.id, { endereco: "Rua A, 1" }, tela)],
    [100, () => corrigirDados(venda.id, { endereco: "Rua B, 2" }, tela)],
  ]);
  conferir(
    "mesmo campo, mesma tela, mesmo instante: uma grava e a outra recebe 409 CADASTRO_ALTERADO",
    rs.filter(deu).length === 1 && rs.some((r) => r.status === 409 && erro(r).codigo === "CADASTRO_ALTERADO"),
    resumo(rs),
  );
  const ganhou = deu(rs[0]) ? "Rua A, 1" : "Rua B, 2";
  conferir("o endereço gravado é o de quem gravou", (await dadosNaTela(venda.id)).endereco === ganhou);
  const tela2 = await dadosNaTela(venda.id);
  const { eventId } = await datas(venda.id);
  const festaTela = await festaNoPainel(eventId);
  const rs2 = await cruzar("pedidos", [orderId], [
    [0, () => corrigirDados(venda.id, { telefone: tel() }, tela2)],
    [100, () => corrigirFesta(eventId, { guestCount: 45 }, ADMIN, comoEstava(festaTela, ["guestCount"]))],
  ]);
  conferir("campos diferentes no mesmo instante: as duas gravam", rs2.every(deu), resumo(rs2));
}

console.log("34. Painel antigo (sem os valores de antes): recusado com orientação; o app da cliente continua");
{
  const D1 = novoDia();
  const p = await produto("Bandeja Cadastro", 2);
  const venda = await vendaRegistrada(D1, [[p, 1]]);
  const { eventId } = await datas(venda.id);
  const d = await corrigirDados(venda.id, { telefone: tel() }, null);
  conferir("Corrigir dados sem antes: 400 PAINEL_DESATUALIZADO", d.status === 400 && erro(d).codigo === "PAINEL_DESATUALIZADO" && /recarregue/i.test(erro(d).message), resumo([d]));
  const e = await corrigirFesta(eventId, { guestCount: 30 }, ADMIN, null);
  conferir("Eventos (painel) sem antes: 400 PAINEL_DESATUALIZADO", e.status === 400 && erro(e).codigo === "PAINEL_DESATUALIZADO", resumo([e]));
  const { token } = await aux("GET", `/__trv/token-da-dona?eventId=${eventId}`);
  const cliente = await corrigirFesta(eventId, { guestCount: 30 }, token);
  conferir("a dona da festa, pelo app, sem antes: continua funcionando", deu(cliente) && (await festaNoPainel(eventId)).guestCount === 30, resumo([cliente]));
}

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
