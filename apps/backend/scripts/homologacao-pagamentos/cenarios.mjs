// Cenários de pagamento e da liberação de reservas sem sinal, contra o
// servidor de homologação (banco LOCAL, Mercado Pago SIMULADO). Uso: ver
// README.md.
//
// A liberação roda pelo caminho de produção: abrir o calendário da loja.
// Cada cenário cria as suas reservas e, no fim, tira de cena as que ficaram
// pendentes de propósito, para a rodada seguinte não as consultar de novo.

const BASE = process.env.BASE ?? "http://localhost:3330";
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
const auxBruto = (m, c, b) => http(m, BASE + c, b);
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const { token: ADMIN, id: ADMIN_ID } = await aux("GET", "/__pag/token?papel=ADMIN");
const req = (m, c, b) => http(m, API + c, b, ADMIN);

const suf = Date.now().toString(36).slice(-5);
const MES = new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 7);
const DATA = `${MES}-15`;
let seq = 0;
const telefone = () => `0047${String(Date.now()).slice(-5)}${String(++seq).padStart(3, "0")}`;
const peca = await aux("POST", "/__pag/produto", { nome: `Peca pagamentos ${suf}`, estoque: 999 });
const kit = await aux("POST", "/__pag/kit", { nome: `Kit pagamentos ${suf}`, produtoId: peca.id });
const emCena = [];

