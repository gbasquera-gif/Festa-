// Cenários de contas a pagar e despesas recorrentes contra o servidor de
// homologação (banco LOCAL, dados fictícios). Uso: ver README.md.
//
// Os cenários de data chamam os serviços com um "hoje" escolhido (fevereiro,
// virada de ano, pausa e retomada); os de permissão, pagamento e indicadores
// passam pela API HTTP de verdade, com o relógio de verdade.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3360";
const API = `${BASE}/api/v1`;
const EMAILS = process.env.EMAILS;
const LOG = process.env.HOMOLOGACAO_LOG;

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
  return { status: r.status, json: await r.json().catch(() => null) };
}
const tokenDe = async (papel) => (await http("GET", `${BASE}/__contas/token?papel=${papel}`)).json;
const { token: ADMIN, id: ADMIN_ID } = await tokenDe("ADMIN");
const { token: OPS } = await tokenDe("OPS");
const { token: CLIENTE } = await tokenDe("CLIENT");
const req = (metodo, caminho, corpo, token = ADMIN) => http(metodo, API + caminho, corpo, token);
const aux = async (metodo, caminho, corpo) => {
  const r = await http(metodo, BASE + caminho, corpo);
  return r.status === 200 ? r.json : { __erro: r.status, ...r.json };
};
const chamar = (servico, metodo, ...args) => aux("POST", "/__contas/chamar", { servico, metodo, args });
const gerar = (hoje, recorrenciaId) => aux("POST", "/__contas/gerar", { hoje, recorrenciaId });
const gastos = (recorrenciaId) => aux("GET", `/__contas/gastos?recorrenciaId=${recorrenciaId}`);
const tarefa = (agora, extra = {}) => aux("POST", "/__contas/tarefa", { agora, ...extra });
const cents = (v) => Math.round(Number(v) * 100);
const suf = Date.now().toString().slice(-6);

const recorrencia = (parcial = {}) => ({
  descricao: `Aluguel ${suf}`,
  natureza: "CUSTEIO",
  categoria: null,
  fornecedor: null,
  tipoDeValor: "FIXO",
  valorPrevisto: 1500,
  intervaloMeses: 1,
  diaDoVencimento: 10,
  dataInicial: "2026-07-01",
  dataFinal: null,
  ajusteDiaInexistente: "ULTIMO_DIA_DO_MES",
  ajusteDiaNaoUtil: "MANTER",
  chave: randomUUID(),
  ...parcial,
});
const criar = async (hoje, parcial) => chamar("recorrencias", "criar", recorrencia(parcial), ADMIN_ID, hoje);
const competencias = (lista) => lista.map((g) => g.competencia).join(",");
const vencimentos = (lista) => lista.map((g) => g.venceEm).join(",");
const todasCriadas = [];

console.log("A. Geração mensal, meses e anos diferentes, retroativos só por ação explícita");
{
  const r = await criar("2026-10-28", { descricao: `Aluguel A ${suf}` });
  todasCriadas.push(r.recorrencia.id);
  const id = r.recorrencia.id;
  conferir("cadastro em 28/10 com dia 10 gera só novembro (outubro já venceu)", r.geracao.geradas === 1, r.geracao);
  conferir(
    "julho a outubro ficam só como oferta",
    r.retroativas.map((o) => o.competencia).join(",") === "2026-07,2026-08,2026-09,2026-10",
    r.retroativas,
  );
  let g = await gastos(id);
  conferir("novembro vence 10/11, em aberto, R$ 1.500", g.length === 1 && g[0].venceEm === "2026-11-10" && g[0].pagoEm === null && g[0].valor === 1500, g);
  const de2 = await gerar("2026-10-28", id);
  conferir("gerar de novo no mesmo dia não cria nada", de2.geradas === 0 && de2.jaExistiam === 1, de2);
  await gerar("2026-11-15", id);
  await gerar("2026-12-20", id);
  g = await gastos(id);
  conferir("dezembro e janeiro do ano seguinte, um de cada", competencias(g) === "2026-11,2026-12,2027-01", g);
  const retro = await chamar("recorrencias", "gerarRetroativas", id, ["2026-09", "2026-10"], ADMIN_ID, "2026-12-20");
  conferir("setembro e outubro gerados porque foram marcados", retro.resultados?.every((x) => x.resultado === "GERADA"), retro);
  g = await gastos(id);
  conferir("agora são cinco meses, sem repetição", competencias(g) === "2026-09,2026-10,2026-11,2026-12,2027-01", g);
  const invalida = await chamar("recorrencias", "gerarRetroativas", id, ["2026-11"], ADMIN_ID, "2026-12-20");
  conferir("mês já gerado não é aceito como retroativo", invalida.__erro === 400, invalida);
  const antiga = await chamar("recorrencias", "gerarRetroativas", id, ["2026-05"], ADMIN_ID, "2026-12-20");
  conferir("mês antes da data inicial é recusado", antiga.__erro === 400, antiga);
  const repetidos = await chamar("recorrencias", "gerarRetroativas", id, ["2026-08"], ADMIN_ID, "2026-12-20");
  const denovo = await chamar("recorrencias", "gerarRetroativas", id, ["2026-08"], ADMIN_ID, "2026-12-20");
  conferir("o mesmo retroativo pedido duas vezes: a segunda é recusada", repetidos.resultados?.[0]?.resultado === "GERADA" && denovo.__erro === 400, { repetidos, denovo });
}

