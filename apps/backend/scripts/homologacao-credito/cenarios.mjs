// Cenários do crédito Festaê contra o servidor de homologação (banco LOCAL).
// Uso: ver README.md. Cada cenário é regressão de algo que já deu ou podia dar
// errado: receita duplicada, crédito gasto duas vezes, ficha errada, log com valor.
import fs from "node:fs";
import { randomUUID } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:3350";
const API = `${BASE}/api/v1`;
const LOG = process.env.HOMOLOGACAO_LOG;
const ADMIN = (await (await fetch(`${BASE}/__credito/token?papel=ADMIN`)).json()).token;

let ok = 0;
let falhas = 0;
function conferir(nome, cond, extra) {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nome}`);
  } else {
    falhas++;
    console.log(`  ✗ ${nome}`, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : "");
  }
}
async function req(metodo, caminho, corpo, token = ADMIN) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const t = async (c) => (await fetch(BASE + c)).json();
const cents = (v) => Math.round(Number(v) * 100);

const suf = Date.now().toString().slice(-6);
let seq = 0;
const telefone = () => `00${suf}${String(++seq).padStart(3, "0")}`;
// As festas vão para daqui a ~40 dias (datas futuras, dia ≤ 22 em qualquer mês).
const MES_DA_FESTA = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 7);
const MES_ATUAL = new Date().toISOString().slice(0, 7);
const diaDoMes = (d) => `${MES_DA_FESTA}-${String(d).padStart(2, "0")}`;

async function venda({ tel, nome = `Cliente M13 ${suf}-${seq}`, email, total, sinal = 0, pago = false, data = diaDoMes(20), credito, fichaId, chave, obs, token = ADMIN }) {
  const corpo = {
    cliente: { nome, telefone: tel, ...(email ? { email } : {}), ...(fichaId ? { fichaId } : {}) },
    evento: { data, tipo: "ANIVERSARIO", ...(obs ? { observacoes: obs } : {}) },
    produtos: { itens: [] },
    logistica: { fulfillment: "PICKUP", assembly: false },
    financeiro: { valorProdutos: total, entrega: 0, montagem: 0, desconto: 0, sinal, formaPagamento: "PIX", statusPagamento: pago ? "PAID" : "PENDING" },
    origem: "WHATSAPP",
    ...(credito ? { credito } : {}),
    ...(chave ? { chaveDeIdempotencia: chave } : {}),
  };
  return req("POST", "/reservations/manual", corpo, token);
}
async function clienteDoTelefone(tel) {
  const r = await req("GET", `/creditos/por-contato?telefone=${tel}`);
  return r.json?.cliente?.id;
}
/** Cliente com crédito: festa paga e cancelada, com o pago virando crédito. */
async function clienteComCredito(valor, tel = telefone()) {
  const r = await venda({ tel, total: valor, sinal: valor, pago: true, data: diaDoMes(21) });
  if (r.status !== 201) throw new Error(`venda: ${JSON.stringify(r)}`);
  const c = await req("PATCH", `/reservations/${r.json.id}/cancelar`, { motivo: "Desistência", credito: valor });
  if (c.status !== 200) throw new Error(`cancelar: ${JSON.stringify(c)}`);
  return { tel, userId: await clienteDoTelefone(tel), origem: r.json.id };
}
const saldo = async (userId) => (await req("GET", `/clientes/${userId}/creditos`)).json.saldo;
const aplicar = (reserva, valor, chave = randomUUID(), token = ADMIN) =>
  req("POST", `/reservations/${reserva}/creditos`, { valor, chaveDeIdempotencia: chave }, token);
const panorama = async (mes) => (await req("GET", `/financeiro/panorama?ano=${mes.slice(0, 4)}&mes=${mes}`)).json;

console.log("Cenário A: crédito R$ 200, festa R$ 350, aplica R$ 200");
{
  const c = await clienteComCredito(200);
  conferir("cliente com R$ 200 de crédito", (await saldo(c.userId)) === 200);
  const festa = await venda({ tel: c.tel, total: 350 });
  // Caixa: o mês de hoje (quando o dinheiro entra). Faturamento: o mês da festa (competência).
  const antes = { caixa: await panorama(MES_ATUAL), festa: await panorama(MES_DA_FESTA) };
  const entradasAntes = await t("/__credito/entradas");
  const r = await aplicar(festa.json.id, 200);
  conferir("aplicado R$ 200", r.status === 201 && r.json.aplicado === 200, r);
  conferir("saldo a pagar R$ 150", r.json?.faltaPagar === 150, r.json);
  conferir("crédito residual R$ 0", r.json?.saldoDaCliente === 0 && (await saldo(c.userId)) === 0);
  const depois = { caixa: await panorama(MES_ATUAL), festa: await panorama(MES_DA_FESTA) };
  const entradasDepois = await t("/__credito/entradas");
  conferir("nenhum pagamento novo: crédito não é recebimento", entradasDepois.quantidade === entradasAntes.quantidade && entradasDepois.soma === entradasAntes.soma, { entradasAntes, entradasDepois });
  conferir("entradas de caixa do mês não mudam", cents(depois.caixa.caixa.entradas) === cents(antes.caixa.caixa.entradas), { antes: antes.caixa.caixa, depois: depois.caixa.caixa });
  conferir("faturamento do mês da festa não muda (sem receita duplicada)", antes.festa.operacional.faturamento > 0 && cents(depois.festa.operacional.faturamento) === cents(antes.festa.operacional.faturamento), { antes: antes.festa.operacional.faturamento, depois: depois.festa.operacional.faturamento });
  conferir("crédito em aberto cai exatamente R$ 200", cents(antes.caixa.creditoEmAberto) - cents(depois.caixa.creditoEmAberto) === 20000, { antes: antes.caixa.creditoEmAberto, depois: depois.caixa.creditoEmAberto });
  const reserva = (await req("GET", `/reservations/${festa.json.id}`)).json;
  conferir("comprovante: valor 350, crédito 200, pagos 0", cents(reserva.order.total) === 35000 && cents(reserva.creditoAplicado) === 20000 && reserva.order.payments.filter((p) => p.status === "PAID").length === 0, { total: reserva.order.total, credito: reserva.creditoAplicado });
}

console.log("Cenário B: crédito R$ 200, festa R$ 350, aplica R$ 100");
let clienteB;
let festaB;
{
  clienteB = await clienteComCredito(200);
  festaB = (await venda({ tel: clienteB.tel, total: 350 })).json.id;
  const r = await aplicar(festaB, 100);
  conferir("aplicado R$ 100, falta R$ 250", r.status === 201 && r.json.faltaPagar === 250, r.json);
  conferir("crédito residual R$ 100", (await saldo(clienteB.userId)) === 100);
  const extrato = (await req("GET", `/clientes/${clienteB.userId}/creditos`)).json;
  const soma = extrato.movimentos.reduce((s, m) => s + cents(m.valor), 0);
  conferir("extrato: saldo é a soma dos movimentos", soma === cents(extrato.saldo) && extrato.movimentos.length === 2, extrato.movimentos);
}

console.log("Limites e recusas");
{
  conferir("acima do saldo: recusado", (await aplicar(festaB, 150)).status === 409);
  const pequena = (await venda({ tel: clienteB.tel, total: 50 })).json.id;
  const r = await aplicar(pequena, 100);
  conferir("acima do que falta pagar: recusado", r.status === 409, r.json);
  conferir("zero ou negativo: recusado", (await aplicar(pequena, 0)).status === 400 && (await aplicar(pequena, -5)).status === 400);
  const cancelada = (await venda({ tel: clienteB.tel, total: 80 })).json.id;
  await req("PATCH", `/reservations/${cancelada}/cancelar`, { motivo: "Teste" });
  conferir("reserva cancelada: recusada", (await aplicar(cancelada, 10)).status === 400);
  conferir("saldo intacto depois das recusas", (await saldo(clienteB.userId)) === 100);
}

console.log("Reenvio e idempotência");
{
  const c = await clienteComCredito(300);
  const festa = (await venda({ tel: c.tel, total: 500 })).json.id;
  const chave = randomUUID();
  const r1 = await aplicar(festa, 120, chave);
  const r2 = await aplicar(festa, 120, chave);
  conferir("reenvio com a mesma chave: mesmo movimento, marcado como repetido", r1.status === 201 && r2.status === 201 && r2.json.movimentoId === r1.json.movimentoId && r2.json.repetido === true, { r1: r1.json, r2: r2.json });
  conferir("crédito gasto uma vez só", (await saldo(c.userId)) === 180);
  const r3 = await aplicar(festa, 50, chave);
  conferir("mesma chave com outro valor: recusada", r3.status === 409 && r3.json?.codigo === "CHAVE_DE_OUTRA_OPERACAO", r3.json);
  const chave2 = randomUUID();
  const juntos = await Promise.all([1, 2, 3].map(() => aplicar(festa, 30, chave2)));
  const movs = (await t(`/__credito/movimentos?userId=${c.userId}`)).filter((m) => m.chave === chave2);
  conferir("três envios simultâneos com a mesma chave: um movimento só", juntos.every((x) => x.status === 201) && movs.length === 1, juntos.map((x) => x.status));
  conferir("saldo depois disso: 150", (await saldo(c.userId)) === 150);
}

console.log("Concorrência com chaves diferentes");
{
  const c = await clienteComCredito(100);
  const f1 = (await venda({ tel: c.tel, total: 100 })).json.id;
  const f2 = (await venda({ tel: c.tel, total: 100 })).json.id;
  const rs = await Promise.all([aplicar(f1, 100), aplicar(f2, 100)]);
  const status = rs.map((r) => r.status).sort();
  conferir("duas aplicações de R$ 100 com R$ 100 de saldo: uma passa, outra é recusada", status[0] === 201 && status[1] === 409, status);
  conferir("saldo nunca negativo", (await saldo(c.userId)) === 0);
}

console.log("Estorno e permissões");
{
  const ops = (await t("/__credito/token?papel=OPS")).token;
  const cliente = (await t("/__credito/token?papel=CLIENT")).token;
  const c = await clienteComCredito(150);
  const festa = (await venda({ tel: c.tel, total: 300 })).json.id;
  const porOps = await aplicar(festa, 50, randomUUID(), ops);
  conferir("OPS aplica crédito", porOps.status === 201, porOps.json);
  conferir("cliente (CLIENT) não aplica", (await aplicar(festa, 10, randomUUID(), cliente)).status === 403);
  conferir("sem login não aplica", (await aplicar(festa, 10, randomUUID(), null)).status === 401);
  const extrato = (await req("GET", `/clientes/${c.userId}/creditos`)).json;
  const uso = extrato.movimentos.find((m) => m.tipo === "CREDITO_UTILIZADO");
  conferir("o extrato registra quem aplicou", uso?.criadoPor === "Equipe OPS", uso);
  conferir("OPS não estorna", (await req("POST", `/creditos/${porOps.json.movimentoId}/estorno`, { motivo: "Lançado por engano" }, ops)).status === 403);
  const e1 = await req("POST", `/creditos/${porOps.json.movimentoId}/estorno`, { motivo: "Lançado por engano" });
  const e2 = await req("POST", `/creditos/${porOps.json.movimentoId}/estorno`, { motivo: "Lançado por engano" });
  conferir("ADMIN estorna uma vez; a segunda é recusada", e1.status === 201 && e2.status === 409, { e1: e1.status, e2: e2.status });
  conferir("estorno devolve ao saldo", (await saldo(c.userId)) === 150);
  // Pedido de crédito gravado, resposta perdida, festa cancelada depois: o reenvio devolve o que foi gravado.
  const festa2 = (await venda({ tel: c.tel, total: 100 })).json.id;
  const chave = randomUUID();
  const primeiro = await aplicar(festa2, 40, chave);
  await req("PATCH", `/reservations/${festa2}/cancelar`, { motivo: "Desistência" });
  const reenvio = await aplicar(festa2, 40, chave);
  conferir("reenvio depois do cancelamento: devolve o movimento gravado, não erro", primeiro.status === 201 && reenvio.status === 201 && reenvio.json.repetido === true && reenvio.json.movimentoId === primeiro.json.movimentoId, { primeiro: primeiro.json, reenvio: reenvio.json });
  conferir("pedido novo em festa cancelada continua recusado", (await aplicar(festa2, 10)).status === 400);
}

console.log("Extrato imutável (gatilho no banco)");
{
  const c = await clienteComCredito(40);
  const [mov] = await t(`/__credito/movimentos?userId=${c.userId}`);
  const r = await t(`/__credito/mexer-no-credito?id=${mov.id}`);
  conferir("alterar e apagar um movimento são recusados pelo banco", r.erros.length === 2 && r.erros.every((e) => e.includes("registro definitivo")) && r.valor === 40, r);
}

console.log("Venda manual com crédito: transação e idempotência");
{
  const c = await clienteComCredito(200);
  const chave = randomUUID();
  const credito = { clienteId: c.userId, valor: 120 };
  const v1 = await venda({ tel: c.tel, total: 350, credito, chave });
  const v2 = await venda({ tel: c.tel, total: 350, credito, chave });
  conferir("venda com crédito criada", v1.status === 201, v1.json);
  conferir("reenvio devolve a mesma reserva", v2.status === 201 && v2.json.id === v1.json.id, { v1: v1.json?.id, v2: v2.json?.id });
  const antes = (await t(`/__credito/reservas-da-cliente?userId=${c.userId}`)).total;
  const chave2 = randomUUID();
  const juntos = await Promise.all([1, 2].map(() => venda({ tel: c.tel, total: 200, credito: { clienteId: c.userId, valor: 30 }, chave: chave2 })));
  const depois = (await t(`/__credito/reservas-da-cliente?userId=${c.userId}`)).total;
  conferir("dois envios simultâneos: uma festa a mais, não duas", depois - antes === 1 && juntos.every((x) => x.status === 201) && juntos[0].json.id === juntos[1].json.id, { antes, depois, s: juntos.map((x) => x.status) });
  conferir("crédito gasto uma vez em cada venda", (await saldo(c.userId)) === 50);
  const outra = await clienteComCredito(80);
  const errada = await venda({ tel: c.tel, total: 100, credito: { clienteId: outra.userId, valor: 50 } });
  conferir("crédito de outra ficha: recusado", errada.status === 409 && errada.json?.codigo === "CREDITO_DE_OUTRA_FICHA", errada.json);
  conferir("o crédito da outra cliente ficou intacto", (await saldo(outra.userId)) === 80);
}

console.log("Venda manual: reenvio com saldo para uma só, e reenvio corrigido");
{
  const c = await clienteComCredito(100);
  const chave = randomUUID();
  const credito = { clienteId: c.userId, valor: 100 };
  const antes = (await t(`/__credito/reservas-da-cliente?userId=${c.userId}`)).total;
  const juntos = await Promise.all([1, 2, 3].map(() => venda({ tel: c.tel, total: 300, credito, chave })));
  const depois = (await t(`/__credito/reservas-da-cliente?userId=${c.userId}`)).total;
  conferir(
    "três envios simultâneos usando todo o saldo: todos recebem a mesma festa (nenhum 'saldo insuficiente')",
    juntos.every((x) => x.status === 201 && x.json.id === juntos[0].json.id),
    juntos.map((x) => [x.status, x.json?.codigo ?? x.json?.id]),
  );
  conferir("uma festa a mais, um uso de crédito só", depois - antes === 1 && (await t(`/__credito/movimentos?userId=${c.userId}`)).filter((m) => m.tipo === "CREDITO_UTILIZADO").length === 1);
  conferir("saldo zerado uma vez", (await saldo(c.userId)) === 0);
  const outraData = await venda({ tel: c.tel, total: 300, credito, chave, data: diaDoMes(22) });
  conferir("mesma chave com a data corrigida: recusada, sem gravar nada", outraData.status === 409 && outraData.json?.codigo === "CHAVE_DE_OUTRA_OPERACAO" && outraData.json?.reservaId === juntos[0].json.id, outraData.json);
  const outroTotal = await venda({ tel: c.tel, total: 320, credito, chave });
  conferir("mesma chave com o total corrigido: recusada", outroTotal.status === 409 && outroTotal.json?.codigo === "CHAVE_DE_OUTRA_OPERACAO", outroTotal.json);
  conferir("nenhuma festa nova depois das recusas", (await t(`/__credito/reservas-da-cliente?userId=${c.userId}`)).total === depois);
}

console.log("Venda manual sem crédito: reenvio e correção");
{
  const tel = telefone();
  const chave = randomUUID();
  const v1 = await venda({ tel, total: 150, chave });
  const v2 = await venda({ tel, total: 150, chave });
  conferir("sem crédito, o reenvio também devolve a mesma reserva", v1.status === 201 && v2.status === 201 && v2.json.id === v1.json.id, { v1: v1.json?.id, v2: v2.json?.id });
  const userId = await clienteDoTelefone(tel);
  const chave2 = randomUUID();
  const juntos = await Promise.all([1, 2, 3].map(() => venda({ tel, total: 90, chave: chave2 })));
  conferir(
    "três envios simultâneos sem crédito: uma festa só",
    juntos.every((x) => x.status === 201 && x.json.id === juntos[0].json.id) && (await t(`/__credito/reservas-da-cliente?userId=${userId}`)).total === 2,
    juntos.map((x) => [x.status, x.json?.codigo ?? x.json?.id]),
  );
  const entradasAntes = await t("/__credito/entradas");
  const comSinal = await venda({ tel, total: 150, chave, sinal: 100, pago: true });
  conferir("reenvio com o sinal marcado como recebido: recusado, e nenhum pagamento gravado", comSinal.status === 409 && comSinal.json?.codigo === "CHAVE_DE_OUTRA_OPERACAO" && comSinal.json?.reservaId === v1.json.id && (await t("/__credito/entradas")).quantidade === entradasAntes.quantidade, comSinal.json);
  const comObs = await venda({ tel, total: 150, chave, obs: "Entrega pelo portão lateral" });
  conferir("reenvio com a observação corrigida: recusado", comObs.status === 409 && comObs.json?.codigo === "CHAVE_DE_OUTRA_OPERACAO", comObs.json);
  conferir("nenhuma festa nova depois das recusas", (await t(`/__credito/reservas-da-cliente?userId=${userId}`)).total === 2);
}

console.log("Identificação da cliente");
{
  const tel = telefone();
  const mae = (await t(`/__credito/ficha?nome=Mae%20${suf}&telefone=${tel}&email=mae${suf}@exemplo.invalid`)).id;
  const filha = (await t(`/__credito/ficha?nome=Filha%20${suf}&telefone=${tel}`)).id;
  const consulta = await req("GET", `/creditos/por-contato?telefone=${tel}`);
  conferir("mesmo telefone em duas fichas: ambígua, com as opções", consulta.json?.situacao === "AMBIGUA" && consulta.json.candidatas.length === 2, consulta.json);
  const c0 = consulta.json.candidatas[0];
  conferir("as opções não trazem o saldo de cada ficha", consulta.json.candidatas.every((c) => !("saldo" in c)), consulta.json.candidatas);
  conferir("contato mascarado nas opções", c0.telefone.startsWith("••••") && !c0.telefone.includes(tel.slice(0, 6)) && (c0.email === null || c0.email.includes("•••")), c0);
  const semEscolha = await venda({ tel, total: 100 });
  conferir("venda sem escolher a ficha: recusada com as opções", semEscolha.status === 409 && semEscolha.json?.codigo === "FICHA_AMBIGUA", semEscolha.json);
  const outraPessoa = (await t(`/__credito/ficha?nome=Outra%20${suf}&telefone=${telefone()}`)).id;
  const invalida = await venda({ tel, total: 100, fichaId: outraPessoa });
  conferir("escolha de ficha que não bate com o contato: recusada", invalida.status === 409 && invalida.json?.codigo === "FICHA_INVALIDA", invalida.json);
  const certa = await venda({ tel, total: 100, fichaId: filha });
  conferir("com a ficha escolhida: a venda vai para ela", certa.status === 201 && (await t(`/__credito/reservas-da-cliente?userId=${filha}`)).total === 1 && (await t(`/__credito/reservas-da-cliente?userId=${mae}`)).total === 0);
  const escolhida = await req("GET", `/creditos/por-contato?telefone=${tel}&fichaId=${filha}`);
  conferir("o crédito é perguntado só para a ficha escolhida", escolhida.json?.situacao === "UNICA" && escolhida.json.cliente.id === filha && typeof escolhida.json.saldo === "number", escolhida.json);

  const tel2 = telefone();
  const ana = (await t(`/__credito/ficha?nome=Ana%20${suf}&telefone=${tel2}&email=Ana.${suf}@Exemplo.invalid`)).id;
  const porEmail = await req("GET", `/creditos/por-contato?telefone=${telefone()}&email=ana.${suf}@exemplo.invalid`);
  conferir("e-mail com outra capitalização encontra a ficha", porEmail.json?.situacao === "UNICA" && porEmail.json.cliente.id === ana, porEmail.json);
  for (const curinga of [`a_a.${suf}@exemplo.invalid`, `an%.${suf}@exemplo.invalid`, `%@exemplo.invalid`]) {
    const r = await req("GET", `/creditos/por-contato?telefone=${telefone()}&email=${encodeURIComponent(curinga)}`);
    conferir(`e-mail com curinga "${curinga.split("@")[0]}" não acha a ficha de outra pessoa`, r.json?.situacao === "NOVA", r.json);
  }
  const vendaCuringa = await venda({ tel: telefone(), email: `a_a.${suf}@exemplo.invalid`, total: 60 });
  conferir("venda com '_' no e-mail não vai para a ficha parecida", vendaCuringa.status === 201 && (await t(`/__credito/reservas-da-cliente?userId=${ana}`)).total === 0, vendaCuringa.json);

  const tel3 = telefone();
  const antiga = (await t(`/__credito/ficha?nome=Antiga%20${suf}&telefone=${tel3}`)).id;
  const novaComEmail = await req("GET", `/creditos/por-contato?telefone=${tel3}&email=nova${suf}@exemplo.invalid`);
  conferir("ficha antiga só com telefone e venda com e-mail: é ela (antes virava ficha nova)", novaComEmail.json?.situacao === "UNICA" && novaComEmail.json.cliente.id === antiga, novaComEmail.json);
  const comEmail = await venda({ tel: tel3, email: `nova${suf}@exemplo.invalid`, total: 90 });
  conferir("a venda vai para a ficha antiga", comEmail.status === 201 && (await t(`/__credito/reservas-da-cliente?userId=${antiga}`)).total === 1, comEmail.json);
  const soPeloEmail = await req("GET", `/creditos/por-contato?telefone=${telefone()}&email=NOVA${suf}@exemplo.invalid`);
  conferir("o e-mail digitado ficou na ficha antiga (antes se perdia)", soPeloEmail.json?.situacao === "UNICA" && soPeloEmail.json.cliente.id === antiga, soPeloEmail.json);
}

console.log("Logs sem valores");
{
  const log = LOG ? fs.readFileSync(LOG, "utf8").split("\n") : [];
  const linhas = log.filter((l) => /Crédito aplicado|Pedido repetido|cancelada por|Pagamento \(|Reembolso da reserva|Venda manual repetida/.test(l));
  conferir("há linhas de crédito e cancelamento no log", linhas.length > 0);
  conferir("nenhuma com valor em reais", linhas.every((l) => !/R\$|\d+,\d{2}/.test(l)), linhas.filter((l) => /R\$|\d+,\d{2}/.test(l)).slice(0, 3));
}

console.log(`\n${ok} ok, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