/** Reserva da loja aguardando sinal, pedida há `minutos`. */
async function reservaDaLoja(minutos) {
  const r = await req("POST", "/reservations/manual", {
    cliente: { nome: `Cliente Pagamentos ${suf}`, telefone: telefone() },
    evento: { data: DATA, tipo: "ANIVERSARIO" },
    produtos: { kitId: kit.id, itens: [] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  });
  if (r.status >= 300) throw new Error(r.texto);
  const loja = await aux("POST", "/__pag/como-reserva-da-loja", { reservaId: r.json.id, minutosAtras: minutos });
  emCena.push(loja.id);
  return loja;
}
const provedor = (cfg) => aux("POST", "/__pag/provedor", cfg);
const pix = (reservaId, expiraEmMin, extra = {}) => aux("POST", "/__pag/pix", { reservaId, expiraEmMin, ...extra });
const liberar = () => aux("POST", "/__pag/abrir-calendario", { mes: MES });
const estado = (reservaId) => aux("GET", `/__pag/estado?reservaId=${reservaId}`);
const pagarNoPainel = (reservaId) => req("POST", `/reservations/${reservaId}/pagamentos`, { tipo: "DEPOSIT", valor: 30, forma: "PIX" });
const segurar = (reservaId, ms) => aux("POST", "/__pag/segurar-pedido", { reservaId, ms });
/** Tira de cena as reservas que ficaram pendentes de propósito. */
async function encerrarCena() {
  for (const id of emCena.splice(0)) {
    const e = await estado(id);
    if (e.reserva === "PENDING") await aux("POST", "/__pag/fora-de-cena", { reservaId: id });
  }
}

// ============================================================================
console.log("B1. Pagamento manual em corrida com a liberação");
await provedor({ modo: "nao-pago", zerar: true });
{
  let reabertas = 0;
  let recusados = 0;
  let lancados = 0;
  for (let i = 0; i < 3; i++) {
    const r = await reservaDaLoja(61);
    const trava = segurar(r.id, 1200);
    await esperar(150);
    const liberacao = liberar(); // entra na fila primeiro
    await esperar(250);
    const pagamento = pagarNoPainel(r.id); // leu a reserva como pendente, fora da trava
    const [, , resposta] = await Promise.all([trava, liberacao, pagamento]);
    const e = await estado(r.id);
    if (e.etapas.includes("CANCELLED>CONFIRMED")) reabertas++;
    if (resposta.status === 409) recusados++;
    if (e.pagamentos.some((p) => p.includes(":PAID"))) lancados++;
    if (i === 0) console.log(`    rodada 1: HTTP ${resposta.status} · etapas ${e.etapas.join(" → ")} · reserva ${e.reserva}`);
  }
  conferir("nenhuma reserva cancelada foi reaberta (3 rodadas)", reabertas === 0, { reabertas });
  conferir("o pagamento que chegou depois do cancelamento é recusado (409)", recusados === 3, { recusados });
  conferir("e nada é lançado: o histórico financeiro não ganha recebimento sem reserva", lancados === 0, { lancados });
}
{
  const r = await reservaDaLoja(61);
  const trava = segurar(r.id, 1200);
  await esperar(150);
  const pagamento = pagarNoPainel(r.id); // entra na fila primeiro
  await esperar(250);
  const liberacao = liberar();
  const [, resposta] = await Promise.all([trava, pagamento, liberacao]);
  const e = await estado(r.id);
  conferir(
    "pagamento antes da liberação: registrado e confirmado, nunca cancelado",
    (resposta.status === 201 || resposta.status === 200) && e.reserva === "CONFIRMED" && !e.etapas.includes("PENDING>CANCELLED"),
    { status: resposta.status, e },
  );
}
{
  const r = await reservaDaLoja(5);
  await aux("POST", "/__pag/ja-cancelada", { reservaId: r.id });
  const resposta = await pagarNoPainel(r.id);
  conferir("reserva já cancelada: o pagamento manual é recusado, como sempre", resposta.status >= 400 && resposta.status < 500, resposta.json);
}
await encerrarCena();

// ============================================================================
console.log("B2. Pix pago no Mercado Pago, aviso (webhook) ainda não registrado");
{
  const r = await reservaDaLoja(120);
  const p = await pix(r.id, -90);
  await provedor({ referencia: p.externalReference, modoDaReferencia: "pago" });
  await liberar();
  const e = await estado(r.id);
  conferir("a liberação pergunta antes: o pagamento é registrado agora", e.pagamentos.includes("PIX:PAID"), e);
  conferir("e a reserva é confirmada, não cancelada", e.reserva === "CONFIRMED" && !e.etapas.includes("PENDING>CANCELLED"), e.etapas);
  conferir("nenhuma pendência de pagamento após cancelamento", e.aposCancelamento === 0, e);
}
await encerrarCena();

// ============================================================================
console.log("B3. Pix válido além do prazo (gerado antes da regra de validade): pago dentro da validade, protegido");
{
  const r = await reservaDaLoja(61);
  await pix(r.id, -31, { status: "FAILED" }); // o primeiro, trocado pelo novo
  const novo = await pix(r.id, 19); // gerado aos 50 min: vale até os 80
  await provedor({ modo: "nao-pago" });
  await liberar();
  let e = await estado(r.id);
  conferir("com Pix ainda pagável, a reserva não é liberada", e.reserva === "PENDING", e);
  // A cliente paga aos 70 min e o aviso chega.
  await aux("POST", "/__pag/webhook-pago", { paymentId: novo.id });
  e = await estado(r.id);
  conferir("pago dentro da validade: a reserva é confirmada (sem pagamento após cancelamento)", e.reserva === "CONFIRMED" && e.aposCancelamento === 0, e);
}
{
  // O mesmo, mas a cliente não paga: depois que o QR vence e o Mercado
  // Pago confirma que não houve pagamento, a reserva é liberada.
  const r = await reservaDaLoja(61);
  const novo = await pix(r.id, 19);
  await liberar();
  conferir("enquanto o QR vale, segura", (await estado(r.id)).reserva === "PENDING");
  // O tempo passa: o QR vence, e o Mercado Pago confirma que não houve pagamento.
  await provedor({ referencia: novo.externalReference, modoDaReferencia: "nao-pago" });
  await aux("POST", "/__pag/vencer-pix", { paymentId: novo.id });
  await liberar();
  const e = await estado(r.id);
  conferir("QR vencido e confirmado sem pagamento: a reserva é liberada", e.reserva === "CANCELLED", e);
  conferir("e a cobrança não fica aguardando pagamento", !e.pagamentos.includes("PIX:PENDING"), e.pagamentos);
}
await encerrarCena();

// ============================================================================
console.log("B4. Mercado Pago fora do ar");
{
  const r = await reservaDaLoja(120);
  const p = await pix(r.id, -90);
  await provedor({ referencia: p.externalReference, modoDaReferencia: "fora-do-ar" });
  await liberar();
  let e = await estado(r.id);
  conferir("sem confirmar o pagamento, a reserva não é liberada (verificação pendente)", e.reserva === "PENDING" && !e.etapas.includes("PENDING>CANCELLED"), e);
  await provedor({ referencia: p.externalReference, modoDaReferencia: "nao-pago" });
  await liberar();
  e = await estado(r.id);
  conferir("o provedor volta e confirma que não houve pagamento: liberada", e.reserva === "CANCELLED", e);
}
await encerrarCena();

// ============================================================================
console.log("B5. Pagamento em análise, resposta divergente, Pix sem resposta");
for (const [modo, nome] of [
  ["em-analise", "pagamento em análise no provedor"],
  ["valor-divergente", "aprovado com valor diferente (alerta)"],
  ["sem-resposta", "Pix que o provedor não encontra"],
]) {
  const r = await reservaDaLoja(120);
  const p = await pix(r.id, -90);
  await provedor({ referencia: p.externalReference, modoDaReferencia: modo });
  await liberar();
  const e = await estado(r.id);
  conferir(`${nome}: não libera, nem registra o pagamento`, e.reserva === "PENDING" && !e.pagamentos.includes("PIX:PAID"), e);
}
await encerrarCena();

// ============================================================================
console.log("B6. Pix trocado por um novo, mas pago no último minuto");
{
  const r = await reservaDaLoja(120);
  const antigo = await pix(r.id, -90, { status: "FAILED" }); // marcado recusado ao gerar outro, sem perguntar
  await provedor({ referencia: antigo.externalReference, modoDaReferencia: "pago" });
  await liberar();
  const e = await estado(r.id);
  conferir("a liberação confere o Pix recusado sem consulta: estava pago, reserva confirmada", e.reserva === "CONFIRMED" && e.pagamentos.includes("PIX:PAID"), e);
}
await encerrarCena();

// ============================================================================
console.log("B7. Geração de Pix e liberação concorrentes; Pix depois do cancelamento");
{
  // Liberação primeiro na fila: cancela; a geração do Pix vem depois e recusa.
  const r = await reservaDaLoja(61);
  await provedor({ modo: "nao-pago" });
  const trava = segurar(r.id, 1200);
  await esperar(150);
  const liberacao = liberar();
  await esperar(250);
  const geracao = auxBruto("POST", "/__pag/gerar-pix", { eventId: r.eventId });
  const [, , gerado] = await Promise.all([trava, liberacao, geracao]);
  const e = await estado(r.id);
  conferir("reserva liberada e nenhum Pix nasceu para ela", e.reserva === "CANCELLED" && gerado.status === 409 && !e.pagamentos.includes("PIX:PENDING"), { gerado: gerado.status, e });
}
{
  // Geração primeiro na fila, mas depois do prazo: pela regra de validade, o
  // Pix não nasce (nenhum prazo novo); a liberação segue a conferência.
  const r = await reservaDaLoja(61);
  const trava = segurar(r.id, 1200);
  await esperar(150);
  const geracao = auxBruto("POST", "/__pag/gerar-pix", { eventId: r.eventId });
  await esperar(250);
  const liberacao = liberar();
  const [, gerado] = await Promise.all([trava, geracao, liberacao]);
  const e = await estado(r.id);
  conferir(
    "depois do prazo nenhum Pix novo nasce (409), e a reserva sem pagamento é liberada",
    gerado.status === 409 && gerado.json?.codigo === "PRAZO_DO_SINAL_ENCERRADO" && e.reserva === "CANCELLED" && !e.pagamentos.includes("PIX:PENDING"),
    { gerado: gerado.json, e },
  );
}
{
  // Dentro do prazo, na fila antes da liberação: o Pix nasce, e a reserva
  // (ainda no prazo) nem é candidata à liberação.
  const r = await reservaDaLoja(10);
  const trava = segurar(r.id, 1200);
  await esperar(150);
  const geracao = auxBruto("POST", "/__pag/gerar-pix", { eventId: r.eventId });
  await esperar(250);
  const liberacao = liberar();
  const [, gerado] = await Promise.all([trava, geracao, liberacao]);
  const e = await estado(r.id);
  conferir("dentro do prazo: Pix gerado e a reserva segue aguardando o sinal", gerado.status === 200 && e.reserva === "PENDING", { gerado: gerado.status, e });
}
{
  const r = await reservaDaLoja(5);
  await aux("POST", "/__pag/ja-cancelada", { reservaId: r.id });
  const gerado = await auxBruto("POST", "/__pag/gerar-pix", { eventId: r.eventId });
  conferir("reserva cancelada não gera Pix novo", gerado.status === 409, gerado.json);
}
await encerrarCena();

// ============================================================================
console.log("B9. Validade do Pix: a regeneração não amplia o prazo da reserva");
const pixNoApp = async (eventId) => {
  const { token } = await aux("GET", `/__pag/token-da-cliente?eventId=${eventId}`);
  return http("POST", `${API}/events/${eventId}/order/payments`, { type: "DEPOSIT", method: "PIX" }, token);
};
{
  const r = await reservaDaLoja(5);
  const { requestedAt } = await aux("GET", `/__pag/evento-da-reserva?reservaId=${r.id}`);
  const prazo = new Date(requestedAt).getTime() + 60 * 60_000;
  const antes = Date.now();
  const g = await pixNoApp(r.eventId);
  const vale = g.json?.expiresAt ? new Date(g.json.expiresAt).getTime() : NaN;
  conferir("no começo do prazo, o Pix sai pela rota do app com 30 minutos", g.status === 201 && Math.abs(vale - antes - 30 * 60_000) < 15_000, g.json ?? g.texto);
  conferir("e vence antes do fim do prazo da reserva", vale <= prazo - 60_000, { vale, prazo });
}
{
  // O primeiro Pix venceu aos 31 minutos; faltam 29 para o prazo.
  const r = await reservaDaLoja(31);
  await pix(r.id, -1);
  const antes = (await estado(r.id)).pagamentos.length;
  const g = await pixNoApp(r.eventId);
  const depois = await estado(r.id);
  conferir("regenerar sem 30 minutos até o prazo é recusado (409 PRAZO_DO_SINAL_INSUFICIENTE)", g.status === 409 && g.json?.codigo === "PRAZO_DO_SINAL_INSUFICIENTE", g.json);
  conferir(
    "a cliente recebe a orientação no texto que o app mostra (horário do prazo, já pagou, WhatsApp)",
    /termina às \d\d:\d\d/.test(g.json?.message ?? "") && g.json.message.includes("Se você já pagou") && g.json.message.includes("WhatsApp"),
    g.json?.message,
  );
  conferir("nenhuma cobrança nova é criada nem cancelada, e a reserva segue no prazo", depois.pagamentos.length === antes && depois.reserva === "PENDING", { antes, depois });
}
{
  // Prazo já encerrado, mas a liberação ainda não pôde confirmar (Mercado
  // Pago fora do ar): sem Pix novo, e as peças continuam seguras.
  const r = await reservaDaLoja(70);
  const velho = await pix(r.id, -40);
  await provedor({ referencia: velho.externalReference, modoDaReferencia: "fora-do-ar" });
  const g = await pixNoApp(r.eventId);
  await liberar();
  const e = await estado(r.id);
  conferir("depois do prazo: recusado (409 PRAZO_DO_SINAL_ENCERRADO), com orientação", g.status === 409 && g.json?.codigo === "PRAZO_DO_SINAL_ENCERRADO" && (g.json?.message ?? "").includes("terminou às"), g.json);
  conferir("em verificação pendente, a reserva não é liberada", e.reserva === "PENDING", e);
  // O Mercado Pago volta e diz que o Pix (pago dentro da validade) foi pago.
  await provedor({ referencia: velho.externalReference, modoDaReferencia: "pago" });
  await liberar();
  const depois = await estado(r.id);
  conferir("pago dentro da validade e confirmado depois do prazo: registrado e a reserva confirmada", depois.reserva === "CONFIRMED" && depois.pagamentos.includes("PIX:PAID"), depois);
}
{
  // Reserva confirmada (venda manual, sem prazo correndo): o Pix vale 30 minutos.
  const v = await req("POST", "/reservations/manual", {
    cliente: { nome: `Cliente Pagamentos ${suf}`, telefone: telefone() },
    evento: { data: DATA, tipo: "ANIVERSARIO" },
    produtos: { kitId: kit.id, itens: [] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  });
  const { order } = await aux("GET", `/__pag/evento-da-reserva?reservaId=${v.json.id}`);
  const antes = Date.now();
  const g = await pixNoApp(order.eventId);
  const vale = g.json?.expiresAt ? new Date(g.json.expiresAt).getTime() : NaN;
  conferir("sem prazo correndo (reserva confirmada), o Pix sai com 30 minutos", g.status === 201 && Math.abs(vale - antes - 30 * 60_000) < 15_000, g.json ?? g.texto);
}
await encerrarCena();

// ============================================================================
console.log("B10. Tela de pagamento: o prazo mostrado é o mesmo que a geração do Pix aplica");
const prazoNoApp = async (eventId, token) => {
  const t = token ?? (await aux("GET", `/__pag/token-da-cliente?eventId=${eventId}`)).token;
  return http("GET", `${API}/events/${eventId}/order/prazo-do-sinal`, undefined, t);
};
const horarioChapeco = (d) => new Date(d.getTime() - 180 * 60_000).toISOString().slice(11, 16);
{
  const r = await reservaDaLoja(5);
  const { requestedAt } = await aux("GET", `/__pag/evento-da-reserva?reservaId=${r.id}`);
  const esperado = new Date(new Date(requestedAt).getTime() + 60 * 60_000);
  const t = await prazoNoApp(r.eventId);
  conferir(
    "no começo: a tela recebe o prazo do servidor (pedido + 60 min) e o horário de Chapecó",
    t.status === 200 && t.json.temPrazo && t.json.prazo === esperado.toISOString() && t.json.horario === horarioChapeco(esperado) &&
      t.json.podeGerarNovoPix === true && t.json.encerrado === false && t.json.mensagem === null,
    t.json,
  );
  const g = await pixNoApp(r.eventId);
  conferir("o Pix gerado vence antes do horário mostrado", g.status === 201 && new Date(g.json.expiresAt) < esperado, { vence: g.json?.expiresAt, prazo: esperado });
}
{
  const r = await reservaDaLoja(31);
  await pix(r.id, -1);
  const t = await prazoNoApp(r.eventId);
  const g = await pixNoApp(r.eventId);
  conferir("sem tempo para um Pix novo: a tela já sabe, sem precisar tentar", t.json?.podeGerarNovoPix === false && t.json?.motivo === "PRAZO_DO_SINAL_INSUFICIENTE" && t.json?.encerrado === false, t.json);
  conferir("e a mensagem da tela é idêntica à da recusa da geração", g.status === 409 && t.json?.mensagem === g.json?.message, { tela: t.json?.mensagem, geracao: g.json?.message });
}
{
  const r = await reservaDaLoja(70);
  const velho = await pix(r.id, -40);
  await provedor({ referencia: velho.externalReference, modoDaReferencia: "fora-do-ar" });
  const t = await prazoNoApp(r.eventId);
  const g = await pixNoApp(r.eventId);
  conferir(
    "depois do prazo: encerrado, com a mesma mensagem da recusa",
    t.json?.encerrado === true && t.json?.motivo === "PRAZO_DO_SINAL_ENCERRADO" && t.json?.mensagem === g.json?.message,
    { tela: t.json, geracao: g.json?.message },
  );
}
{
  const v = await req("POST", "/reservations/manual", {
    cliente: { nome: `Cliente Pagamentos ${suf}`, telefone: telefone() },
    evento: { data: DATA, tipo: "ANIVERSARIO" },
    produtos: { kitId: kit.id, itens: [] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: 100, entrega: 0, montagem: 0, desconto: 0, sinal: 0, formaPagamento: "PIX", statusPagamento: "PENDING" },
    origem: "WHATSAPP",
  });
  const { order } = await aux("GET", `/__pag/evento-da-reserva?reservaId=${v.json.id}`);
  const t = await prazoNoApp(order.eventId);
  conferir("reserva confirmada (sem prazo correndo): a tela não mostra horário", t.status === 200 && t.json?.temPrazo === false, t.json);
}
{
  const r = await reservaDaLoja(5);
  const outra = await reservaDaLoja(5);
  const { token } = await aux("GET", `/__pag/token-da-cliente?eventId=${outra.eventId}`);
  const t = await prazoNoApp(r.eventId, token);
  conferir("outra cliente não lê o prazo desta festa (403)", t.status === 403, t.status);
}
await encerrarCena();

// ============================================================================
console.log("B11. Aviso de pagamento (webhook) atrasado, chegando depois do cancelamento");
{
  // O QR venceu, o Mercado Pago respondeu "não pago" e a reserva foi
  // liberada. Depois chega o aviso de que aquele Pix foi pago (pagamento no
  // último instante, aviso atrasado). O dinheiro não pode sumir, e a reserva
  // não volta sozinha: o acervo pode já ter sido vendido para outra festa.
  const r = await reservaDaLoja(61);
  const qr = await pix(r.id, -2);
  await provedor({ modo: "nao-pago" });
  await liberar();
  let e = await estado(r.id);
  conferir("sem pagamento confirmado, a reserva foi liberada", e.reserva === "CANCELLED", e);
  await aux("POST", "/__pag/webhook-pago", { paymentId: qr.id });
  e = await estado(r.id);
  conferir("o aviso atrasado é registrado: o pagamento fica como pago (o dinheiro não some)", e.pagamentos.some((p) => p.startsWith("PIX:PAID")), e.pagamentos);
  conferir("a reserva não é reaberta sozinha", e.reserva === "CANCELLED" && !e.etapas.includes("CANCELLED>CONFIRMED"), e.etapas);
  conferir("e vira pendência de pagamento após cancelamento, para a equipe tratar", e.aposCancelamento === 1, e);
  await aux("POST", "/__pag/webhook-pago", { paymentId: qr.id }); // o Mercado Pago reenvia o aviso
  e = await estado(r.id);
  conferir(
    "o reenvio do aviso não duplica nada (um pagamento pago, uma pendência)",
    e.aposCancelamento === 1 && e.pagamentos.filter((p) => p.startsWith("PIX:PAID")).length === 1,
    e,
  );
}
await encerrarCena();

// ============================================================================
console.log("B8. Crédito, reexecução e cota de consultas");
{
  const r = await reservaDaLoja(120);
  await aux("POST", "/__pag/credito", { reservaId: r.id, usuarioId: ADMIN_ID });
  await liberar();
  conferir("crédito aplicado: não libera", (await estado(r.id)).reserva === "PENDING");
}
await encerrarCena();
{
  const r = await reservaDaLoja(120);
  await pix(r.id, -90);
  await provedor({ modo: "nao-pago" });
  await Promise.all([liberar(), liberar(), liberar(), liberar()]);
  await liberar();
  const e = await estado(r.id);
  conferir("liberações simultâneas e repetidas: um único cancelamento", e.etapas.filter((x) => x === "PENDING>CANCELLED").length === 1, e.etapas);
}
await encerrarCena();
{
  await provedor({ modo: "nao-pago", zerar: true });
  const varias = [];
  for (let i = 0; i < 7; i++) {
    const r = await reservaDaLoja(120);
    await pix(r.id, -90);
    varias.push(r.id);
  }
  const { consultas } = await liberar();
  const liberadas = (await Promise.all(varias.map(estado))).filter((e) => e.reserva === "CANCELLED").length;
  conferir("uma rodada consulta no máximo 5 cobranças; o resto espera, com as peças", consultas <= 5 && liberadas === consultas, { consultas, liberadas });
  await liberar();
  const depois = (await Promise.all(varias.map(estado))).filter((e) => e.reserva === "CANCELLED").length;
  conferir("a rodada seguinte termina o trabalho", depois === 7, { depois });
}
await encerrarCena();

console.log(`\n${ok} conferências ok, ${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