console.log("B. Fevereiro, dias 29, 30 e 31, fim de semana e feriado");
{
  const b = await criar("2026-11-01", { descricao: `Internet B ${suf}`, diaDoVencimento: 31, dataInicial: "2026-11-01" });
  todasCriadas.push(b.recorrencia.id);
  await gerar("2027-01-15", b.recorrencia.id);
  await gerar("2027-02-10", b.recorrencia.id);
  let g = await gastos(b.recorrencia.id);
  conferir(
    "dia 31: 30/11, 31/12, 31/01, 28/02 (ano comum), 31/03",
    vencimentos(g) === "2026-11-30,2026-12-31,2027-01-31,2027-02-28,2027-03-31",
    vencimentos(g),
  );
  const c = await criar("2028-01-20", {
    descricao: `Software C ${suf}`,
    diaDoVencimento: 30,
    dataInicial: "2027-12-01",
    ajusteDiaInexistente: "PRIMEIRO_DIA_DO_MES_SEGUINTE",
  });
  todasCriadas.push(c.recorrencia.id);
  g = await gastos(c.recorrencia.id);
  conferir("dia 30 em fevereiro bissexto vira 1º de março (opção da conta)", vencimentos(g) === "2028-01-30,2028-03-01", vencimentos(g));
  conferir("dezembro anterior ao cadastro ficou como oferta", c.retroativas.map((o) => o.competencia).join(",") === "2027-12", c.retroativas);
  const d = await criar("2027-02-01", { descricao: `Seguro D ${suf}`, diaDoVencimento: 29, dataInicial: "2027-02-01" });
  todasCriadas.push(d.recorrencia.id);
  g = await gastos(d.recorrencia.id);
  conferir("dia 29: 28/02 em ano comum, 29/03", vencimentos(g) === "2027-02-28,2027-03-29", vencimentos(g));
  const bis = await criar("2028-02-01", { descricao: `Seguro D2 ${suf}`, diaDoVencimento: 29, dataInicial: "2028-02-01" });
  todasCriadas.push(bis.recorrencia.id);
  g = await gastos(bis.recorrencia.id);
  conferir("dia 29 em ano bissexto: 29/02", vencimentos(g) === "2028-02-29,2028-03-29", vencimentos(g));
  const e = await criar("2026-11-01", { descricao: `Contador E ${suf}`, diaDoVencimento: 20, dataInicial: "2026-11-01", ajusteDiaNaoUtil: "ADIAR" });
  todasCriadas.push(e.recorrencia.id);
  g = await gastos(e.recorrencia.id);
  conferir("20/11 (feriado, sexta) adia para 23/11; 20/12 (domingo) para 21/12", vencimentos(g) === "2026-11-23,2026-12-21", vencimentos(g));
  const tri = await criar("2026-10-28", { descricao: `IPTU tri ${suf}`, intervaloMeses: 3, dataInicial: "2026-11-05", diaDoVencimento: 5 });
  todasCriadas.push(tri.recorrencia.id);
  await gerar("2027-01-10", tri.recorrencia.id);
  await gerar("2027-02-10", tri.recorrencia.id);
  g = await gastos(tri.recorrencia.id);
  conferir("trimestral: novembro e fevereiro, nada entre eles", competencias(g) === "2026-11,2027-02", competencias(g));
}

