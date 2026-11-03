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
const editar = (venda, data, itens) =>
  req("PATCH", `/reservations/${venda.id}`, {
    cliente: venda.corpo.cliente,
    evento: { data, tipo: "ANIVERSARIO" },
    produtos: { itens: itens.map(([p, quantity]) => ({ productId: p.id, quantity })) },
    logistica: venda.corpo.logistica,
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0 },
  });
const remarcar = (id, data) => req("PATCH", `/reservations/${id}/data`, { data });
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
const corrigirFesta = (eventId, corpo, token = ADMIN) => req("PATCH", `/events/${eventId}`, corpo, token);
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

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
