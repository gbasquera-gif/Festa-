// Expiração do sinal: o que a liberação automática faz com cada situação de
// pagamento. Banco LOCAL descartável, dados fictícios. Uso:
//   BASE=http://localhost:3340 node cenarios-expiracao.mjs   (servidor.cjs no ar)
//
// "Liberar" é a rotina oficial (releaseUnpaidHolds), chamada pela nova
// entrada da branch de expiração; "calendário" é a mesma rotina pelo caminho
// de hoje (abrir o calendário da loja). Os cenários marcados ⚠ mostram
// riscos que existem nos dois caminhos e que a nova chamada torna mais
// frequentes.

const BASE = process.env.BASE ?? "http://localhost:3340";
const API = `${BASE}/api/v1`;
let ok = 0;
let falhas = 0;
const achados = [];
function conferir(nome, cond, extra) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✗ ${nome}`, extra !== undefined ? JSON.stringify(extra).slice(0, 900) : "");
  }
}
function risco(nome, extra) {
  achados.push(nome);
  console.log(`  ⚠ ${nome}`, extra !== undefined ? JSON.stringify(extra) : "");
}
async function http(metodo, url, corpo, token) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {}
  return { status: r.status, json, texto: t };
}
const aux = async (m, c, b) => {
  const r = await http(m, BASE + c, b);
  if (r.status !== 200) throw new Error(`${c}: ${r.status} ${r.texto}`);
  return r.json;
};
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const { token: ADMIN, id: ADMIN_ID } = await aux("GET", "/__orc/token?papel=ADMIN");
const req = (m, c, b) => http(m, API + c, b, ADMIN);

const suf = Date.now().toString(36).slice(-5);
const dia = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const telefone = () => `0048${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;
const produto = async (nome) => aux("POST", "/__orc/produto", { nome: `${nome} ${suf} ${++seq}`, estoque: 3 });

/** Reserva da loja aguardando sinal, pedida há `minutos`. */
async function reservaDaLoja(minutos, { data = dia(60) } = {}) {
  const p = await produto("Peca expiracao");
  const r = await req("POST", "/reservations/manual", {
    cliente: { nome: `Cliente Expiracao ${suf}`, telefone: telefone() },
    evento: { data, tipo: "ANIVERSARIO" },
    produtos: { itens: [{ productId: p.id, quantity: 1 }] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  });
  if (r.status >= 300) throw new Error(r.texto);
  await aux("POST", "/__orc/reserva-da-loja-sem-sinal", { reservaId: r.json.id, minutosAtras: minutos });
  return r.json.id;
}
const envelhecer = (reservaId, minutos) => aux("POST", "/__exp/envelhecer", { reservaId, minutosAtras: minutos });
const pix = (reservaId, expiraEmMin) => aux("POST", "/__exp/pix", { reservaId, expiraEmMin });
const webhookPago = (paymentId) => aux("POST", "/__exp/webhook-pago", { paymentId });
const liberar = () => aux("POST", "/__exp/liberar");
const calendario = () => aux("POST", "/__orc/abrir-calendario-da-loja", { mes: dia(60).slice(0, 7) });
const estado = (reservaId) => aux("GET", `/__exp/estado?reservaId=${reservaId}`);
const pagarNoPainel = (reservaId) => req("POST", `/reservations/${reservaId}/pagamentos`, { tipo: "DEPOSIT", valor: 30, forma: "PIX" });
const segurar = (reservaId, ms) => aux("POST", "/__exp/segurar-pedido", { reservaId, ms });

// ----------------------------------------------------------------------------
console.log("1. Pix pago antes do vencimento, webhook dentro do prazo");
{
  const r = await reservaDaLoja(20);
  const p = await pix(r, 10);
  await webhookPago(p.id);
  await envelhecer(r, 120); // o tempo passa: duas horas depois do pedido
  await liberar();
  const e = await estado(r);
  conferir("a reserva paga continua confirmada", e.reserva === "CONFIRMED" && e.pagamentos.includes("DEPOSIT:PAID"), e);
  conferir("a liberação nunca passou por ela", !e.etapas.includes("CONFIRMED>CANCELLED") && !e.etapas.includes("PENDING>CANCELLED"), e.etapas);
}

// ----------------------------------------------------------------------------
console.log("2. Pix pago antes do vencimento, webhook só depois do prazo da reserva");
{
  const r = await reservaDaLoja(120);
  const p = await pix(r, -90); // gerado aos 0 min, venceu aos 30; pago no Mercado Pago, notificação perdida
  await liberar();
  const antes = await estado(r);
  conferir("sem o pagamento no banco, a liberação cancela", antes.reserva === "CANCELLED", antes);
  await webhookPago(p.id);
  const depois = await estado(r);
  conferir("o webhook atrasado registra o dinheiro (pago, não se perde)", depois.pagamentos.includes("DEPOSIT:PAID"), depois);
  conferir("e abre a pendência de pagamento após cancelamento", depois.aposCancelamento === 1, depois);
  conferir("a reserva não volta sozinha (sem dupla reserva da peça)", depois.reserva === "CANCELLED" && depois.etapas.join() === "CONFIRMED>PENDING,PENDING>CANCELLED", depois.etapas);
  risco("cenário 2: cliente pagou dentro da validade do Pix e a reserva foi cancelada porque o webhook não chegou em 30 min; o dinheiro fica como pagamento após cancelamento, para tratamento manual");
}
{
  // O mesmo pelo caminho de hoje (calendário): resultado idêntico.
  const r = await reservaDaLoja(120);
  const p = await pix(r, -90);
  await calendario();
  await webhookPago(p.id);
  const e = await estado(r);
  conferir("pelo calendário da loja, hoje, o resultado é o mesmo", e.reserva === "CANCELLED" && e.aposCancelamento === 1, e);
}

// ----------------------------------------------------------------------------
console.log("3. Pix gerado de novo perto dos 60 minutos (QR ainda válido)");
{
  const r = await reservaDaLoja(61);
  await pix(r, -31); // o primeiro venceu
  const novo = await pix(r, 19); // gerado aos 50 min: vale até os 80 — depois do prazo de 60 da reserva
  await liberar();
  const e = await estado(r);
  conferir("a liberação cancela mesmo com um Pix ainda pagável", e.reserva === "CANCELLED", e);
  conferir("o Pix vivo continua pendente (a liberação não o cancela no Mercado Pago)", e.pagamentos.includes("DEPOSIT:PENDING"), e.pagamentos);
  await webhookPago(novo.id);
  const pago = await estado(r);
  conferir("pago aos 70 min: vira pagamento após cancelamento", pago.aposCancelamento === 1 && pago.reserva === "CANCELLED", pago);
  risco("cenário 3: Pix regenerado depois dos 30 min vale além dos 60 da reserva; a liberação cancela com QR ainda pagável e não cancela o Pix no provedor");
}

// ----------------------------------------------------------------------------
console.log("4. Pagamento manual registrado perto do vencimento");
{
  const r = await reservaDaLoja(59);
  const pago = await pagarNoPainel(r);
  conferir("registrado aos 59 min: confirma a reserva", pago.status === 201 || pago.status === 200, pago.json);
  await envelhecer(r, 61);
  await liberar();
  const e = await estado(r);
  conferir("aos 61 min a liberação não toca a reserva paga", e.reserva === "CONFIRMED" && !e.etapas.includes("PENDING>CANCELLED"), e);
}
{
  // Corrida, pagamento primeiro: as duas operações chegam enquanto o pedido
  // está travado; o pagamento entrou na fila antes.
  const r = await reservaDaLoja(61);
  const trava = segurar(r, 1200);
  await esperar(150);
  const pagamento = pagarNoPainel(r);
  await esperar(250);
  const liberacao = liberar();
  await Promise.all([trava, pagamento, liberacao]);
  const e = await estado(r);
  conferir("pagamento antes da liberação: confirmada, nunca cancelada", e.reserva === "CONFIRMED" && e.etapas.join() === "CONFIRMED>PENDING,PENDING>CONFIRMED", e);
}
{
  // Corrida, liberação primeiro: a liberação entra na fila antes; o
  // pagamento manual leu a reserva como pendente fora da trava.
  let ressuscitadas = 0;
  let canceladasAntes = 0;
  for (let i = 0; i < 3; i++) {
    const r = await reservaDaLoja(61);
    const trava = segurar(r, 1200);
    await esperar(150);
    const liberacao = liberar();
    await esperar(250);
    const pagamento = pagarNoPainel(r);
    await Promise.all([trava, liberacao, pagamento]);
    const e = await estado(r);
    if (e.etapas.includes("PENDING>CANCELLED")) canceladasAntes++;
    if (e.etapas.includes("CANCELLED>CONFIRMED")) ressuscitadas++;
    if (i === 0) console.log("    etapas:", e.etapas.join(" → "), "| reserva:", e.reserva, "| pedido:", e.pedido, "| pagamentos:", e.pagamentos.join(","));
  }
  conferir("a liberação chegou primeiro nas 3 rodadas", canceladasAntes === 3, { canceladasAntes });
  if (ressuscitadas > 0) {
    risco(`cenário 4: em ${ressuscitadas} de 3 rodadas o pagamento manual reabriu como CONFIRMADA uma reserva que a liberação acabara de cancelar (a peça já tinha sido devolvida ao acervo) — registrarPagamento não confere a etapa da reserva dentro da trava`);
  } else {
    conferir("o pagamento manual não reabre reserva cancelada", true);
  }
}

// ----------------------------------------------------------------------------
console.log("5. Reserva com crédito Festaê aplicado");
{
  const r = await reservaDaLoja(120);
  await aux("POST", "/__exp/credito", { reservaId: r, usuarioId: ADMIN_ID });
  await liberar();
  await calendario();
  const e = await estado(r);
  conferir("crédito aplicado garante a data: nenhum dos caminhos cancela", e.reserva === "PENDING" && !e.etapas.includes("PENDING>CANCELLED"), e);
}

// ----------------------------------------------------------------------------
console.log("6. Cancelamento e confirmação do Pix concorrentes");
{
  const r = await reservaDaLoja(61);
  const p = await pix(r, -31);
  const trava = segurar(r, 1200);
  await esperar(150);
  const confirmacao = webhookPago(p.id);
  await esperar(250);
  const liberacao = liberar();
  await Promise.all([trava, confirmacao, liberacao]);
  const e = await estado(r);
  conferir("webhook primeiro: confirmada e não cancelada", e.reserva === "CONFIRMED" && !e.etapas.includes("PENDING>CANCELLED"), e);
}
{
  const r = await reservaDaLoja(61);
  const p = await pix(r, -31);
  const trava = segurar(r, 1200);
  await esperar(150);
  const liberacao = liberar();
  await esperar(250);
  const confirmacao = webhookPago(p.id);
  await Promise.all([trava, liberacao, confirmacao]);
  const e = await estado(r);
  conferir(
    "liberação primeiro: cancelada, pagamento registrado como após o cancelamento, sem reabrir",
    e.reserva === "CANCELLED" && e.aposCancelamento === 1 && !e.etapas.includes("CANCELLED>CONFIRMED"),
    e,
  );
}

// ----------------------------------------------------------------------------
console.log("7. Reexecução: a rotina é idempotente");
{
  const r = await reservaDaLoja(120);
  await liberar();
  await liberar();
  await Promise.all([liberar(), liberar(), liberar(), calendario(), calendario()]);
  const e = await estado(r);
  conferir("cinco chamadas simultâneas e repetidas: um único cancelamento", e.reserva === "CANCELLED" && e.etapas.join() === "CONFIRMED>PENDING,PENDING>CANCELLED", e.etapas);
  conferir("o pedido fica cancelado uma vez, sem erro", e.pedido === "CANCELLED", e);
}

// ----------------------------------------------------------------------------
console.log("8. Calendário da loja e nova chamada decidem igual");
{
  const montar = async () => {
    const vencida = await reservaDaLoja(120);
    const noPrazo = await reservaDaLoja(30);
    const paga = await reservaDaLoja(120);
    await webhookPago((await pix(paga, -90)).id);
    await envelhecer(paga, 120);
    const credito = await reservaDaLoja(120);
    await aux("POST", "/__exp/credito", { reservaId: credito, usuarioId: ADMIN_ID });
    return { vencida, noPrazo, paga, credito };
  };
  const resumo = async (m) => Object.fromEntries(await Promise.all(Object.entries(m).map(async ([k, id]) => [k, (await estado(id)).reserva])));
  const a = await montar();
  await calendario();
  const pelaLoja = await resumo(a);
  const b = await montar();
  await liberar();
  const pelaNova = await resumo(b);
  conferir("mesmas decisões nos dois caminhos", JSON.stringify(pelaLoja) === JSON.stringify(pelaNova), { pelaLoja, pelaNova });
  conferir(
    "vencida cancelada; no prazo, paga e com crédito mantidas",
    pelaNova.vencida === "CANCELLED" && pelaNova.noPrazo === "PENDING" && pelaNova.paga === "CONFIRMED" && pelaNova.credito === "PENDING",
    pelaNova,
  );
}

console.log(`\n${ok} conferências ok, ${falhas} falha(s), ${achados.length} risco(s) apontado(s).`);
for (const a of achados) console.log(`  ⚠ ${a}`);
process.exit(falhas === 0 ? 0 : 1);