console.log("C. Duplicidade: reexecução, concorrência e lançamento manual");
{
  const f = await criar("2026-10-28", { descricao: `Limpeza F ${suf}`, dataInicial: "2027-05-01", diaDoVencimento: 5 });
  todasCriadas.push(f.recorrencia.id);
  conferir("início no futuro: nada gerado no cadastro", f.geracao.geradas === 0, f.geracao);
  const simultaneas = await Promise.all(Array.from({ length: 6 }, () => gerar("2027-04-20", f.recorrencia.id)));
  const g = await gastos(f.recorrencia.id);
  conferir("seis gerações ao mesmo tempo: um lançamento só", g.length === 1 && g[0].competencia === "2027-05", g);
  conferir("e só uma delas conta como gerada", simultaneas.reduce((t, s) => t + (s.geradas ?? 0), 0) === 1, simultaneas);

  // Conta lançada à mão antes da recorrência existir.
  const fornecedor = `Provedor X ${suf}`;
  const manual = await req("POST", "/financeiro/gastos", {
    descricao: "Internet fibra novembro",
    natureza: "CUSTEIO",
    valor: 120,
    pagoEm: "2026-11-08",
    fornecedor,
  });
  conferir("lançamento manual criado pela tela de Despesas", manual.status === 201, manual);
  const gRec = await criar("2026-11-01", { descricao: `Internet ${suf}`, fornecedor, valorPrevisto: 120, dataInicial: "2026-11-01" });
  todasCriadas.push(gRec.recorrencia.id);
  conferir("novembro parecido com o manual: conferência em vez de lançamento", gRec.geracao.conferenciasAbertas === 1 && gRec.geracao.geradas === 1, gRec.geracao);
  let lista = await gastos(gRec.recorrencia.id);
  conferir("só dezembro foi gerado", competencias(lista) === "2026-12", lista);
  const pendentes = (await req("GET", "/financeiro/conferencias")).json;
  const conf = pendentes.find((p) => p.recorrencia.id === gRec.recorrencia.id);
  conferir("a conferência aponta o lançamento manual", conf?.candidatos?.[0]?.id === manual.json.id, conf);
  const vinc = await req("POST", `/financeiro/conferencias/${conf.id}`, { acao: "VINCULAR", gastoId: manual.json.id });
  conferir("vincular: o manual vira o mês de novembro", vinc.status === 201 && vinc.json.situacao === "VINCULADA", vinc);
  lista = await gastos(gRec.recorrencia.id);
  const nov = lista.find((x) => x.competencia === "2026-11");
  conferir("valor e pagamento do manual ficaram como estavam", nov?.id === manual.json.id && nov.valor === 120 && nov.pagoEm === "2026-11-08", nov);
  const outra = await req("POST", `/financeiro/conferencias/${conf.id}`, { acao: "GERAR" });
  conferir("a mesma conferência não é resolvida duas vezes", outra.status === 409, outra);
  const g2 = await gerar("2026-11-01", gRec.recorrencia.id);
  conferir("gerar de novo não duplica novembro", g2.geradas === 0, g2);

  // "São contas diferentes" e "dispensar".
  const manual2 = await req("POST", "/financeiro/gastos", { descricao: `Energia ${suf} loja`, natureza: "CUSTEIO", valor: 300, venceEm: "2026-11-12" });
  const h = await criar("2026-11-01", { descricao: `Energia ${suf}`, tipoDeValor: "VARIAVEL", valorPrevisto: 280, dataInicial: "2026-11-01", diaDoVencimento: 12 });
  todasCriadas.push(h.recorrencia.id);
  const confH = (await req("GET", "/financeiro/conferencias")).json.find((p) => p.recorrencia.id === h.recorrencia.id);
  const gerarH = await req("POST", `/financeiro/conferencias/${confH.id}`, { acao: "GERAR" });
  lista = await gastos(h.recorrencia.id);
  conferir(
    "gerar: novembro criado e o manual fica avulso",
    gerarH.status === 201 && competencias(lista) === "2026-11,2026-12" && !lista.some((x) => x.id === manual2.json.id),
    { gerarH, lista },
  );
  const manual3 = await req("POST", "/financeiro/gastos", { descricao: `Água ${suf}`, natureza: "CUSTEIO", valor: 90, venceEm: "2026-11-15" });
  const i = await criar("2026-11-01", { descricao: `Água ${suf}`, valorPrevisto: 90, dataInicial: "2026-11-01", diaDoVencimento: 15 });
  todasCriadas.push(i.recorrencia.id);
  const confI = (await req("GET", "/financeiro/conferencias")).json.find((p) => p.recorrencia.id === i.recorrencia.id);
  await req("POST", `/financeiro/conferencias/${confI.id}`, { acao: "DISPENSAR" });
  const g3 = await gerar("2026-11-02", i.recorrencia.id);
  lista = await gastos(i.recorrencia.id);
  conferir("dispensar: novembro não é gerado depois", g3.jaDecididas === 1 && competencias(lista) === "2026-12", { g3, lista });
  conferir("o manual de água seguiu intacto", (await req("GET", "/financeiro/gastos?mes=2026-11")).json.some((x) => x.id === manual3.json.id && x.recorrenciaId === null));

  // Apagar um mês gerado não o faz renascer.
  const dez = lista.find((x) => x.competencia === "2026-12");
  const apagado = await req("DELETE", `/financeiro/gastos/${dez.id}`);
  const g4 = await gerar("2026-11-20", i.recorrencia.id);
  lista = await gastos(i.recorrencia.id);
  conferir("mês apagado em Despesas fica dispensado", apagado.status === 200 && g4.geradas === 0 && lista.length === 0, { g4, lista });
}

console.log("D. Alteração de valores: só contas em aberto, futuras e intocadas");
{
  const j = await criar("2026-09-01", { descricao: `Sala J ${suf}`, dataInicial: "2026-09-01" });
  todasCriadas.push(j.recorrencia.id);
  const id = j.recorrencia.id;
  await gerar("2026-10-15", id);
  let g = await gastos(id);
  const set = g.find((x) => x.competencia === "2026-09");
  const nov = g.find((x) => x.competencia === "2026-11");
  await chamar("contas", "registrarPagamento", set.id, { pagoEm: "2026-09-10", valor: 1500 }, "2026-10-15");
  await req("PATCH", `/financeiro/gastos/${nov.id}`, { valor: 1550 });
  await gerar("2026-11-05", id);
  const edit = await chamar("recorrencias", "editar", id, { valorPrevisto: 1700, diaDoVencimento: 15 }, ADMIN_ID, "2026-11-05");
  g = await gastos(id);
  const por = Object.fromEntries(g.map((x) => [x.competencia, x]));
  conferir("setembro pago não mudou", por["2026-09"].valor === 1500 && por["2026-09"].venceEm === "2026-09-10" && por["2026-09"].pagoEm === "2026-09-10", por["2026-09"]);
  conferir("outubro vencido em aberto não mudou", por["2026-10"].valor === 1500 && por["2026-10"].venceEm === "2026-10-10", por["2026-10"]);
  conferir("novembro: ajuste de valor feito à mão ficou; vencimento acompanhou", por["2026-11"].valor === 1550 && por["2026-11"].venceEm === "2026-11-15", por["2026-11"]);
  conferir("dezembro intocado: novo valor e novo dia", por["2026-12"].valor === 1700 && por["2026-12"].venceEm === "2026-12-15", por["2026-12"]);
  conferir("duas contas alcançadas pela edição", edit.contasAfetadas === 2, edit);
  const hist = await req("GET", `/financeiro/recorrencias/${id}/historico`);
  const evento = hist.json.find((e) => e.tipo === "EDITADA");
  conferir("o histórico guarda o antes e o depois", evento?.antes?.valorPrevisto === 1500 && evento?.depois?.valorPrevisto === 1700, evento);
}

