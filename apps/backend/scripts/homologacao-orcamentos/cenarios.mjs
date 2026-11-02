// Cenários da disponibilidade dos orçamentos contra o servidor de homologação
// (banco LOCAL, dados fictícios). Uso: ver README.md.
//
// Passam pela API HTTP de verdade — painel, envio, simulação, selo, link da
// cliente e aprovação. As rotas /__orc/* só montam o cenário e simulam uma
// aprovação demorada segurando a trava da data.

const BASE = process.env.BASE ?? "http://localhost:3340";
const API = `${BASE}/api/v1`;

let ok = 0;
let falhas = 0;
function conferir(nome, cond, extra) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✗ ${nome}`, extra !== undefined ? JSON.stringify(extra).slice(0, 1200) : "");
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
const tokenDe = async (papel) => (await aux("GET", `/__orc/token?papel=${papel}`)).token;
const ADMIN = await tokenDe("ADMIN");
const OPS = await tokenDe("OPS");
const CLIENTE = await tokenDe("CLIENT");
const req = (metodo, caminho, corpo, token = ADMIN) => http(metodo, API + caminho, corpo, token);
/** O corpo de erro do Nest traz o objeto da exceção dentro de `message`. */
const erro = (r) => (r.json && typeof r.json.message === "object" ? r.json.message : r.json ?? {});

// Nomes só com letras: a página da cliente não pode ter número do acervo, e
// assim dá para conferir isso sem tropeçar no sufixo do teste.
const suf = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]).slice(-5);
const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const telefone = () => `0049${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;

const produto = async (nome, estoque, extra = {}) => ({
  nome: `${nome} ${suf}`,
  ...(await aux("POST", "/__orc/produto", { nome: `${nome} ${suf}`, estoque, ...extra })),
});
const kit = (nome, pecas) => aux("POST", "/__orc/kit", { nome: `${nome} ${suf}`, pecas });

async function reservar(data, itens, nomeDaCliente = `Cliente Reserva ${suf}`) {
  const r = await req("POST", "/reservations/manual", {
    cliente: { nome: nomeDaCliente, telefone: telefone() },
    evento: { data, tipo: "ANIVERSARIO" },
    produtos: { itens: itens.map(([p, quantity]) => ({ productId: p.id, quantity })) },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  });
  if (r.status !== 201 && r.status !== 200) throw new Error(`reserva: ${r.status} ${r.texto}`);
  return aux("GET", `/__orc/reserva?id=${r.json.id}`);
}
const fe = (r) => `FE-${String(r.contractSeq).padStart(4, "0")}`;

const linha = (p, quantidade) => ({ tipo: "PRODUTO", productId: p.id, descricao: p.nome, quantidade, valorUnitario: 50 });
const opcao = (nome, itens, k) => ({
  nome,
  ...(k ? { kitId: k.id } : {}),
  imagens: [],
  itens: k ? [{ tipo: "KIT", descricao: "Kit da opção", quantidade: 1, valorUnitario: 300 }, ...itens] : itens,
  valores: { desconto: 0, entrega: 0, montagem: 0, valorFinal: null },
});
const corpoDaProposta = (data, opcoes, cliente) => ({
  cliente: { nome: cliente ?? `Cliente Proposta ${suf}`, telefone: telefone() },
  festa: { data, tipo: "ANIVERSARIO", cidade: "Chapecó" },
  proposta: { validadeEmDias: 15, canal: null },
  opcoes,
});
async function proposta(data, opcoes, cliente) {
  const r = await req("POST", "/orcamentos", corpoDaProposta(data, opcoes, cliente));
  if (r.status !== 201 && r.status !== 200) throw new Error(`proposta: ${r.status} ${r.texto}`);
  const detalhe = (await req("GET", `/orcamentos/${r.json.id}`)).json;
  return { ...r.json, opcoes: detalhe.opcoes };
}
const disponibilidade = async (id) => (await req("GET", `/orcamentos/${id}/disponibilidade`)).json;
const enviar = (id) => req("PATCH", `/orcamentos/${id}/enviar`);
const estado = (id) => aux("GET", `/__orc/orcamento?id=${id}`);
const publica = (token) => http("GET", `${API}/proposta/${token}`);
const nomes = (op) => op.faltas.map((f) => f.nome);

// ----------------------------------------------------------------------------
console.log("1. Uma opção com um item indisponível");
const D1 = dia(41);
const painel = await produto("Painel Redondo Branco", 1);
const mesa = await produto("Mesa Provencal", 5);
const r1 = await reservar(D1, [[painel, 1]]);
const p1 = await proposta(D1, [opcao("Decoracao Premium", [linha(painel, 1), linha(mesa, 1)])]);
{
  const d = await disponibilidade(p1.id);
  const op = d.opcoes[0];
  const f = op.faltas[0];
  conferir("painel conferido: a opção não cabe", op.disponivel === false && op.faltas.length === 1, d);
  conferir(
    "o aviso traz nome, identificador e quantidades",
    f.nome === `Painel Redondo Branco ${suf}` && f.identificador === painel.slug && f.necessario === 1 && f.disponivel === 0 && f.faltante === 1,
    f,
  );
  conferir("motivo e reserva responsável (FE do painel)", f.motivo === "RESERVADO_EM_OUTRA_FESTA" && f.responsaveis[0]?.numero === fe(r1), f);
  conferir("a data do evento vem junto", d.data === D1, d.data);

  const e = await enviar(p1.id);
  const corpo = erro(e);
  conferir("envio recusado pelo servidor (409, OPCOES_INDISPONIVEIS)", e.status === 409 && corpo.codigo === "OPCOES_INDISPONIVEIS", e.json);
  conferir(
    "a recusa traz o detalhe para o painel montar o aviso",
    corpo.data === D1 && corpo.opcoes?.[0]?.faltas?.[0]?.responsaveis?.[0]?.numero === fe(r1),
    corpo,
  );
  conferir("a mensagem da recusa nomeia a opção e o item", String(corpo.message).includes(`Decoracao Premium: Painel Redondo Branco ${suf}`), corpo.message);
  const s = await estado(p1.id);
  conferir("nada foi gravado: continua rascunho, sem envio registrado", s.status === "RASCUNHO" && s.enviadoEm === null && s.primeiroEnvioEm === null, s);
  conferir("o link continua fechado (rascunho responde 404)", (await publica(p1.token)).status === 404);
}

// ----------------------------------------------------------------------------
console.log("2. Uma opção com vários itens indisponíveis");
const D2 = dia(42);
const cilindro = await produto("Cilindro Dourado G", 1);
const boleira = await produto("Boleira Espelhada", 0);
const suporte = await produto("Suporte de Flores Branco", 2);
await reservar(D2, [[cilindro, 1]]);
const p2 = await proposta(D2, [opcao("Jardim Encantado", [linha(cilindro, 1), linha(boleira, 1), linha(suporte, 3), linha(mesa, 1)])]);
{
  const op = (await disponibilidade(p2.id)).opcoes[0];
  conferir("os três itens aparecem, não só o primeiro", op.faltas.length === 3, nomes(op));
  const motivo = Object.fromEntries(op.faltas.map((f) => [f.nome.replace(` ${suf}`, ""), [f.motivo, f.natureza]]));
  conferir("cilindro: outra reserva (conflito de estoque)", motivo["Cilindro Dourado G"]?.[0] === "RESERVADO_EM_OUTRA_FESTA", motivo);
  conferir("boleira: estoque zero (inconsistência de cadastro)", motivo["Boleira Espelhada"]?.join() === "SEM_UNIDADES_NO_ACERVO,CADASTRO", motivo);
  conferir("suporte: a opção pede mais que o acervo", motivo["Suporte de Flores Branco"]?.[0] === "PEDIDO_MAIOR_QUE_O_ACERVO", motivo);
  const e = await enviar(p2.id);
  conferir("envio recusado com os três itens", e.status === 409 && erro(e).opcoes?.[0]?.faltas?.length === 3, erro(e));
}

// ----------------------------------------------------------------------------
console.log("3. Várias opções com conflitos diferentes, itens compartilhados entre alternativas");
const D3 = dia(43);
const arco = await produto("Arco Organico Rose", 1); // compartilhado pelas três opções, 1 no acervo
const vaso = await produto("Vaso Ceramica Off White", 1);
const bandeja = await produto("Bandeja Espelhada", 1);
await reservar(D3, [[vaso, 1]]);
// Outra cliente aprovou (pelo link) uma opção com a bandeja: segura até virar reserva.
const outra = await proposta(D3, [opcao("Classica", [linha(bandeja, 1)])], `Outra Cliente ${suf}`);
conferir("a proposta da outra cliente sai (tudo livre)", (await enviar(outra.id)).status === 200);
const aprovou = await http("POST", `${API}/proposta/${outra.token}/aprovar`, { nome: `Outra Cliente ${suf}` });
conferir("a outra cliente aprova pelo link", aprovou.status === 201 || aprovou.status === 200, aprovou.json);
const p3 = await proposta(D3, [
  opcao("Essencial", [linha(arco, 1), linha(mesa, 1)]),
  opcao("Decoracao Premium", [linha(arco, 1), linha(vaso, 1)]),
  opcao("Jardim Encantado", [linha(arco, 1), linha(bandeja, 1)]),
]);
{
  const d = await disponibilidade(p3.id);
  const [o1, o2, o3] = d.opcoes;
  conferir("o arco (1 no acervo) cabe nas três: alternativas não somam entre si", o1.disponivel === true, o1);
  conferir("opção 2: só o vaso, reservado em outra festa", nomes(o2).join() === `Vaso Ceramica Off White ${suf}` && o2.faltas[0].motivo === "RESERVADO_EM_OUTRA_FESTA", o2);
  conferir(
    "opção 3: só a bandeja, segurada pela proposta aprovada (nº no painel)",
    nomes(o3).join() === `Bandeja Espelhada ${suf}` &&
      o3.faltas[0].motivo === "SEGURADO_POR_PROPOSTA_APROVADA" &&
      o3.faltas[0].responsaveis[0].numero === `Proposta nº ${outra.numero}`,
    o3,
  );
  conferir("as opções vêm numeradas na ordem", d.opcoes.map((o) => o.ordem).join() === "1,2,3");
  const e = await enviar(p3.id);
  const opcoes = erro(e).opcoes ?? [];
  conferir(
    "envio recusado, com as duas opções afetadas agrupadas",
    e.status === 409 && opcoes.filter((o) => o.faltas.length > 0).map((o) => o.nome).join() === "Decoracao Premium,Jardim Encantado",
    erro(e),
  );
}

// ----------------------------------------------------------------------------
console.log("4. Quantidades parcialmente disponíveis");
const D4 = dia(44);
const cadeira = await produto("Cadeira Tiffany Branca", 3);
await reservar(D4, [[cadeira, 1]]);
const p4 = await proposta(D4, [opcao("Completa", [linha(cadeira, 3)])]);
{
  const f = (await disponibilidade(p4.id)).opcoes[0].faltas[0];
  conferir("necessário 3, disponível 2, faltante 1", f?.necessario === 3 && f?.disponivel === 2 && f?.faltante === 1, f);
}

// ----------------------------------------------------------------------------
console.log("5. Peça de kit");
const D5 = dia(45);
const totem = await produto("Totem Floral", 1);
const kitJardim = await kit("Kit Jardim", [
  { productId: totem.id, quantidade: 1 },
  { productId: mesa.id, quantidade: 1 },
]);
await reservar(D5, [[totem, 1]]);
const p5 = await proposta(D5, [opcao("Com kit", [linha(mesa, 1)], kitJardim)]);
{
  const f = (await disponibilidade(p5.id)).opcoes[0].faltas[0];
  conferir("a peça do kit é apontada, com o kit de onde vem", f?.nome === `Totem Floral ${suf}` && f?.noKit === 1 && f?.kit === `Kit Jardim ${suf}`, f);
}

// ----------------------------------------------------------------------------
console.log("6. Orçamento totalmente disponível");
const D6 = dia(46);
const lustre = await produto("Lustre Cristal", 2);
const p6 = await proposta(D6, [opcao("Unica", [linha(lustre, 1), linha(mesa, 2)])]);
{
  const d = await disponibilidade(p6.id);
  conferir("nenhuma falta", d.opcoes.every((o) => o.disponivel && o.faltas.length === 0), d);
  const e = await enviar(p6.id);
  conferir("envio aceito", e.status === 200 && typeof e.json?.token === "string", e.json);
  const s = await estado(p6.id);
  conferir("marcada como enviada", s.status === "ENVIADO" && s.enviadoEm !== null, s);
  const pub = await publica(p6.token);
  conferir("no link, a opção aparece disponível", pub.status === 200 && pub.json.opcoes[0].disponivel === true, pub.json?.opcoes);
}

// ----------------------------------------------------------------------------
console.log("7. A disponibilidade muda depois do envio");
const rTarde = await reservar(D6, [[lustre, 2]], `Cliente Concorrente ${suf}`);
{
  const pub = await publica(p6.token);
  conferir("o link passa a mostrar a opção como indisponível", pub.json?.opcoes?.[0]?.disponivel === false, pub.json?.opcoes);
  const ap = await http("POST", `${API}/proposta/${p6.token}/aprovar`, { nome: `Cliente Proposta ${suf}` });
  conferir("a aprovação confere de novo e recusa (409)", ap.status === 409 && erro(ap).codigo === "FALTA_DE_MATERIAL", ap.json);
  conferir("o painel aponta a reserva nova", (await disponibilidade(p6.id)).opcoes[0].faltas[0]?.responsaveis[0]?.numero === fe(rTarde));
  const re = await enviar(p6.id);
  conferir("reenviar também é recusado", re.status === 409 && erro(re).codigo === "OPCOES_INDISPONIVEIS", re.json);
}

// ----------------------------------------------------------------------------
console.log("8. Proteção das informações no link da cliente");
{
  // Proposta enviada antes desta entrega (sem passar pela conferência), com falta.
  await aux("POST", "/__orc/enviada-sem-conferencia", { id: p3.id });
  const pub = await publica(p3.token);
  const texto = pub.texto;
  conferir("o link responde", pub.status === 200);
  conferir("o link diz só disponível ou não, por opção", pub.json.opcoes.map((o) => o.disponivel).join() === "true,false,false", pub.json.opcoes);
  conferir("nenhum número de reserva (FE-) no link", !/FE-\d/.test(texto));
  conferir("nenhum nome de outra cliente no link", !texto.includes(`Outra Cliente ${suf}`) && !texto.includes(`Cliente Reserva ${suf}`));
  const vazou = [vaso.slug, bandeja.slug, arco.slug].filter((s) => texto.includes(s));
  const termos = texto.match(/estoque|comprometid|faltante|responsave|identificador|"faltas"/gi) ?? [];
  conferir("nenhum identificador nem número do acervo no link", vazou.length === 0 && termos.length === 0, { vazou, termos });
  const ap = await http("POST", `${API}/proposta/${p3.token}/aprovar`, { nome: `Cliente Proposta ${suf}`, opcaoId: p3.opcoes[1].id });
  const msg = String(erro(ap).message ?? "");
  conferir("a recusa da aprovação nomeia a peça", ap.status === 409 && msg.includes(`Vaso Ceramica Off White ${suf}`), msg);
  conferir("e não traz número do acervo, reserva ou outra cliente", !/\d/.test(msg.replaceAll(suf, "")) && !msg.includes("Outra Cliente") && !/FE-/.test(msg), msg);
  conferir("o painel exige login", (await http("GET", `${API}/orcamentos/${p3.id}/disponibilidade`)).status === 401);
  conferir("cliente logada não vê o painel", (await req("GET", `/orcamentos/${p3.id}/disponibilidade`, undefined, CLIENTE)).status === 403);
  conferir("cliente logada não usa a simulação", (await req("POST", "/orcamentos/disponibilidade/simular", { data: D3, opcoes: [{ chave: "a", itens: [] }] }, CLIENTE)).status === 403);
  conferir("a operação (OPS) vê o painel", (await req("GET", `/orcamentos/${p3.id}/disponibilidade`, undefined, OPS)).status === 200);
}

// ----------------------------------------------------------------------------
console.log("9. O painel e o link concordam");
{
  for (const p of [p3, p6]) {
    const painelDisp = (await disponibilidade(p.id)).opcoes.map((o) => o.disponivel).join();
    const linkDisp = (await publica(p.token)).json.opcoes.map((o) => o.disponivel).join();
    conferir(`proposta nº ${p.numero}: ${painelDisp}`, painelDisp === linkDisp, { painelDisp, linkDisp });
  }
}

// ----------------------------------------------------------------------------
console.log("10. Correção dos conflitos e liberação");
const toalha = await produto("Toalha Linho Natural", 2);
{
  const corrigida = corpoDaProposta(D1, [opcao("Decoracao Premium", [linha(toalha, 1), linha(mesa, 1)])]);
  const salvo = await req("PUT", `/orcamentos/${p1.id}`, corrigida);
  conferir("a opção é corrigida (painel trocado por toalha) e salva", salvo.status === 200, salvo.json);
  conferir("o painel não aponta mais falta", (await disponibilidade(p1.id)).opcoes[0].disponivel === true);
  const e = await enviar(p1.id);
  conferir("o envio é liberado", e.status === 200, e.json);
  conferir("o link abre e a opção aparece disponível", (await publica(p1.token)).json?.opcoes?.[0]?.disponivel === true);
}

// ----------------------------------------------------------------------------
console.log("11. Rascunho com conflito e orçamento sem data");
{
  const comConflito = await req("POST", "/orcamentos", corpoDaProposta(D1, [opcao("Com conflito", [linha(painel, 1)])]));
  conferir("rascunho com item indisponível pode ser salvo", comConflito.status === 201 || comConflito.status === 200, comConflito.json);
  const semData = await req("POST", "/orcamentos", corpoDaProposta(null, [opcao("Sem data", [linha(mesa, 1)])]));
  conferir("rascunho sem data pode ser salvo", semData.status === 201 || semData.status === 200, semData.json);
  const e = await enviar(semData.json.id);
  conferir("sem data, o envio é recusado (DATA_NECESSARIA)", e.status === 400 && erro(e).codigo === "DATA_NECESSARIA", e.json);
  conferir("e continua rascunho", (await estado(semData.json.id)).status === "RASCUNHO");
  const passada = await req("POST", "/orcamentos", corpoDaProposta(dia(-3), [opcao("Passada", [linha(mesa, 1)])]));
  const ep = await enviar(passada.json.id);
  conferir("data já passada: envio recusado (DATA_PASSADA)", ep.status === 400 && erro(ep).codigo === "DATA_PASSADA", ep.json);
  globalThis.__semData = semData.json.id;
  globalThis.__passada = passada.json.id;
}

// ----------------------------------------------------------------------------
console.log("12. Simulação do editor (não grava)");
{
  const antes = await aux("GET", "/__orc/contagem");
  const s = await req("POST", "/orcamentos/disponibilidade/simular", {
    data: D2,
    opcoes: [
      { chave: "op-a", nome: "Editada", kitId: "", itens: [{ productId: cilindro.id, quantidade: 1 }, { productId: null, quantidade: 1 }] },
      { chave: "op-b", nome: "Outra", itens: [{ productId: mesa.id, quantidade: 1 }] },
    ],
  });
  conferir("a simulação confere as opções da tela", s.status === 200 || s.status === 201, s.json);
  conferir("devolve a falta pela chave do editor", s.json?.opcoes?.[0]?.chave === "op-a" && s.json.opcoes[0].faltas[0]?.nome === `Cilindro Dourado G ${suf}`, s.json);
  conferir("a outra opção cabe", s.json?.opcoes?.[1]?.disponivel === true);
  const depois = await aux("GET", "/__orc/contagem");
  conferir("nada foi gravado", antes.orcamentos === depois.orcamentos && antes.reservas === depois.reservas, { antes, depois });
}

// ----------------------------------------------------------------------------
console.log("13. Concorrência: aprovação e envio na mesma data");
const D13 = dia(47);
const balanço = await produto("Balanco de Madeira", 1);
const aEnviar = await proposta(D13, [opcao("Com balanco", [linha(balanço, 1)])]);
const aAprovar = await proposta(D13, [opcao("Tambem com balanco", [linha(balanço, 1)])], `Cliente Rapida ${suf}`);
await aux("POST", "/__orc/enviada-sem-conferencia", { id: aAprovar.id });
{
  // A aprovação pega a trava da data e só confirma depois de 1,5 s; o envio
  // chega no meio. Sem a trava no envio, ele leria "livre" e marcaria como
  // enviada uma proposta que perde a peça no instante seguinte.
  const aprovacao = aux("POST", "/__orc/aprovacao-lenta", { orcamentoId: aAprovar.id, opcaoId: aAprovar.opcoes[0].id, dia: D13, ms: 1500 });
  await new Promise((ok) => setTimeout(ok, 300));
  const envio = await enviar(aEnviar.id);
  await aprovacao;
  conferir("o envio esperou a aprovação terminar (trava da data)", envio.ms >= 900, { ms: envio.ms });
  conferir(
    "e viu a peça segurada: recusado, apontando a proposta aprovada",
    envio.status === 409 && erro(envio).opcoes?.[0]?.faltas?.[0]?.responsaveis?.[0]?.numero === `Proposta nº ${aAprovar.numero}`,
    erro(envio),
  );
  conferir("a proposta que tentou sair continua rascunho", (await estado(aEnviar.id)).status === "RASCUNHO");

  // Trava é por data: outra data não espera.
  const D13b = dia(48);
  const livre = await proposta(D13b, [opcao("Outra data", [linha(mesa, 1)])]);
  const lenta = aux("POST", "/__orc/aprovacao-lenta", { orcamentoId: aAprovar.id, opcaoId: aAprovar.opcoes[0].id, dia: D13, ms: 1500 });
  await new Promise((ok) => setTimeout(ok, 300));
  const rapido = await enviar(livre.id);
  await lenta;
  conferir("envio de outra data não espera a trava", rapido.status === 200 && rapido.ms < 900, { status: rapido.status, ms: rapido.ms });
}

// ----------------------------------------------------------------------------
console.log("14. Reserva da loja sem sinal com o prazo vencido (liberação oficial antes de conferir)");
const D14 = dia(49);
const cortina = await produto("Cortina de Voal", 1);
const toalhaMesa = await produto("Toalha de Mesa Rendada", 1);
const guirlanda = await produto("Guirlanda de Eucalipto", 1);
const vencida = await reservar(D14, [[cortina, 1]]);
await aux("POST", "/__orc/reserva-da-loja-sem-sinal", { reservaId: vencida.id, minutosAtras: 120 });
const noPrazo = await reservar(D14, [[toalhaMesa, 1]]);
await aux("POST", "/__orc/reserva-da-loja-sem-sinal", { reservaId: noPrazo.id, minutosAtras: 30 });
// Pendente há duas horas, mas com pagamento confirmado: a regra nunca libera.
const paga = await (async () => {
  const r = await req("POST", "/reservations/manual", {
    cliente: { nome: `Cliente Paga ${suf}`, telefone: telefone() },
    evento: { data: D14, tipo: "ANIVERSARIO" },
    produtos: { itens: [{ productId: guirlanda.id, quantity: 1 }] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 30, formaPagamento: "PIX", statusPagamento: "PAID" },
    origem: "WHATSAPP",
  });
  await aux("POST", "/__orc/reserva-da-loja-sem-sinal", { reservaId: r.json.id, minutosAtras: 120 });
  return aux("GET", `/__orc/reserva?id=${r.json.id}`);
})();
const p14 = await proposta(D14, [opcao("Com cortina, toalha e guirlanda", [linha(cortina, 1), linha(toalhaMesa, 1), linha(guirlanda, 1)])]);
{
  const d = await disponibilidade(p14.id);
  conferir("abrir o painel aplica a regra oficial: a vencida foi cancelada", (await aux("GET", `/__orc/reserva?id=${vencida.id}`)).status === "CANCELLED");
  conferir("a que está no prazo continua pendente", (await aux("GET", `/__orc/reserva?id=${noPrazo.id}`)).status === "PENDING");
  conferir("a pendente com pagamento confirmado não é tocada", (await aux("GET", `/__orc/reserva?id=${paga.id}`)).status === "PENDING");
  conferir(
    "a cortina voltou ao acervo; toalha e guirlanda seguem como conflito de estoque",
    nomes(d.opcoes[0]).sort().join() === [`Guirlanda de Eucalipto ${suf}`, `Toalha de Mesa Rendada ${suf}`].sort().join() &&
      d.opcoes[0].faltas.every((f) => f.motivo === "RESERVADO_EM_OUTRA_FESTA"),
    d.opcoes[0].faltas,
  );
  conferir("nenhuma reserva vencida sobra para apontar", d.reservasSemSinalVencidas.length === 0, d.reservasSemSinalVencidas);
  const antes = await aux("GET", "/__orc/contagem");
  await disponibilidade(p14.id);
  await req("GET", "/orcamentos/disponibilidade");
  const depois = await aux("GET", "/__orc/contagem");
  conferir("rodar de novo não muda nada (idempotente)", (await aux("GET", `/__orc/reserva?id=${noPrazo.id}`)).status === "PENDING" && antes.reservas === depois.reservas);
}

// ----------------------------------------------------------------------------
console.log("15. Selo na lista de orçamentos");
{
  const outraRecusada = await proposta(D6, [opcao("Perdida", [linha(mesa, 1)])]);
  await req("PATCH", `/orcamentos/${outraRecusada.id}/recusar`, { categoria: "OUTRO", motivo: "Cenário de teste" });
  const { selos, conferidoEm } = (await req("GET", "/orcamentos/disponibilidade")).json;
  conferir("conferido agora", Math.abs(Date.now() - new Date(conferidoEm).getTime()) < 60_000, conferidoEm);
  conferir("disponível", selos[p1.id]?.situacao === "DISPONIVEL", selos[p1.id]);
  conferir("com conflito, quantas opções", selos[p3.id]?.situacao === "COM_CONFLITO" && selos[p3.id].comConflito === 2 && selos[p3.id].opcoes === 3, selos[p3.id]);
  conferir("enviada que perdeu a peça depois: com conflito", selos[p6.id]?.situacao === "COM_CONFLITO", selos[p6.id]);
  conferir("sem data: não verificado", selos[globalThis.__semData]?.situacao === "NAO_VERIFICADO" && selos[globalThis.__semData].motivo === "SEM_DATA");
  conferir("data passada: não verificado", selos[globalThis.__passada]?.motivo === "DATA_PASSADA", selos[globalThis.__passada]);
  conferir("perdida: não verificado (encerrada)", selos[outraRecusada.id]?.motivo === "ENCERRADA", selos[outraRecusada.id]);
  conferir("aprovada: confere só a opção escolhida", selos[outra.id]?.situacao === "DISPONIVEL" && selos[outra.id].opcoes === 1, selos[outra.id]);
  conferir("a lista exige login da equipe", (await req("GET", "/orcamentos/disponibilidade", undefined, CLIENTE)).status === 403);
}

// ----------------------------------------------------------------------------
console.log("16. A conta oficial não mudou");
for (const d of [D1, D2, D3, D6, D14]) {
  const r = await aux("GET", `/__orc/equivalencia?dia=${d}`);
  conferir(`${d}: reservas, uma a uma, somam o mesmo que a conta do dia (${r.produtos} peças)`, r.diferencas.length === 0, r);
  const a = await aux("GET", `/__orc/aprovadas?dia=${d}`);
  conferir(`${d}: propostas aprovadas somam o mesmo que a conta antiga`, a.diferencas.length === 0, a);
}

console.log(`\n${ok} conferências ok, ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