console.log("E. Pausa e retomada");
{
  const k = await criar("2026-09-01", { descricao: `Academia K ${suf}`, dataInicial: "2026-09-01" });
  todasCriadas.push(k.recorrencia.id);
  const id = k.recorrencia.id;
  await gerar("2026-10-20", id);
  let g = await gastos(id);
  await chamar("contas", "registrarPagamento", g[0].id, { pagoEm: "2026-09-09", valor: 1500 }, "2026-10-20");
  const p = await chamar("recorrencias", "pausar", id, ADMIN_ID, "2026-10-20");
  g = await gastos(id);
  conferir("pausa remove só a futura em aberto (novembro)", p.contasRemovidas === 1 && competencias(g) === "2026-09,2026-10", { p, g });
  const parada = await gerar("2026-12-20", id);
  conferir("pausada não gera", parada.recorrencias === 0 && (await gastos(id)).length === 2, parada);
  conferir("pausar de novo é recusado", (await chamar("recorrencias", "pausar", id, ADMIN_ID, "2026-10-21")).__erro === 409);
  const r = await chamar("recorrencias", "retomar", id, ADMIN_ID, "2027-01-05");
  g = await gastos(id);
  conferir("retomada em 05/01: janeiro e fevereiro", competencias(g) === "2026-09,2026-10,2027-01,2027-02", g);
  conferir(
    "novembro e dezembro (pausados) ficam como oferta",
    ["2026-11", "2026-12"].every((c) => r.retroativas.some((o) => o.competencia === c)),
    r.retroativas,
  );
}

console.log("E2. Decisão da conferência sobrevive à pausa");
{
  await req("POST", "/financeiro/gastos", { descricao: `Telefone ${suf}`, natureza: "CUSTEIO", valor: 99, venceEm: "2026-11-20" });
  const t = await criar("2026-11-01", { descricao: `Telefone ${suf}`, valorPrevisto: 99, dataInicial: "2026-11-01", diaDoVencimento: 20 });
  todasCriadas.push(t.recorrencia.id);
  const conf = (await aux("GET", `/__contas/conferencias?recorrenciaId=${t.recorrencia.id}`))[0];
  await chamar("contas", "resolverConferencia", conf.id, { acao: "GERAR" }, ADMIN_ID);
  conferir("conferência resolvida com 'gerar'", competencias(await gastos(t.recorrencia.id)) === "2026-11,2026-12");
  await chamar("recorrencias", "pausar", t.recorrencia.id, ADMIN_ID, "2026-11-05");
  conferir("pausa remove novembro e dezembro", (await gastos(t.recorrencia.id)).length === 0);
  const r = await chamar("recorrencias", "retomar", t.recorrencia.id, ADMIN_ID, "2026-11-06");
  conferir(
    "retomada: novembro volta sem perguntar de novo (a decisão vale) e dezembro é gerado",
    competencias(await gastos(t.recorrencia.id)) === "2026-11,2026-12" && r.geracao.conferenciasAbertas === 0,
    r.geracao,
  );
}

console.log("F. Encerramento");
{
  const l = await criar("2026-09-01", { descricao: `Assinatura L ${suf}`, dataInicial: "2026-09-01" });
  todasCriadas.push(l.recorrencia.id);
  const id = l.recorrencia.id;
  await gerar("2026-10-05", id);
  const e = await chamar("recorrencias", "encerrar", id, ADMIN_ID, "2026-10-05");
  const g = await gastos(id);
  conferir("encerrar remove outubro e novembro em aberto; setembro vencido fica", e.contasRemovidas === 2 && competencias(g) === "2026-09", { e, g });
  const depois = await gerar("2026-12-01", id);
  conferir("encerrada não gera mais", depois.recorrencias === 0);
  conferir("encerrar, editar e retomar de novo são recusados", [
    await chamar("recorrencias", "encerrar", id, ADMIN_ID, "2026-10-06"),
    await chamar("recorrencias", "editar", id, { valorPrevisto: 1 }, ADMIN_ID, "2026-10-06"),
    await chamar("recorrencias", "retomar", id, ADMIN_ID, "2026-10-06"),
  ].every((x) => x.__erro === 409));
}

console.log("G. Pagamento e indicadores financeiros antes e depois (API e relógio de verdade)");
{
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const mes = hoje.slice(0, 7);
  const vence = new Date(Date.parse(`${hoje}T12:00:00Z`) + 2 * 86_400_000).toISOString().slice(0, 10);
  const leitura = async () => ({
    panorama: (await req("GET", `/financeiro/panorama?ano=${mes.slice(0, 4)}&mes=${mes}`)).json,
    indicadores: (await req("GET", `/financeiro/indicadores?mes=${mes}`)).json,
    saldo: (await req("GET", "/financeiro/saldo-de-caixa")).json,
  });
  await req("POST", "/financeiro/saldo-de-caixa", { dia: `${mes}-01`, valor: 50_000, chave: randomUUID() });
  const antes = await leitura();

  const nova = await req("POST", "/financeiro/recorrencias", {
    ...recorrencia({ descricao: `Aluguel real ${suf}`, dataInicial: hoje, diaDoVencimento: Number(vence.slice(8, 10)) }),
  });
  conferir("cadastro pela API (ADMIN): 201", nova.status === 201, nova);
  todasCriadas.push(nova.json.recorrencia.id);
  const repetido = await req("POST", "/financeiro/recorrencias", {
    ...recorrencia({ descricao: `Aluguel real ${suf}`, dataInicial: hoje, diaDoVencimento: Number(vence.slice(8, 10)), chave: undefined }),
    chave: (await req("GET", "/financeiro/recorrencias")).json.find((r) => r.id === nova.json.recorrencia.id).chaveDeIdempotencia,
  });
  conferir("o mesmo envio repetido devolve a mesma despesa", repetido.json?.recorrencia?.id === nova.json.recorrencia.id, repetido.json);
  const depoisDoCadastro = await leitura();
  conferir("cadastrar e gerar não muda o panorama (DRE, caixa, fluxo, distribuição)", JSON.stringify(antes.panorama) === JSON.stringify(depoisDoCadastro.panorama));
  conferir("nem os indicadores do mês", JSON.stringify(antes.indicadores) === JSON.stringify(depoisDoCadastro.indicadores));
  conferir("nem o saldo disponível", JSON.stringify(antes.saldo) === JSON.stringify(depoisDoCadastro.saldo), [antes.saldo, depoisDoCadastro.saldo]);

  const contas = (await req("GET", `/financeiro/contas-a-pagar?mes=${vence.slice(0, 7)}`)).json;
  const conta = contas.contas.find((c) => c.recorrencia?.id === nova.json.recorrencia.id && c.venceEm === vence);
  conferir("a conta aparece em Contas a pagar, próxima do vencimento", conta?.situacao === "PROXIMA", { conta, vence });
  conferir("e entra no total em aberto", contas.indicadores.totalEmAberto >= 1500);

  const futura = await req("POST", `/financeiro/contas-a-pagar/${conta.id}/pagamento`, { pagoEm: vence, valor: 1500 });
  conferir("pagamento com data futura é recusado", futura.status === 400, futura);
  const opsPaga = await req("POST", `/financeiro/contas-a-pagar/${conta.id}/pagamento`, { pagoEm: hoje, valor: 1500 }, OPS);
  conferir("OPS não registra pagamento (403)", opsPaga.status === 403);
  const [p1, p2] = await Promise.all([
    req("POST", `/financeiro/contas-a-pagar/${conta.id}/pagamento`, { pagoEm: hoje, valor: 1234.56, formaDePagamento: "Pix" }),
    req("POST", `/financeiro/contas-a-pagar/${conta.id}/pagamento`, { pagoEm: hoje, valor: 1234.56, formaDePagamento: "Pix" }),
  ]);
  conferir("dois cliques ao mesmo tempo: um pagamento, o outro 409", [p1.status, p2.status].sort().join(",") === "201,409", [p1.status, p2.status]);

  const depoisDoPagamento = await leitura();
  const d = (f) => (cents(f(depoisDoPagamento)) - cents(f(antes))) / 100;
  conferir("despesa do mês sobe exatamente o valor pago", d((x) => x.panorama.operacional.despesas) === 1234.56, d((x) => x.panorama.operacional.despesas));
  conferir("resultado operacional cai o mesmo valor", d((x) => x.panorama.operacional.resultado) === -1234.56);
  conferir("faturamento não muda", d((x) => x.panorama.operacional.faturamento) === 0);
  if (antes.saldo.saldo !== null) {
    conferir("saldo disponível cai o valor pago", d((x) => x.saldo.saldo) === -1234.56, [antes.saldo.saldo, depoisDoPagamento.saldo.saldo]);
  }
  const pago = (await req("GET", `/financeiro/contas-a-pagar?mes=${vence.slice(0, 7)}`)).json.contas.find((c) => c.id === conta.id);
  const aposPagar = (await req("GET", "/financeiro/recorrencias")).json.find((r) => r.id === nova.json.recorrencia.id);
  conferir("o 'próximo vencimento' da despesa pula o mês já pago", aposPagar.proximoVencimento !== null && aposPagar.proximoVencimento > vence, aposPagar.proximoVencimento);
  conferir("a conta paga mostra dia, valor real e forma", pago?.situacao === "PAGA" && pago.pagoEm === hoje && pago.valor === 1234.56 && pago.formaDePagamento === "Pix", pago);

  // Naturezas preservadas.
  const proLaboreErrado = await req("POST", "/financeiro/recorrencias", recorrencia({ descricao: "Pró-labore dos sócios", natureza: "CUSTEIO", dataInicial: hoje }));
  conferir("pró-labore como custeio é recusado (natureza própria)", proLaboreErrado.status === 400, proLaboreErrado.json);
  const acervo = await req("POST", "/financeiro/recorrencias", recorrencia({ descricao: `Painel parcelado ${suf}`, natureza: "ACERVO", dataInicial: hoje, diaDoVencimento: Number(vence.slice(8, 10)), valorPrevisto: 400 }));
  todasCriadas.push(acervo.json.recorrencia.id);
  const contaAcervo = (await req("GET", `/financeiro/contas-a-pagar?mes=${vence.slice(0, 7)}&natureza=ACERVO`)).json.contas.find(
    (c) => c.recorrencia?.id === acervo.json.recorrencia.id && c.venceEm === vence,
  );
  const antesAcervo = await leitura();
  await req("POST", `/financeiro/contas-a-pagar/${contaAcervo.id}/pagamento`, { pagoEm: hoje, valor: 400 });
  const depoisAcervo = await leitura();
  conferir("acervo pago não vira despesa do mês", cents(depoisAcervo.panorama.operacional.despesas) === cents(antesAcervo.panorama.operacional.despesas));
  conferir(
    "acervo pago entra no acervo acumulado",
    cents(depoisAcervo.panorama.acervoAcumulado) - cents(antesAcervo.panorama.acervoAcumulado) === 40000,
    [antesAcervo.panorama.acervoAcumulado, depoisAcervo.panorama.acervoAcumulado],
  );
}

console.log("H. Permissões");
{
  const rotas = [
    ["GET", "/financeiro/contas-a-pagar"],
    ["GET", "/financeiro/recorrencias"],
    ["POST", "/financeiro/recorrencias", recorrencia()],
    ["GET", "/financeiro/conferencias"],
    ["POST", "/financeiro/contas-a-pagar/gerar"],
    ["GET", "/avisos"],
    ["PUT", "/avisos/configuracao", { marcos: [7], horaDoAviso: 8, emailAtivo: false, mostrarValorNoEmail: false }],
    ["POST", "/avisos/destinatarios", { email: "x@exemplo.invalid" }],
    ["GET", "/notificacoes"],
    ["GET", "/notificacoes/contagem"],
  ];
  const ops = await Promise.all(rotas.map(([m, c, b]) => req(m, c, b, OPS)));
  conferir("OPS recebe 403 em todas as rotas novas", ops.every((r) => r.status === 403), ops.map((r) => r.status));
  const cliente = await Promise.all(rotas.map(([m, c, b]) => req(m, c, b, CLIENTE)));
  conferir("cliente recebe 403", cliente.every((r) => r.status === 403), cliente.map((r) => r.status));
  const anonimo = await Promise.all(rotas.map(([m, c, b]) => req(m, c, b, null)));
  conferir("sem login, 401", anonimo.every((r) => r.status === 401), anonimo.map((r) => r.status));
  const admin = await req("GET", "/financeiro/contas-a-pagar");
  conferir("ADMIN lê (200)", admin.status === 200);
}

console.log("I. Avisos: central, e-mail, reexecução, queda, falhas e conta paga");
{
  // Só a conta deste cenário em 2029: as demais recorrências são encerradas.
  for (const id of todasCriadas) await chamar("recorrencias", "encerrar", id, ADMIN_ID, "2026-12-31").catch(() => null);
  await aux("POST", "/__contas/limpar-avisos", {});
  const arquivos = () => fs.readdirSync(EMAILS).filter((a) => a.endsWith(".json"));
  const lerEmail = (a) => JSON.parse(fs.readFileSync(path.join(EMAILS, a), "utf8"));

  const cfg = await req("PUT", "/avisos/configuracao", { marcos: [7, 3, 1, 0, -1], horaDoAviso: 8, emailAtivo: true, mostrarValorNoEmail: false });
  conferir("configuração salva", cfg.status === 200, cfg);

  // Destinatário com código.
  const dest = await req("POST", "/avisos/destinatarios", { email: "Financeiro@Exemplo.invalid", nome: "Financeiro" });
  conferir("destinatário cadastrado, e-mail em minúsculas, ainda não confirmado", dest.status === 201 && dest.json.email === "financeiro@exemplo.invalid" && dest.json.verificadoEm === null, dest.json);
  const dup = await req("POST", "/avisos/destinatarios", { email: "financeiro@exemplo.invalid" });
  conferir("o mesmo e-mail duas vezes: 409", dup.status === 409);
  const antesDoCodigo = arquivos().length;
  const cod = await req("POST", `/avisos/destinatarios/${dest.json.id}/codigo`);
  conferir("código enviado", cod.status === 201, cod);
  const emailDoCodigo = arquivos().map(lerEmail).find((e) => e.assunto.includes("código"));
  const codigo = emailDoCodigo?.texto.match(/\b(\d{6})\b/)?.[1];
  conferir("o código chegou por e-mail (e só ele foi gravado)", arquivos().length === antesDoCodigo + 1 && !!codigo);
  const deNovo = await req("POST", `/avisos/destinatarios/${dest.json.id}/codigo`);
  conferir("pedir outro código em menos de um minuto: 429", deNovo.status === 429);
  const errado = await req("POST", `/avisos/destinatarios/${dest.json.id}/confirmar`, { codigo: codigo === "000000" ? "111111" : "000000" });
  conferir("código errado é recusado", errado.status === 400);
  const certo = await req("POST", `/avisos/destinatarios/${dest.json.id}/confirmar`, { codigo });
  conferir("código certo confirma o endereço", certo.status === 201 && certo.json.confirmado === true, certo);
  const situacao = (await req("GET", "/avisos")).json;
  conferir("a API não devolve hash nem código", !JSON.stringify(situacao).includes("codigoHash") && !JSON.stringify(situacao).includes(codigo));
  conferir("a tela sabe que o e-mail está configurado", situacao.email.configurado === true && situacao.email.provedor === "arquivo");
  fs.readdirSync(EMAILS).forEach((a) => fs.unlinkSync(path.join(EMAILS, a)));

  const p = await criar("2029-03-01", { descricao: `Energia P ${suf}`, tipoDeValor: "VARIAVEL", valorPrevisto: 300, dataInicial: "2029-03-01" });
  const pid = p.recorrencia.id;
  let g = await gastos(pid);
  const marco = g.find((x) => x.competencia === "2029-03");
  const abril = g.find((x) => x.competencia === "2029-04");
  const notifs = async (gastoId) => aux("GET", `/__contas/notificacoes?gastoId=${gastoId}`);
  const envios = async () => aux("GET", "/__contas/envios");

  let t = await tarefa("2029-03-03T10:30:00Z");
  conferir("antes das 8h de Brasília, nenhum aviso", t.executou && t.notificacoesCriadas === 0 && (await notifs(marco.id)).length === 0, t);
  t = await tarefa("2029-03-03T11:30:00Z");
  let n = await notifs(marco.id);
  conferir("às 8h30, 7 dias antes: um aviso na central", n.length === 1 && n[0].marco === 7, n);
  let e = await envios();
  conferir("um e-mail para o destinatário confirmado", t.enviosCriados === 1 && t.despacho.enviados === 1 && arquivos().length === 1, t);
  const email1 = lerEmail(arquivos()[0]);
  conferir("o e-mail tem a conta e o prazo, sem valor (opção desligada)", email1.texto.includes(`Energia P ${suf}`) && email1.texto.includes("vence em 7 dias") && !email1.texto.includes("R$"), email1.texto);
  conferir("o assunto não traz a descrição", !email1.assunto.includes("Energia"), email1.assunto);
  conferir("a chave de idempotência é o id do envio", email1.chave === e[0].id);

  t = await tarefa("2029-03-03T11:30:00Z");
  conferir("rodar de novo na mesma hora: nada novo", t.notificacoesCriadas === 0 && t.enviosCriados === 0 && t.despacho.enviados === 0 && arquivos().length === 1, t);
  const [c1, c2] = await Promise.all([tarefa("2029-03-03T12:30:00Z"), tarefa("2029-03-03T12:30:00Z")]);
  conferir("duas execuções ao mesmo tempo: uma espera a outra", [c1.executou, c2.executou].filter(Boolean).length === 1 && [c1, c2].some((c) => c.motivo === "outra execução em andamento"), [c1, c2]);
  t = await tarefa("2029-03-04T11:30:00Z");
  conferir("no dia seguinte o mesmo marco não repete", (await notifs(marco.id)).length === 1 && arquivos().length === 1, t);
  t = await tarefa("2029-03-07T11:30:00Z");
  n = await notifs(marco.id);
  conferir("3 dias antes: segundo aviso e segundo e-mail", n.length === 2 && n[1].marco === 3 && arquivos().length === 2, n);

  // Central de notificações (sino).
  let central = (await req("GET", "/notificacoes")).json;
  conferir("central: dois avisos não lidos", central.naoLidas === 2, central);
  await req("POST", `/notificacoes/${central.itens[0].id}/lida`);
  conferir("marcar como lido baixa a contagem", (await req("GET", "/notificacoes/contagem")).json.naoLidas === 1);

  // Pagamento para os lembretes.
  await chamar("contas", "registrarPagamento", marco.id, { pagoEm: "2029-03-08", valor: 312.4 }, "2029-03-08");
  conferir("conta paga sai da contagem do sino", (await req("GET", "/notificacoes/contagem")).json.naoLidas === 0);
  t = await tarefa("2029-03-09T11:30:00Z");
  t = await tarefa("2029-03-10T11:30:00Z");
  t = await tarefa("2029-03-11T11:30:00Z");
  conferir("conta paga não recebe os avisos de 1 dia, do dia e de vencida", (await notifs(marco.id)).length === 2 && arquivos().length === 2);

  // Falha do provedor e retentativa com a mesma chave.
  t = await tarefa("2029-04-03T11:30:00Z", { falha: "503" });
  e = (await envios()).filter((x) => x.situacao !== "ENVIADO");
  conferir("provedor fora (503): fica para tentar de novo, sem e-mail", e.length === 1 && e[0].situacao === "FALHOU" && e[0].ultimoErro === "HTTP 503" && arquivos().length === 2, e);
  const assuntoCongelado = e[0].assunto;
  t = await tarefa("2029-04-03T11:35:00Z");
  conferir("antes do prazo da retentativa, espera", t.despacho.enviados === 0 && (await envios()).find((x) => x.id === e[0].id).situacao === "FALHOU", t);
  t = await tarefa("2029-04-03T11:46:00Z");
  const reenviado = (await envios()).find((x) => x.id === e[0].id);
  conferir("depois do prazo, envia — uma vez, o mesmo texto", reenviado.situacao === "ENVIADO" && reenviado.tentativas === 2 && reenviado.assunto === assuntoCongelado && arquivos().length === 3, reenviado);

  // Queda do processo depois de o provedor aceitar (antes de gravar "enviado").
  t = await tarefa("2029-04-07T11:30:00Z");
  let ultimo = (await envios()).at(-1);
  conferir("3 dias antes de abril: enviado", ultimo.situacao === "ENVIADO" && arquivos().length === 4, ultimo);
  await aux("POST", "/__contas/prender-envio", { id: ultimo.id, travadoAte: "2029-04-07T11:31:00Z", primeiraTentativaEm: "2029-04-07T11:30:00Z" });
  t = await tarefa("2029-04-07T12:00:00Z");
  ultimo = (await envios()).find((x) => x.id === ultimo.id);
  conferir(
    "retomado com a mesma chave: o provedor reconhece e não entrega de novo",
    t.despacho.retomados === 1 && ultimo.situacao === "ENVIADO" && arquivos().length === 4,
    { despacho: t.despacho, ultimo, arquivos: arquivos().length },
  );
  await aux("POST", "/__contas/prender-envio", { id: ultimo.id, travadoAte: "2029-04-07T12:01:00Z", primeiraTentativaEm: "2029-04-06T10:00:00Z" });
  t = await tarefa("2029-04-07T12:30:00Z");
  ultimo = (await envios()).find((x) => x.id === ultimo.id);
  conferir("preso há mais de 23h: marcado como incerto, não reenviado", ultimo.situacao === "INCERTO" && arquivos().length === 4, ultimo);

  // Falhas até esgotar, e erro definitivo.
  const horas = ["2029-04-09T11:30:00Z", "2029-04-09T11:46:00Z", "2029-04-09T12:47:00Z", "2029-04-09T16:48:00Z", "2029-04-10T00:49:00Z"];
  for (const h of horas) t = await tarefa(h, { falha: "503" });
  const esgotado = (await envios()).find((x) => x.dia === "2029-04-09");
  conferir("cinco tentativas com 503: esgotado, sem e-mail", esgotado?.situacao === "ESGOTADO" && esgotado.tentativas === 5 && arquivos().length === 4, esgotado);
  t = await tarefa("2029-04-10T11:30:00Z", { falha: "422" });
  const definitivo = (await envios()).find((x) => x.dia === "2029-04-10");
  conferir("erro definitivo (422): esgota na primeira", definitivo?.situacao === "ESGOTADO" && definitivo.tentativas === 1, definitivo);

  // Conta paga entre a falha e a retentativa: o lembrete não sai.
  t = await tarefa("2029-04-11T11:30:00Z", { falha: "503" });
  const pendente = (await envios()).find((x) => x.dia === "2029-04-11");
  await chamar("contas", "registrarPagamento", abril.id, { pagoEm: "2029-04-11", valor: 290 }, "2029-04-11");
  t = await tarefa("2029-04-11T11:50:00Z");
  const cancelado = (await envios()).find((x) => x.id === pendente.id);
  conferir("paga antes da retentativa: cancelado, sem e-mail", cancelado.situacao === "CANCELADO" && arquivos().length === 4, cancelado);

  // Valor no e-mail só quando ligado; e-mail desligado não envia.
  await req("PUT", "/avisos/configuracao", { marcos: [7, 3, 1, 0, -1], horaDoAviso: 8, emailAtivo: true, mostrarValorNoEmail: true });
  t = await tarefa("2029-05-03T11:30:00Z");
  const comValor = lerEmail(arquivos().sort().map((a) => [a, fs.statSync(path.join(EMAILS, a)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0]);
  conferir("com a opção ligada, o valor vai no e-mail", comValor.texto.includes("R$ 300,00"), comValor.texto);
  await req("PUT", "/avisos/configuracao", { marcos: [7, 3, 1, 0, -1], horaDoAviso: 8, emailAtivo: false, mostrarValorNoEmail: false });
  const antesDesligado = arquivos().length;
  t = await tarefa("2029-05-07T11:30:00Z");
  conferir("e-mail desligado: aviso na central, nenhum e-mail", t.notificacoesCriadas >= 1 && t.enviosCriados === 0 && arquivos().length === antesDesligado, t);
  t = await tarefa("2029-05-08T11:30:00Z", { semEmail: true });
  conferir("sem transporte configurado, a tarefa roda e o painel segue", t.executou === true && t.email === "desligado no painel", t);

  // Destinatário desativado não recebe; remover com histórico só desativa.
  const rem = await req("DELETE", `/avisos/destinatarios/${dest.json.id}`);
  conferir("remover quem já recebeu e-mail só desativa (histórico fica)", rem.json?.desativado === true, rem.json);

  // A tarefa como processo de verdade (o binário do serviço agendado).
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const binario = path.resolve(aqui, "../../dist/tarefas/contas-a-pagar.js");
  const proc = spawnSync(process.execPath, [binario], {
    env: { ...process.env, AVISOS_AGORA: "2029-05-09T11:30:00Z", AVISOS_EMAIL_PROVEDOR: "arquivo", AVISOS_EMAIL_DIRETORIO: EMAILS },
    encoding: "utf8",
  });
  const saida = `${proc.stdout}${proc.stderr}`;
  conferir("o serviço agendado roda e termina com sucesso", proc.status === 0 && saida.includes('"executou":true'), saida.slice(0, 400));
  conferir(
    "o log da tarefa só tem contagens (sem descrição, e-mail ou valor)",
    !saida.includes(suf) && !saida.includes("@") && !saida.includes("R$"),
    saida.slice(0, 400),
  );
  const execs = await aux("GET", "/__contas/execucoes");
  conferir("cada execução fica registrada com sucesso e resumo", execs.length > 0 && execs.every((x) => x.sucesso === true || x.sucesso === null), execs.at(-1));
}

console.log("J. Logs da API sem dados sensíveis");
{
  const log = LOG ? fs.readFileSync(LOG, "utf8") : "";
  conferir("o log do servidor não tem e-mail de destinatário nem código", !log.includes("financeiro@exemplo.invalid") && !/código.*\d{6}/i.test(log));
}

console.log(`\n${ok} conferências ok, ${falhas} falharam.`);
process.exit(falhas === 0 ? 0 : 1);
